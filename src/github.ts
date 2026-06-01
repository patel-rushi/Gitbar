import type { PullRequest, GitHubUser, ReviewState } from './types'

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
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining === '0') {
      const reset = res.headers.get('x-ratelimit-reset')
      const resetDate = reset ? new Date(Number(reset) * 1000) : null
      const msg = resetDate
        ? `Rate limited — resets at ${resetDate.toLocaleTimeString()}`
        : 'Rate limited by GitHub'
      throw new GitHubApiError(403, msg)
    }
    throw new GitHubApiError(403, 'Access denied')
  }
  throw new GitHubApiError(res.status, `GitHub API error (${res.status})`)
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
  const res = await fetch(
    `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
    { headers: headers(token) }
  )
  await checkResponse(res)
  const data = await res.json()
  return (data.items || []).map(mapSearchItem)
}

export async function fetchReviewedPRs(token: string, username: string): Promise<PullRequest[]> {
  const q = encodeURIComponent(`is:pr is:open reviewed-by:${username} -author:${username}`)
  const res = await fetch(
    `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
    { headers: headers(token) }
  )
  await checkResponse(res)
  const data = await res.json()
  return (data.items || []).map(mapSearchItem)
}

export async function fetchReviewRequestedPRs(
  token: string,
  username: string,
  filterTargets?: string[],
  userTeams?: string[],
  teamMembers?: string[]
): Promise<PullRequest[]> {
  const targets = filterTargets?.length ? filterTargets : [username]

  const selectedTeams = targets.filter(t => t.includes('/'))
  const selectedUsers = targets.filter(t => !t.includes('/'))

  const allPRs: PullRequest[] = []
  const seenIds = new Set<number>()

  // For team targets, use team-review-requested (clean, no noise)
  const teamFetches = selectedTeams.map(team => {
    const q = encodeURIComponent(`is:pr is:open draft:false team-review-requested:${team}`)
    return fetch(
      `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
      { headers: headers(token) }
    )
  })

  // For user targets, exclude PRs that are only there via non-selected teams
  const excludedTeams = (userTeams || []).filter(t => !selectedTeams.includes(t))
  const userFetches = selectedUsers.map(user => {
    const exclusions = excludedTeams.map(t => `-team-review-requested:${t}`).join(' ')
    const q = encodeURIComponent(`is:pr is:open draft:false review-requested:${user} ${exclusions}`.trim())
    return fetch(
      `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
      { headers: headers(token) }
    )
  })

  const responses = await Promise.allSettled([...teamFetches, ...userFetches])

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
  )
}

const TEAMMATE_PR_CACHE_TTL = 5 * 60 * 1000

export async function fetchTeammatePRs(
  token: string,
  username: string,
  teamMembers: string[]
): Promise<PullRequest[]> {
  const cacheKey = 'gitbar_cache_teammate_prs'
  const cached = getCached(cacheKey)
  if (cached) {
    try { return JSON.parse(localStorage.getItem(cacheKey + '_full') || '[]') } catch { /* fall through */ }
  }

  const teammates = teamMembers.filter(m => m !== username)
  if (teammates.length === 0) return []

  const allPRs: PullRequest[] = []
  const seenIds = new Set<number>()

  const fetches = teammates.map(member => {
    const q = encodeURIComponent(`is:pr is:open author:${member} review:required draft:false`)
    return fetch(
      `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=10`,
      { headers: headers(token) }
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

  const sorted = allPRs.sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )

  setCache(cacheKey, ['cached'])
  localStorage.setItem(cacheKey + '_full', JSON.stringify(sorted))
  return sorted
}

export async function fetchDraftPRs(token: string, username: string): Promise<PullRequest[]> {
  const q = encodeURIComponent(`is:pr is:open draft:true author:${username}`)
  const res = await fetch(
    `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
    { headers: headers(token) }
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
): Promise<ReviewState> {
  try {
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`,
      { headers: headers(token) }
    )
    if (!res.ok) return null
    const reviews: any[] = await res.json()
    const myReviews = reviews.filter(r => r.user?.login === username)
    if (myReviews.length === 0) return null
    const latest = myReviews[myReviews.length - 1]
    return latest.state as ReviewState
  } catch {
    return null
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
      const state = await fetchMyReviewState(token, owner, repo, pr.number, username)
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
): Promise<{ state: ReviewState; approvedBy: string[] }> {
  try {
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`,
      { headers: headers(token) }
    )
    if (!res.ok) return { state: null, approvedBy: [] }
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
    return { state: null, approvedBy: [] }
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
      const summary = await fetchIncomingReviewSummary(token, owner, repo, pr.number, pr.user.login)
      return { ...pr, incomingReviewState: summary.state, approvedBy: summary.approvedBy }
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

  const results = await Promise.allSettled(
    recentPRs.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return []

      const [reviewRes, issueRes] = await Promise.allSettled([
        fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr.number}/comments?per_page=50&sort=created&direction=desc`, { headers: headers(token) }),
        fetch(`${API_BASE}/repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=50&sort=created&direction=desc`, { headers: headers(token) })
      ])

      const comments: any[] = []
      if (reviewRes.status === 'fulfilled' && reviewRes.value.ok) {
        comments.push(...await reviewRes.value.json())
      }
      if (issueRes.status === 'fulfilled' && issueRes.value.ok) {
        comments.push(...await issueRes.value.json())
      }

      return comments
        .filter(c => c.user?.login !== username)
        .map(c => ({
          id: `${pr.repo_full_name}-${pr.number}-${c.id}`,
          prNumber: pr.number,
          prTitle: pr.title,
          prRepoFullName: pr.repo_full_name,
          prHtmlUrl: pr.html_url,
          comment: {
            id: c.id,
            user: { login: c.user.login, avatar_url: c.user.avatar_url, html_url: c.user.html_url },
            body: c.body,
            html_url: c.html_url,
            created_at: c.created_at
          },
          read: false
        } as CommentActivity))
    })
  )

  const all: CommentActivity[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value)
  }
  return all.sort((a, b) =>
    new Date(b.comment.created_at).getTime() - new Date(a.comment.created_at).getTime()
  ).slice(0, 50)
}

export async function fetchRepliesToMyComments(
  token: string,
  prs: PullRequest[],
  username: string
): Promise<CommentActivity[]> {
  const recentPRs = prs.slice(0, 10)
  if (recentPRs.length === 0) return []

  const results = await Promise.allSettled(
    recentPRs.map(async pr => {
      const [owner, repo] = pr.repo_full_name.split('/')
      if (!owner || !repo) return []

      const res = await fetch(
        `${API_BASE}/repos/${owner}/${repo}/pulls/${pr.number}/comments?per_page=100`,
        { headers: headers(token) }
      )
      if (!res.ok) return []
      const comments: any[] = await res.json()

      const myCommentIds = new Map<number, any>()
      for (const c of comments) {
        if (c.user?.login === username) {
          myCommentIds.set(c.id, c)
        }
      }

      if (myCommentIds.size === 0) return []

      return comments
        .filter(c => c.in_reply_to_id && myCommentIds.has(c.in_reply_to_id) && c.user?.login !== username)
        .map(c => {
          const parent = myCommentIds.get(c.in_reply_to_id)!
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
        })
    })
  )

  const all: CommentActivity[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value)
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
    return fetch(
      `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=10`,
      { headers: headers(token) }
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
  try {
    const res = await fetch(`${API_BASE}/user/orgs?per_page=100`, { headers: headers(token) })
    if (!res.ok) return []
    const orgs: any[] = await res.json()
    return orgs.map(o => o.login)
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
  const res = await fetch(
    `${API_BASE}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`,
    { headers: headers(token) }
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
