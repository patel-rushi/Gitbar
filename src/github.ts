import type { PullRequest, GitHubUser, ReviewState, PipelineState } from './types'
import { isPullRequest } from './types'

const API_BASE = 'https://api.github.com'
const GRAPHQL_URL = 'https://api.github.com/graphql'

export class GitHubApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
}

async function checkResponse(res: Response): Promise<void> {
  if (res.ok) return
  if (res.status === 401) throw new GitHubApiError(401, 'Token expired or invalid')
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining === '0') {
      const reset = res.headers.get('x-ratelimit-reset')
      const resetDate = reset ? new Date(Number(reset) * 1000) : null
      const msg = resetDate
        ? `Rate limited — resets at ${resetDate.toLocaleTimeString()}`
        : 'Rate limited by GitHub'
      throw new GitHubApiError(403, msg)
    }
    const retryAfter = res.headers.get('retry-after')
    if (retryAfter) {
      throw new GitHubApiError(403, `GitHub is busy, showing cached PRs, retrying in ~${retryAfter}s`)
    }
    let bodyMessage = ''
    try {
      const json = await res.clone().json()
      bodyMessage = json?.message || ''
    } catch { /* body wasn't JSON */ }
    if (/secondary rate limit|abuse|rate limit|exceeded/i.test(bodyMessage)) {
      throw new GitHubApiError(403, 'GitHub search is temporarily busy — keeping cached PRs until next refresh')
    }
    throw new GitHubApiError(403, bodyMessage || 'GitHub denied request, token may be missing permission or SSO authorization')
  }
  throw new GitHubApiError(res.status, `GitHub API error (${res.status})`)
}

// GitHub's Search API enforces a much stricter "secondary" (abuse-detection) limit
// than the main REST quota (roughly 30 requests/minute), and it's especially sensitive
// to bursts (e.g. one search call per team member fired all at once). This limiter caps
// both how many search requests run at once and spaces them out with a minimum interval,
// so fan-outs get paced smoothly instead of tripping the secondary limit.
const SEARCH_MAX_CONCURRENT = 2
const SEARCH_MIN_INTERVAL_MS = 300
const SEARCH_RATE_LIMIT_PER_MINUTE = 20
const SEARCH_RATE_WINDOW_MS = 60_000
let activeSearchRequests = 0
let lastSearchStartTime = 0
const searchCallTimestamps: number[] = []

function acquireSearchSlot(): Promise<void> {
  return new Promise(resolve => {
    const tryAcquire = () => {
      const now = Date.now()
      const cutoff = now - SEARCH_RATE_WINDOW_MS
      while (searchCallTimestamps.length && searchCallTimestamps[0] < cutoff) searchCallTimestamps.shift()

      const timeSinceLast = now - lastSearchStartTime
      if (
        activeSearchRequests < SEARCH_MAX_CONCURRENT &&
        searchCallTimestamps.length < SEARCH_RATE_LIMIT_PER_MINUTE &&
        timeSinceLast >= SEARCH_MIN_INTERVAL_MS
      ) {
        activeSearchRequests++
        lastSearchStartTime = Date.now()
        searchCallTimestamps.push(Date.now())
        resolve()
      } else {
        const wait = Math.max(50, SEARCH_MIN_INTERVAL_MS - timeSinceLast)
        setTimeout(tryAcquire, wait)
      }
    }
    tryAcquire()
  })
}

function releaseSearchSlot() {
  activeSearchRequests--
}

async function searchFetch(url: string, token: string): Promise<Response> {
  await acquireSearchSlot()
  try {
    return await fetch(url, { headers: headers(token) })
  } finally {
    releaseSearchSlot()
  }
}

// Cached fetcher with TTL
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

interface CachedList {
  data: string[]
  fetchedAt: number
}

function getCached(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const cached: CachedList = JSON.parse(raw)
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return null
    return cached.data
  } catch {
    return null
  }
}

function setCache(key: string, data: string[]) {
  localStorage.setItem(key, JSON.stringify({ data, fetchedAt: Date.now() }))
}

// Search results already carry `updated_at`, so a PR whose timestamp is unchanged since
// the last poll cannot have new reviews, checks or comments. Keying enrichment on it lets
// repeat polls skip those per-PR requests entirely without ever showing stale data.
const ENRICHMENT_CACHE_MAX = 400
const enrichmentCache = new Map<string, unknown>()

function enrichmentKey(field: string, pr: PullRequest): string {
  return `${field}:${pr.repo_full_name}#${pr.number}@${pr.updated_at}`
}

async function cachedEnrichment<T>(key: string, compute: () => Promise<T | undefined>): Promise<T | undefined> {
  if (enrichmentCache.has(key)) return enrichmentCache.get(key) as T
  const value = await compute()
  if (value === undefined) return undefined // failed lookup: retry next poll rather than cache a gap
  if (enrichmentCache.size >= ENRICHMENT_CACHE_MAX) {
    const oldest = enrichmentCache.keys().next().value
    if (oldest !== undefined) enrichmentCache.delete(oldest)
  }
  enrichmentCache.set(key, value)
  return value
}

// Same freshness trick for the comment endpoints, which cost 3 requests per PR.
const commentCache = new Map<string, { updatedAt: string; activities: CommentActivity[] }>()

function splitByCommentFreshness(scope: string, prs: PullRequest[]) {
  const fresh: CommentActivity[] = []
  const stale: PullRequest[] = []
  for (const pr of prs) {
    const entry = commentCache.get(`${scope}:${pr.repo_full_name}#${pr.number}`)
    if (entry && entry.updatedAt === pr.updated_at) fresh.push(...entry.activities)
    else stale.push(pr)
  }
  return { fresh, stale }
}

function rememberComments(scope: string, pr: PullRequest, activities: CommentActivity[]) {
  if (commentCache.size >= ENRICHMENT_CACHE_MAX) {
    const oldest = commentCache.keys().next().value
    if (oldest !== undefined) commentCache.delete(oldest)
  }
  commentCache.set(`${scope}:${pr.repo_full_name}#${pr.number}`, { updatedAt: pr.updated_at, activities })
}

export async function fetchRepoLabels(token: string, owner: string, repo: string): Promise<string[]> {
  const cacheKey = `gitbar_cache_labels_${owner}_${repo}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/labels?per_page=100`, { headers: headers(token) })
    if (!res.ok) return []
    const labels: any[] = await res.json()
    const names = labels.map(l => l.name)
    setCache(cacheKey, names)
    return names
  } catch {
    return []
  }
}

export async function fetchOrgRepos(token: string, org: string): Promise<string[]> {
  const cacheKey = `gitbar_cache_repos_${org}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${API_BASE}/orgs/${org}/repos?per_page=100&sort=updated`, { headers: headers(token) })
    if (!res.ok) return []
    const repos: any[] = await res.json()
    const names = repos.map(r => r.full_name)
    setCache(cacheKey, names)
    return names
  } catch {
    return []
  }
}

export async function fetchOrgMembers(token: string, org: string): Promise<string[]> {
  const cacheKey = `gitbar_cache_members_${org}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${API_BASE}/orgs/${org}/members?per_page=100`, { headers: headers(token) })
    if (!res.ok) return []
    const members: any[] = await res.json()
    const logins = members.map(m => m.login)
    setCache(cacheKey, logins)
    return logins
  } catch {
    return []
  }
}

export async function fetchAllOrgTeamSlugs(token: string, org: string): Promise<string[]> {
  const cacheKey = `gitbar_cache_teams_${org}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${API_BASE}/orgs/${org}/teams?per_page=100`, { headers: headers(token) })
    if (!res.ok) return []
    const teams: any[] = await res.json()
    const slugs = teams.map(t => `${org}/${t.slug}`)
    setCache(cacheKey, slugs)
    return slugs
  } catch {
    return []
  }
}

// `/orgs/{org}/members` only lists members with public visibility (or all members if
// the token belongs to an org owner), so typing a valid colleague's login often finds
// nothing there. This falls back to a live GitHub-wide username search so any login
// prefix match still shows up while typing.
export async function searchGitHubUsernames(token: string, query: string): Promise<string[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  try {
    const q = encodeURIComponent(`${trimmed} in:login type:user`)
    const res = await searchFetch(`${API_BASE}/search/users?q=${q}&per_page=10`, token)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items || []).map((u: any) => u.login)
  } catch {
    return []
  }
}


export async function validateToken(token: string): Promise<GitHubUser | null> {
  try {
    const res = await fetch(`${API_BASE}/user`, { headers: headers(token) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function extractRepoFullName(repoUrl: string): string {
  const match = repoUrl.match(/repos\/(.+)$/)
  return match ? match[1] : ''
}

function mapSearchItem(item: any): PullRequest {
  return {
    id: item.id,
    number: item.number,
    title: item.title,
    html_url: item.html_url,
    state: item.state,
    draft: item.draft || false,
    merged_at: item.pull_request?.merged_at || null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    user: {
      login: item.user.login,
      avatar_url: item.user.avatar_url,
      html_url: item.user.html_url
    },
    repository_url: item.repository_url,
    repo_full_name: extractRepoFullName(item.repository_url),
    labels: (item.labels || []).map((l: any) => ({ name: l.name, color: l.color })),
    requested_reviewers: [],
    comments: item.comments || 0,
    review_comments: 0
  }
}

export async function fetchMyPRs(token: string, username: string): Promise<PullRequest[]> {
  const q = encodeURIComponent(`is:pr is:open author:${username} -draft:true`)
  const res = await searchFetch(
    `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
    token
  )
  await checkResponse(res)
  const data = await res.json()
  return (data.items || []).map(mapSearchItem)
}

export async function fetchReviewedPRs(token: string, username: string): Promise<PullRequest[]> {
  // `reviewed-by` only matches formal reviews; `commenter` also catches PRs where
  // you left a plain conversation comment. Union both so either counts as "reviewed by me".
  const queries = [
    `is:pr is:open reviewed-by:${username} -author:${username}`,
    `is:pr is:open commenter:${username} -author:${username}`
  ]
  const responses = await Promise.allSettled(
    queries.map(async q => {
      const res = await searchFetch(
        `${API_BASE}/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=30`,
        token
      )
      await checkResponse(res)
      return res
    })
  )

  // One half failing still leaves a useful list; only a total failure is worth raising.
  const ok = responses.filter(r => r.status === 'fulfilled')
  if (ok.length === 0) throw (responses[0] as PromiseRejectedResult).reason

  const seen = new Set<number>()
  const prs: PullRequest[] = []
  for (const res of ok) {
    const data = await (res as PromiseFulfilledResult<Response>).value.json()
    for (const item of data.items || []) {
      const pr = mapSearchItem(item)
      if (!seen.has(pr.id)) {
        seen.add(pr.id)
        prs.push(pr)
      }
    }
  }

  return prs.sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

// Authors of PRs you're actively involved in (commented on, reviewed, or otherwise
// participate in) — a proxy for "people you work with" for the filter suggestions.
// Cached like team lookups: this doesn't change minute to minute, so no need to
// re-run two search queries every time the filter panel opens.
export async function fetchFrequentCollaborators(token: string, username: string): Promise<string[]> {
  const cacheKey = `gitbar_cache_collaborators_${username}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const queries = [
    `is:pr involves:${username} -author:${username}`,
    `is:pr commenter:${username} -author:${username}`
  ]
  const responses = await Promise.allSettled(
    queries.map(q =>
      searchFetch(
        `${API_BASE}/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=30`,
        token
      )
    )
  )

  const counts = new Map<string, number>()
  let anyOk = false
  for (const result of responses) {
    if (result.status !== 'fulfilled' || !result.value.ok) continue
    anyOk = true
    const data = await result.value.json()
    for (const item of data.items || []) {
      const login = item.user?.login
      if (!login || login === username || login.endsWith('[bot]')) continue
      counts.set(login, (counts.get(login) || 0) + 1)
    }
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([login]) => login)
  // Both queries failing (usually a rate limit) must not cache an empty list, or the
  // suggestions stay hidden for the whole TTL.
  if (anyOk) setCache(cacheKey, sorted)
  return sorted
}

export const REVIEW_REQUESTED_PAGE_SIZE = 25
export const REVIEW_REQUESTED_MAX_PAGES = 4

export interface ReviewRequestedResult {
  prs: PullRequest[]
  hasMore: boolean
}

async function runPRSearch(
  token: string,
  query: string,
  page: number
): Promise<{ prs: PullRequest[]; totalCount: number }> {
  const res = await searchFetch(
    `${API_BASE}/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc` +
      `&per_page=${REVIEW_REQUESTED_PAGE_SIZE}&page=${page}`,
    token
  )
  await checkResponse(res)
  const data = await res.json()
  return {
    prs: (data.items || []).map(mapSearchItem),
    totalCount: typeof data.total_count === 'number' ? data.total_count : 0
  }
}

// GitHub ORs a repeated qualifier, so every author (or team, or org) fits in one request
// instead of one request each. A 422 means the query was rejected — most often because a
// listed user or team doesn't exist — so retry in halves to isolate the bad one and drop
// only it. Never split on a rate limit: that would only add requests.
async function runBatchedSearch(
  token: string,
  base: string,
  qualifiers: string[],
  page: number
): Promise<{ prs: PullRequest[]; totalCount: number }> {
  if (qualifiers.length === 0) return { prs: [], totalCount: 0 }
  try {
    return await runPRSearch(token, `${base} ${qualifiers.join(' ')}`, page)
  } catch (err) {
    if (!(err instanceof GitHubApiError) || err.status !== 422) throw err
    // Narrowed to a single bad qualifier: skip it so one typo can't empty the whole list.
    if (qualifiers.length === 1) return { prs: [], totalCount: 0 }
    const mid = Math.ceil(qualifiers.length / 2)
    const [left, right] = await Promise.all([
      runBatchedSearch(token, base, qualifiers.slice(0, mid), page),
      runBatchedSearch(token, base, qualifiers.slice(mid), page)
    ])
    return {
      prs: [...left.prs, ...right.prs],
      totalCount: Math.max(left.totalCount, right.totalCount)
    }
  }
}

export async function fetchReviewRequestedPRs(
  token: string,
  username: string,
  filterTargets?: string[],
  pageCount = 1
): Promise<ReviewRequestedResult> {
  const targets = filterTargets || []
  const teams = targets.filter(t => t.includes('/'))
  // Your own entry means "review asked of me directly", not "PRs I wrote", so it needs
  // its own qualifier and can't be OR'd into the author batch.
  const self = targets.find(t => !t.includes('/') && t.toLowerCase() === username.toLowerCase())
  const authors = targets.filter(t => !t.includes('/') && t !== self)
  const pages = Array.from(
    { length: Math.min(Math.max(pageCount, 1), REVIEW_REQUESTED_MAX_PAGES) },
    (_, i) => i + 1
  )

  const base = 'is:pr is:open draft:false'
  const groups: { base: string; qualifiers: string[] }[] = []

  if (targets.length === 0) {
    // `review-requested:` covers both requests aimed at you and ones routed to a team
    // you belong to, which is exactly the default queue.
    groups.push({ base, qualifiers: [`review-requested:${username}`] })
  } else {
    if (authors.length > 0) groups.push({ base, qualifiers: authors.map(a => `author:${a}`) })
    if (teams.length > 0) {
      groups.push({ base, qualifiers: teams.map(t => `team-review-requested:${t}`) })
    }
    if (self) groups.push({ base, qualifiers: [`user-review-requested:${self}`] })
  }

  const results = await Promise.all(
    groups.flatMap(group => pages.map(page => runBatchedSearch(token, group.base, group.qualifiers, page)))
  )

  const seenIds = new Set<number>()
  const allPRs: PullRequest[] = []
  for (const result of results) {
    for (const pr of result.prs) {
      if (seenIds.has(pr.id)) continue
      seenIds.add(pr.id)
      allPRs.push(pr)
    }
  }

  return {
    prs: allPRs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    hasMore:
      pages.length < REVIEW_REQUESTED_MAX_PAGES &&
      results.some(r => r.totalCount > pages.length * REVIEW_REQUESTED_PAGE_SIZE)
  }
}

export async function fetchDraftPRs(token: string, username: string): Promise<PullRequest[]> {
  const q = encodeURIComponent(`is:pr is:open draft:true author:${username}`)
  const res = await searchFetch(
    `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
    token
  )
  await checkResponse(res)
  const data = await res.json()
  return (data.items || []).map(mapSearchItem)
}

export async function fetchMyReviewState(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  username: string
): Promise<ReviewState | undefined> {
  try {
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`,
      { headers: headers(token) }
    )
    if (!res.ok) return undefined
    const reviews: any[] = await res.json()
    const myReviews = reviews.filter(r => r.user?.login === username)
    if (myReviews.length === 0) return null
    const latest = myReviews[myReviews.length - 1]
    return latest.state as ReviewState
  } catch {
    return undefined
  }
}

export async function enrichWithReviewState(
  token: string,
  prs: PullRequest[],
  username: string
): Promise<PullRequest[]> {
  const results = await Promise.allSettled(
    prs.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return pr
      const state = await cachedEnrichment(
        enrichmentKey('myReview', pr),
        () => fetchMyReviewState(token, owner, repo, pr.number, username)
      )
      if (state === undefined) return pr
      return { ...pr, myReviewState: state }
    })
  )
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : prs[i])
}

async function fetchIncomingReviewSummary(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  authorLogin: string
): Promise<{ state: ReviewState; approvedBy: string[] } | undefined> {
  try {
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`,
      { headers: headers(token) }
    )
    if (!res.ok) return undefined
    const reviews: any[] = await res.json()

    const latestByReviewer = new Map<string, { state: string; submittedAt: string }>()
    for (const r of reviews) {
      const login = r.user?.login
      if (!login || login === authorLogin) continue
      const state = r.state as string
      // Skip pure COMMENTED entries that come after an actionable review on the same reviewer
      const existing = latestByReviewer.get(login)
      if (state === 'APPROVED' || state === 'CHANGES_REQUESTED' || state === 'DISMISSED') {
        latestByReviewer.set(login, { state, submittedAt: r.submitted_at })
      } else if (!existing && state === 'COMMENTED') {
        latestByReviewer.set(login, { state, submittedAt: r.submitted_at })
      }
    }

    const states = Array.from(latestByReviewer.entries())
    const approvedBy = states.filter(([, v]) => v.state === 'APPROVED').map(([login]) => login)
    const changesRequested = states.some(([, v]) => v.state === 'CHANGES_REQUESTED')

    if (changesRequested) return { state: 'CHANGES_REQUESTED', approvedBy }
    if (approvedBy.length > 0) return { state: 'APPROVED', approvedBy }
    if (states.some(([, v]) => v.state === 'COMMENTED')) return { state: 'COMMENTED', approvedBy }
    return { state: null, approvedBy }
  } catch {
    return undefined
  }
}

export async function enrichWithIncomingReviewState(
  token: string,
  prs: PullRequest[]
): Promise<PullRequest[]> {
  const results = await Promise.allSettled(
    prs.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return pr
      const summary = await cachedEnrichment(
        enrichmentKey('incomingReview', pr),
        () => fetchIncomingReviewSummary(token, owner, repo, pr.number, pr.user.login)
      )
      if (!summary) return pr
      return { ...pr, incomingReviewState: summary.state, approvedBy: summary.approvedBy }
    })
  )
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : prs[i])
}

function toPipelineState(state: string | null | undefined): PipelineState {
  if (!state) return 'NONE'
  if (state === 'SUCCESS') return 'SUCCESS'
  if (state === 'FAILURE' || state === 'ERROR') return 'FAILURE'
  if (state === 'PENDING' || state === 'EXPECTED') return 'PENDING'
  return 'NONE'
}

async function fetchPipelineState(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PipelineState | undefined> {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
        }
      }
    }
  `

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        ...headers(token),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: { owner, repo, number: prNumber } })
    })
    if (!res.ok) return undefined

    const data = await res.json()
    const state = data?.data?.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state
    return toPipelineState(typeof state === 'string' ? state : null)
  } catch {
    return undefined
  }
}

export async function enrichWithPipelineState(
  token: string,
  prs: PullRequest[]
): Promise<PullRequest[]> {
  const results = await Promise.allSettled(
    prs.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return pr
      const pipelineState = await cachedEnrichment(
        enrichmentKey('pipeline', pr),
        () => fetchPipelineState(token, owner, repo, pr.number)
      )
      if (pipelineState === undefined) return pr
      return { ...pr, pipelineState }
    })
  )

  return results.map((r, i) => r.status === 'fulfilled' ? r.value : prs[i])
}

import type { CommentActivity } from './types'

export async function fetchCommentsOnMyPRs(
  token: string,
  prs: PullRequest[],
  username: string
): Promise<CommentActivity[]> {
  const recentPRs = prs.slice(0, 5)
  if (recentPRs.length === 0) return []

  const { fresh, stale } = splitByCommentFreshness('myPRs', recentPRs)

  const results = await Promise.allSettled(
    stale.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return []

      const [reviewCommentsRes, issueRes, reviewsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr.number}/comments?per_page=50&sort=created&direction=desc`, { headers: headers(token) }),
        fetch(`${API_BASE}/repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=50&sort=created&direction=desc`, { headers: headers(token) }),
        fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr.number}/reviews?per_page=50`, { headers: headers(token) })
      ])

      const activities: CommentActivity[] = []
      const pushComment = (idKey: string | number, c: any, createdAt: string) => {
        if (!c.user || c.user.login === username) return
        activities.push({
          id: `${pr.repo_full_name}-${pr.number}-${idKey}`,
          prNumber: pr.number,
          prTitle: pr.title,
          prRepoFullName: pr.repo_full_name,
          prHtmlUrl: pr.html_url,
          comment: {
            id: c.id,
            user: { login: c.user.login, avatar_url: c.user.avatar_url, html_url: c.user.html_url },
            body: c.body,
            html_url: c.html_url,
            created_at: createdAt
          },
          read: false
        } as CommentActivity)
      }

      // Inline review comments + conversation comments
      if (reviewCommentsRes.status === 'fulfilled' && reviewCommentsRes.value.ok) {
        for (const c of await reviewCommentsRes.value.json()) pushComment(c.id, c, c.created_at)
      }
      if (issueRes.status === 'fulfilled' && issueRes.value.ok) {
        for (const c of await issueRes.value.json()) pushComment(c.id, c, c.created_at)
      }
      // Review summary bodies (the "Comment"/"Approve" reviews that include a note)
      if (reviewsRes.status === 'fulfilled' && reviewsRes.value.ok) {
        for (const r of await reviewsRes.value.json()) {
          if ((r.body || '').trim()) pushComment(`review-${r.id}`, r, r.submitted_at || r.created_at || new Date().toISOString())
        }
      }

      const anyOk = [reviewCommentsRes, issueRes, reviewsRes]
        .some(r => r.status === 'fulfilled' && r.value.ok)
      return anyOk ? activities : null
    })
  )

  const all: CommentActivity[] = [...fresh]
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled' || r.value === null) continue
    rememberComments('myPRs', stale[i], r.value)
    all.push(...r.value)
  }
  return all.sort((a, b) =>
    new Date(b.comment.created_at).getTime() - new Date(a.comment.created_at).getTime()
  ).slice(0, 50)
}

function normalizeText(s: string): string {
  return (s || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// GitHub "Quote reply" inserts the original comment as a leading blockquote.
// Return the combined text of all blockquoted lines so we can match it against
// the logged-in user's own comments.
function extractQuotedText(body: string): string {
  return (body || '')
    .split('\n')
    .filter(l => /^\s*>/.test(l))
    .map(l => l.replace(/^\s*>+\s?/, ''))
    .join(' ')
}

function toReplyActivity(pr: PullRequest, c: any, parent: any): CommentActivity {
  return {
    id: `${pr.repo_full_name}-${pr.number}-${c.id}`,
    prNumber: pr.number,
    prTitle: pr.title,
    prRepoFullName: pr.repo_full_name,
    prHtmlUrl: pr.html_url,
    myComment: { body: parent.body, html_url: parent.html_url },
    comment: {
      id: c.id,
      user: { login: c.user.login, avatar_url: c.user.avatar_url, html_url: c.user.html_url },
      body: c.body,
      html_url: c.html_url,
      created_at: c.created_at
    },
    read: false
  } as CommentActivity
}

export async function fetchRepliesToMyComments(
  token: string,
  prs: PullRequest[],
  username: string
): Promise<CommentActivity[]> {
  const recentPRs = prs.slice(0, 10)
  if (recentPRs.length === 0) return []

  const { fresh, stale } = splitByCommentFreshness('replies', recentPRs)

  const results = await Promise.allSettled(
    stale.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return []

      const [inlineRes, issueRes, reviewsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr.number}/comments?per_page=100`, { headers: headers(token) }),
        fetch(`${API_BASE}/repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=100`, { headers: headers(token) }),
        fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr.number}/reviews?per_page=100`, { headers: headers(token) })
      ])

      const out: CommentActivity[] = []

      // Threaded replies to my inline review comments
      if (inlineRes.status === 'fulfilled' && inlineRes.value.ok) {
        const comments: any[] = await inlineRes.value.json()
        const myCommentIds = new Map<number, any>()
        for (const c of comments) {
          if (c.user?.login === username) myCommentIds.set(c.id, c)
        }
        if (myCommentIds.size > 0) {
          for (const c of comments) {
            if (c.in_reply_to_id && myCommentIds.has(c.in_reply_to_id) && c.user?.login !== username) {
              out.push(toReplyActivity(pr, c, myCommentIds.get(c.in_reply_to_id)!))
            }
          }
        }
      }

      // Direct quote replies to me. My "comment" can be a conversation (issue)
      // comment OR a review summary body (the "Comment" review). Show a later
      // conversation comment from someone else only when it actually quotes one
      // of my comments (GitHub "Quote reply"); ignore unrelated comments.
      const issueComments: any[] = (issueRes.status === 'fulfilled' && issueRes.value.ok)
        ? await issueRes.value.json() : []
      const reviews: any[] = (reviewsRes.status === 'fulfilled' && reviewsRes.value.ok)
        ? await reviewsRes.value.json() : []

      const myBodies: { body: string; html_url: string; norm: string }[] = []
      for (const c of issueComments) {
        if (c.user?.login === username && (c.body || '').trim()) {
          myBodies.push({ body: c.body, html_url: c.html_url, norm: normalizeText(c.body) })
        }
      }
      for (const r of reviews) {
        if (r.user?.login === username && (r.body || '').trim()) {
          myBodies.push({ body: r.body, html_url: r.html_url, norm: normalizeText(r.body) })
        }
      }

      if (myBodies.length > 0) {
        for (const c of issueComments) {
          if (c.user?.login === username) continue
          const quoted = normalizeText(extractQuotedText(c.body))
          if (quoted.length < 8) continue
          const match = myBodies.find(mb =>
            mb.norm.length >= 8 && (quoted.includes(mb.norm) || mb.norm.includes(quoted))
          )
          if (match) {
            out.push(toReplyActivity(pr, c, { body: match.body, html_url: match.html_url }))
          }
        }
      }

      const anyOk = [inlineRes, issueRes, reviewsRes]
        .some(r => r.status === 'fulfilled' && r.value.ok)
      return anyOk ? out : null
    })
  )

  const all: CommentActivity[] = [...fresh]
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled' || r.value === null) continue
    rememberComments('replies', stale[i], r.value)
    all.push(...r.value)
  }
  return all.sort((a, b) =>
    new Date(b.comment.created_at).getTime() - new Date(a.comment.created_at).getTime()
  ).slice(0, 50)
}

export interface GitHubNotification {
  id: string
  reason: string
  subject: {
    title: string
    url: string
    type: string
    latest_comment_url: string | null
  }
  repository: {
    full_name: string
    html_url: string
  }
  updated_at: string
  unread: boolean
}

export async function fetchNotifications(token: string, since?: string): Promise<GitHubNotification[]> {
  let url = `${API_BASE}/notifications?participating=true&per_page=50`
  if (since) {
    url += `&since=${since}`
  }
  const res = await fetch(url, { headers: headers(token) })
  await checkResponse(res)
  return await res.json()
}

export async function fetchCommentUrl(token: string, url: string): Promise<any> {
  try {
    const res = await fetch(url, { headers: headers(token) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchTeamMembers(token: string, org: string, teamSlug: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE}/orgs/${org}/teams/${teamSlug}/members?per_page=100`,
      { headers: headers(token) }
    )
    if (!res.ok) return []
    const members: any[] = await res.json()
    return members.map(m => m.login)
  } catch {
    return []
  }
}

export async function fetchSquadActivity(
  token: string,
  username: string,
  selectedTeams: string[]
): Promise<PullRequest[]> {
  if (!selectedTeams.length) return []

  // Fetch members of all selected teams
  const memberSets = await Promise.allSettled(
    selectedTeams.map(team => {
      const [org, slug] = team.split('/')
      return fetchTeamMembers(token, org, slug)
    })
  )

  const allMembers = new Set<string>()
  for (const result of memberSets) {
    if (result.status === 'fulfilled') {
      result.value.forEach(m => allMembers.add(m))
    }
  }
  allMembers.delete(username)

  if (allMembers.size === 0) return []

  const allPRs: PullRequest[] = []
  const seenIds = new Set<number>()

  // Query PRs each teammate is involved in (recent activity)
  const fetches = Array.from(allMembers).map(member => {
    const q = encodeURIComponent(`is:pr is:open involves:${member} -author:${username}`)
    return searchFetch(
      `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=10`,
      token
    )
  })

  const responses = await Promise.allSettled(fetches)

  for (const result of responses) {
    if (result.status === 'rejected') continue
    const res = result.value
    if (!res.ok) continue
    const data = await res.json()
    for (const item of data.items || []) {
      const pr = mapSearchItem(item)
      if (!seenIds.has(pr.id)) {
        seenIds.add(pr.id)
        allPRs.push(pr)
      }
    }
  }

  return allPRs.sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  ).slice(0, 30)
}

export interface TeamInfo {
  slug: string
  org: string
  name: string
  fullSlug: string
}

export async function fetchUserTeams(token: string): Promise<TeamInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/user/teams?per_page=100`, { headers: headers(token) })
    if (!res.ok) return []
    const teams: any[] = await res.json()
    return teams.map(t => ({
      slug: t.slug,
      org: t.organization.login,
      name: t.name || t.slug,
      fullSlug: `${t.organization.login}/${t.slug}`
    }))
  } catch {
    return []
  }
}

export async function fetchUserOrgs(token: string): Promise<string[]> {
  const cacheKey = 'gitbar_cache_user_orgs'
  const cached = getCached(cacheKey)
  if (cached) return cached
  try {
    const res = await fetch(`${API_BASE}/user/orgs?per_page=100`, { headers: headers(token) })
    if (!res.ok) return []
    const orgs: any[] = await res.json()
    const logins = orgs.map(o => o.login)
    setCache(cacheKey, logins)
    return logins
  } catch {
    return []
  }
}

export async function fetchOrgTeams(token: string, org: string): Promise<TeamInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/orgs/${org}/teams?per_page=100`, { headers: headers(token) })
    if (!res.ok) return []
    const teams: any[] = await res.json()
    return teams.map(t => ({
      slug: t.slug,
      org,
      name: t.name || t.slug,
      fullSlug: `${org}/${t.slug}`
    }))
  } catch {
    return []
  }
}

// Returns a Map<reviewCommentId, isResolved> built from GraphQL reviewThreads.
// Only review-thread (inline code) comments appear in the map; issue-level PR
// comments cannot be resolved on GitHub and are absent (treated as unresolved).
export async function fetchResolvedThreadMap(
  token: string,
  prs: PullRequest[]
): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>()
  if (prs.length === 0) return map

  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
              comments(first: 100) { nodes { databaseId } }
            }
          }
        }
      }
    }
  `

  const results = await Promise.allSettled(
    prs.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return null
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          ...headers(token),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables: { owner, repo, number: pr.number } })
      })
      if (!res.ok) return null
      const data = await res.json()
      const threads = data?.data?.repository?.pullRequest?.reviewThreads?.nodes
      return Array.isArray(threads) ? threads : null
    })
  )

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    for (const thread of r.value) {
      const isResolved = !!thread?.isResolved
      const nodes = thread?.comments?.nodes
      if (!Array.isArray(nodes)) continue
      for (const c of nodes) {
        if (typeof c?.databaseId === 'number') {
          map.set(c.databaseId, isResolved)
        }
      }
    }
  }

  return map
}

export async function fetchFilteredPRs(
  token: string,
  filter: { labels?: string[]; repos?: string[]; authors?: string[]; query?: string }
): Promise<PullRequest[]> {
  const raw = (filter.query || '').trim()
  const hasType = /\bis:(pr|issue)\b/i.test(raw)
  const hasState = /(\bis:(open|closed|merged)\b|\bstate:)/i.test(raw)

  const parts: string[] = []
  if (!hasType) parts.push('is:pr')
  if (!hasState) parts.push('is:open')

  if (filter.repos?.length) {
    filter.repos.forEach(r => parts.push(`repo:${r}`))
  }
  if (filter.labels?.length) {
    filter.labels.forEach(l => parts.push(`label:"${l}"`))
  }
  if (filter.authors?.length) {
    filter.authors.forEach(a => parts.push(`author:${a}`))
  }
  if (raw) {
    parts.push(raw)
  }

  const q = encodeURIComponent(parts.join(' '))
  const res = await searchFetch(
    `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
    token
  )
  await checkResponse(res)
  const data = await res.json()
  return (data.items || []).map(mapSearchItem)
}

const RELEASE_REPO = 'patel-rushi/Gitbar'

export async function fetchReleaseNotes(
  token: string,
  version: string
): Promise<string | null> {
  const tag = version.startsWith('v') ? version : `v${version}`
  try {
    const res = await fetch(
      `${API_BASE}/repos/${RELEASE_REPO}/releases/tags/${tag}`,
      { headers: token ? headers(token) : { Accept: 'application/vnd.github.v3+json' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.body === 'string' ? data.body : null
  } catch {
    return null
  }
}
