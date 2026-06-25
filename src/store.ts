import { create } from 'zustand'
import type { AppState, NotificationEvent, TabConfig, AppSettings, PullRequest, CommentActivity } from './types'
import * as github from './github'
import { GitHubApiError } from './github'

const DEFAULT_TABS: TabConfig[] = [
  { id: 'my-prs', label: 'My PRs', visible: true, order: 0, isCustom: false },
  { id: 'drafts', label: 'Drafts', visible: true, order: 1, isCustom: false },
  { id: 'reviewed', label: 'Reviewed by Me', visible: true, order: 2, isCustom: false },
  { id: 'review-requested', label: 'Review Requested', visible: true, order: 3, isCustom: false },
  { id: 'squad-activity', label: 'Squad Activity', visible: false, order: 4, isCustom: false },
  { id: 'pinned', label: 'Pinned Filters', visible: true, order: 5, isCustom: false }
]

const DEFAULT_SETTINGS: AppSettings = {
  pollingInterval: 90,
  notifications: {
    repliesToMyPR: true,
    repliesToMyComments: true,
    mentions: true,
    reviewRequested: true
  },
  reviewRequestedFilter: [],
  hideResolvedComments: false
}

const STORAGE_SUFFIX = (import.meta.env.DEV && import.meta.env.VITE_GITBAR_DEMO === '1') ? '_demo' : ''

function storageKey(key: string): string {
  return `${key}${STORAGE_SUFFIX}`
}

const INITIAL_SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  ...loadFromStorage<Partial<AppSettings>>('gitbar_settings', {})
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(key))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key: string, value: any) {
  const scopedKey = storageKey(key)
  localStorage.setItem(scopedKey, JSON.stringify(value))
  window.gitbar?.storeSet(scopedKey, value)
}

async function loadFromPersistentStore<T>(key: string, fallback: T): Promise<T> {
  const scopedKey = storageKey(key)
  try {
    const value = await window.gitbar?.storeGet(scopedKey)
    if (value != null) {
      localStorage.setItem(scopedKey, JSON.stringify(value))
      return value
    }
  } catch {}
  return loadFromStorage(key, fallback)
}

function migrateTabs(tabs: TabConfig[]): TabConfig[] {
  if (!tabs.find(t => t.id === 'drafts')) {
    tabs.push({ id: 'drafts', label: 'Drafts', visible: true, order: 1, isCustom: false })
    tabs = tabs.map(t => t.id !== 'drafts' && t.order >= 1 ? { ...t, order: t.order + 1 } : t)
    saveToStorage('gitbar_tabs', tabs)
  }
  if (tabs.find(t => t.id === 'commented')) {
    tabs = tabs.filter(t => t.id !== 'commented')
    tabs = tabs.map((t, i) => ({ ...t, order: i }))
    saveToStorage('gitbar_tabs', tabs)
  }
  if (!tabs.find(t => t.id === 'squad-activity')) {
    const maxOrder = Math.max(...tabs.map(t => t.order))
    tabs.push({ id: 'squad-activity', label: 'Squad Activity', visible: false, order: maxOrder + 1, isCustom: false })
    saveToStorage('gitbar_tabs', tabs)
  }
  return tabs
}

let pollTimer: ReturnType<typeof setInterval> | null = null

export const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_GITBAR_DEMO === '1'
export const DEMO_TEAM_OPTIONS = [
  'acme/platform',
  'acme/desktop-foundations',
  'acme/release-ops',
  'acme/core-squad'
]
export const DEMO_USER_OPTIONS = ['you-demo', 'amy', 'ben', 'nina', 'sarah']
const DEMO_NOW = Date.now()

function demoIso(hoursAgo: number): string {
  return new Date(DEMO_NOW - hoursAgo * 3600e3).toISOString()
}

function demoPR(partial: Partial<PullRequest> & { id: number; number: number; title: string; repo_full_name: string }): PullRequest {
  return {
    id: partial.id,
    number: partial.number,
    title: partial.title,
    html_url: partial.html_url || 'https://github.com/acme/platform/pull/1',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: partial.created_at || demoIso(2),
    updated_at: partial.updated_at || demoIso(1),
    user: partial.user || {
      login: 'octocat',
      avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
      html_url: 'https://github.com/octocat'
    },
    repository_url: partial.repository_url || `https://api.github.com/repos/${partial.repo_full_name}`,
    repo_full_name: partial.repo_full_name,
    labels: partial.labels || [],
    requested_reviewers: partial.requested_reviewers || [],
    comments: partial.comments ?? 0,
    review_comments: partial.review_comments ?? 0,
    myReviewState: partial.myReviewState,
    incomingReviewState: partial.incomingReviewState,
    approvedBy: partial.approvedBy
  }
}

const DEMO_DATA = {
  username: 'you-demo',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
  myPRs: [
    demoPR({ id: 1001, number: 842, title: 'Improve launch time of command palette', repo_full_name: 'acme/desktop-app', created_at: demoIso(3), updated_at: demoIso(0.8), comments: 8, review_comments: 3, incomingReviewState: 'APPROVED', approvedBy: ['amy', 'ben'] }),
    demoPR({ id: 1002, number: 835, title: 'Fix retry edge case in webhook processor', repo_full_name: 'acme/backend-api', created_at: demoIso(9), updated_at: demoIso(4), comments: 11, review_comments: 5, incomingReviewState: 'CHANGES_REQUESTED' }),
    demoPR({ id: 1003, number: 829, title: 'Add keyboard shortcuts to list filters', repo_full_name: 'acme/web-client', created_at: demoIso(30), updated_at: demoIso(12), comments: 4, review_comments: 2, incomingReviewState: 'COMMENTED' })
  ],
  draftPRs: [
    demoPR({ id: 1004, number: 846, title: 'Refine empty states for onboarding flow', repo_full_name: 'acme/web-client', draft: true, created_at: demoIso(1.5), updated_at: demoIso(1.1), comments: 0, review_comments: 0 })
  ].map(pr => ({ ...pr, draft: true })),
  reviewedPRs: [
    demoPR({ id: 1005, number: 818, title: 'Cache image transforms in worker queue', repo_full_name: 'acme/media-service', created_at: demoIso(20), updated_at: demoIso(6), comments: 6, review_comments: 7, myReviewState: 'APPROVED', approvedBy: ['you-demo'] }),
    demoPR({ id: 1006, number: 812, title: 'Unify status chip styles across pages', repo_full_name: 'acme/design-system', created_at: demoIso(32), updated_at: demoIso(15), comments: 3, review_comments: 2, myReviewState: 'COMMENTED' })
  ],
  reviewRequestedBase: [
    demoPR({ id: 1007, number: 851, title: 'Migrate preferences to encrypted storage', repo_full_name: 'acme/security', created_at: demoIso(1.2), updated_at: demoIso(0.9), comments: 2, review_comments: 1 }),
    demoPR({ id: 1008, number: 848, title: 'Reduce API chatter on notification refresh', repo_full_name: 'acme/desktop-app', created_at: demoIso(2.3), updated_at: demoIso(1.7), comments: 1, review_comments: 0 })
  ],
  squadActivityBase: [
    demoPR({ id: 1009, number: 839, title: 'Introduce release checklist automation', repo_full_name: 'acme/devops', created_at: demoIso(10), updated_at: demoIso(8), comments: 5, review_comments: 1 }),
    demoPR({ id: 1010, number: 832, title: 'Harden token validation fallback behavior', repo_full_name: 'acme/desktop-app', created_at: demoIso(16), updated_at: demoIso(7), comments: 7, review_comments: 3 })
  ],
  myPRComments: [
    {
      id: 'demo-c-1',
      prNumber: 842,
      prTitle: 'Improve launch time of command palette',
      prRepoFullName: 'acme/desktop-app',
      prHtmlUrl: 'https://github.com/acme/desktop-app/pull/842',
      comment: {
        id: 5001,
        user: { login: 'amy', avatar_url: 'https://avatars.githubusercontent.com/u/810438?v=4', html_url: 'https://github.com/amy' },
        body: 'Looks great. Could we include a quick benchmark note in the description?',
        html_url: 'https://github.com/acme/desktop-app/pull/842#discussion_r5001',
        created_at: demoIso(0.7)
      },
      read: false,
      isResolved: false
    },
    {
      id: 'demo-c-2',
      prNumber: 835,
      prTitle: 'Fix retry edge case in webhook processor',
      prRepoFullName: 'acme/backend-api',
      prHtmlUrl: 'https://github.com/acme/backend-api/pull/835',
      comment: {
        id: 5002,
        user: { login: 'ben', avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4', html_url: 'https://github.com/ben' },
        body: 'I left one question about the timeout default, then this should be ready.',
        html_url: 'https://github.com/acme/backend-api/pull/835#discussion_r5002',
        created_at: demoIso(3.5)
      },
      read: true,
      isResolved: false
    }
  ],
  reviewReplies: [
    {
      id: 'demo-r-1',
      prNumber: 818,
      prTitle: 'Cache image transforms in worker queue',
      prRepoFullName: 'acme/media-service',
      prHtmlUrl: 'https://github.com/acme/media-service/pull/818',
      myComment: {
        body: 'Can we short-circuit if the resize dimensions already exist?',
        html_url: 'https://github.com/acme/media-service/pull/818#discussion_r4991'
      },
      comment: {
        id: 5003,
        user: { login: 'nina', avatar_url: 'https://avatars.githubusercontent.com/u/49699333?v=4', html_url: 'https://github.com/nina' },
        body: 'Yep, pushed a follow-up commit for that path.',
        html_url: 'https://github.com/acme/media-service/pull/818#discussion_r5003',
        created_at: demoIso(2.2)
      },
      read: false,
      isResolved: false
    }
  ],
  events: [
    {
      id: 'demo-e-1',
      type: 'review_requested' as const,
      title: 'Migrate preferences to encrypted storage',
      body: 'Review requested - acme/security',
      url: 'https://github.com/acme/security/pull/851',
      pr: demoPR({ id: 1007, number: 851, title: 'Migrate preferences to encrypted storage', repo_full_name: 'acme/security', created_at: demoIso(1.2), updated_at: demoIso(0.9) }),
      actor: { login: 'sarah', avatar_url: 'https://avatars.githubusercontent.com/u/229422?v=4', html_url: 'https://github.com/sarah' },
      timestamp: demoIso(0.9),
      read: false
    },
    {
      id: 'demo-e-2',
      type: 'reply_to_comment' as const,
      title: 'Cache image transforms in worker queue',
      body: 'nina: "Yep, pushed a follow-up commit for that path."',
      url: 'https://github.com/acme/media-service/pull/818#discussion_r5003',
      pr: demoPR({ id: 1005, number: 818, title: 'Cache image transforms in worker queue', repo_full_name: 'acme/media-service', created_at: demoIso(20), updated_at: demoIso(6) }),
      actor: { login: 'nina', avatar_url: 'https://avatars.githubusercontent.com/u/49699333?v=4', html_url: 'https://github.com/nina' },
      timestamp: demoIso(2.2),
      read: false
    }
  ],
  lastPollAt: demoIso(0.3)
}

const DEMO_REVIEW_REQUEST_TARGETS: Record<number, string[]> = {
  851: ['you-demo', 'acme/platform'],
  848: ['acme/desktop-foundations']
}

const DEMO_SQUAD_TARGETS: Record<number, string[]> = {
  839: ['acme/release-ops'],
  832: ['acme/platform', 'acme/core-squad']
}

function filterDemoPRsByTargets(prs: PullRequest[], targetMap: Record<number, string[]>, filters: string[]): PullRequest[] {
  if (filters.length === 0) return prs
  return prs.filter(pr => {
    const targets = targetMap[pr.number] || []
    return filters.some(filter => targets.includes(filter))
  })
}

function getDemoCollections(settings: AppSettings) {
  const filters = settings.reviewRequestedFilter || []
  const selectedTeams = filters.filter(filter => filter.includes('/'))

  return {
    reviewRequestedPRs: filterDemoPRsByTargets(DEMO_DATA.reviewRequestedBase, DEMO_REVIEW_REQUEST_TARGETS, filters),
    squadActivityPRs: filterDemoPRsByTargets(
      DEMO_DATA.squadActivityBase,
      DEMO_SQUAD_TARGETS,
      selectedTeams.length > 0 ? selectedTeams : DEMO_TEAM_OPTIONS
    )
  }
}

const DEMO_COLLECTIONS = getDemoCollections(INITIAL_SETTINGS)

export const useStore = create<AppState>((set, get) => ({
  token: DEMO_MODE ? 'demo-token' : loadFromStorage<string | null>('gitbar_token', null),
  username: DEMO_MODE ? DEMO_DATA.username : loadFromStorage<string | null>('gitbar_username', null),
  avatarUrl: DEMO_MODE ? DEMO_DATA.avatarUrl : loadFromStorage<string | null>('gitbar_avatar', null),
  isValidating: false,
  isPolling: false,
  lastPollAt: DEMO_MODE ? DEMO_DATA.lastPollAt : loadFromStorage<string | null>('gitbar_last_poll', null),
  pollError: null,

  myPRs: DEMO_MODE ? DEMO_DATA.myPRs : [],
  draftPRs: DEMO_MODE ? DEMO_DATA.draftPRs : [],
  reviewedPRs: DEMO_MODE ? DEMO_DATA.reviewedPRs : [],
  reviewRequestedPRs: DEMO_MODE ? DEMO_COLLECTIONS.reviewRequestedPRs : [],
  squadActivityPRs: DEMO_MODE ? DEMO_COLLECTIONS.squadActivityPRs : [],
  userTeams: DEMO_MODE ? DEMO_TEAM_OPTIONS : loadFromStorage<string[]>('gitbar_user_teams', []),

  myPRComments: DEMO_MODE ? DEMO_DATA.myPRComments : loadFromStorage<CommentActivity[]>('gitbar_my_pr_comments', []),
  reviewReplies: DEMO_MODE ? DEMO_DATA.reviewReplies : loadFromStorage<CommentActivity[]>('gitbar_review_replies', []),
  ignoredPRs: new Set<string>(loadFromStorage<string[]>('gitbar_ignored_prs', [])),
  dismissedComments: new Set<string>(loadFromStorage<string[]>('gitbar_dismissed_comments', [])),

  events: DEMO_MODE ? DEMO_DATA.events : loadFromStorage<NotificationEvent[]>('gitbar_events', []),
  badgeCount: DEMO_MODE ? DEMO_DATA.events.filter(e => !e.read).length : loadFromStorage<number>('gitbar_badge', 0),

  tabs: migrateTabs(loadFromStorage<TabConfig[]>('gitbar_tabs', DEFAULT_TABS)),
  settings: INITIAL_SETTINGS,

  view: DEMO_MODE ? 'main' : (loadFromStorage<string | null>('gitbar_token', null) ? 'main' : 'setup'),
  activeTab: 'my-prs',

  pendingUpdateVersion: null,

  setPendingUpdate: (version: string | null) => set({ pendingUpdateVersion: version }),
  installPendingUpdate: () => window.gitbar?.installUpdate(),

  setToken: async (token: string) => {
    set({ isValidating: true })
    const user = await github.validateToken(token)
    if (user) {
      saveToStorage('gitbar_token', token)
      saveToStorage('gitbar_username', user.login)
      saveToStorage('gitbar_avatar', user.avatar_url)
      set({
        token,
        username: user.login,
        avatarUrl: user.avatar_url,
        isValidating: false,
        view: 'main'
      })
      get().startPolling()
      return true
    }
    set({ isValidating: false })
    return false
  },

  clearToken: () => {
    get().stopPolling()
    if (!DEMO_MODE) {
      localStorage.removeItem(storageKey('gitbar_token'))
      localStorage.removeItem(storageKey('gitbar_username'))
      localStorage.removeItem(storageKey('gitbar_avatar'))
      localStorage.removeItem(storageKey('gitbar_events'))
      localStorage.removeItem(storageKey('gitbar_badge'))
      localStorage.removeItem(storageKey('gitbar_last_poll'))
      localStorage.removeItem(storageKey('gitbar_user_teams'))
      localStorage.removeItem(storageKey('gitbar_my_pr_comments'))
      localStorage.removeItem(storageKey('gitbar_review_replies'))
      localStorage.removeItem(storageKey('gitbar_team_members'))
      window.gitbar?.storeRemove(storageKey('gitbar_token'))
      window.gitbar?.storeRemove(storageKey('gitbar_username'))
      window.gitbar?.storeRemove(storageKey('gitbar_avatar'))
      window.gitbar?.storeRemove(storageKey('gitbar_settings'))
      window.gitbar?.storeRemove(storageKey('gitbar_user_teams'))
    }
    set({
      token: null,
      username: null,
      avatarUrl: null,
      myPRs: [],
      draftPRs: [],
      reviewedPRs: [],
      reviewRequestedPRs: [],
      squadActivityPRs: [],
      myPRComments: [],
      reviewReplies: [],
      userTeams: [],
      events: [],
      badgeCount: 0,
      view: DEMO_MODE ? 'main' : 'setup'
    })
    window.gitbar?.updateBadge(0)
  },

  setView: (view) => set({ view }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  markEventRead: (id: string) => {
    const events = get().events.map(e => e.id === id ? { ...e, read: true } : e)
    const badgeCount = events.filter(e => !e.read).length
    saveToStorage('gitbar_events', events)
    saveToStorage('gitbar_badge', badgeCount)
    set({ events, badgeCount })
    window.gitbar?.updateBadge(badgeCount)
  },

  markAllRead: () => {
    const events = get().events.map(e => ({ ...e, read: true }))
    const myPRComments = get().myPRComments.map(c => ({ ...c, read: true }))
    const reviewReplies = get().reviewReplies.map(c => ({ ...c, read: true }))
    saveToStorage('gitbar_events', events)
    saveToStorage('gitbar_badge', 0)
    saveToStorage('gitbar_my_pr_comments', myPRComments)
    saveToStorage('gitbar_review_replies', reviewReplies)
    set({ events, myPRComments, reviewReplies, badgeCount: 0 })
    window.gitbar?.updateBadge(0)
  },

  markCommentRead: (id: string) => {
    const myPRComments = get().myPRComments.map(c => c.id === id ? { ...c, read: true } : c)
    const reviewReplies = get().reviewReplies.map(c => c.id === id ? { ...c, read: true } : c)
    saveToStorage('gitbar_my_pr_comments', myPRComments)
    saveToStorage('gitbar_review_replies', reviewReplies)
    set({ myPRComments, reviewReplies })
  },

  ignorePR: (prKey: string) => {
    const ignoredPRs = new Set(get().ignoredPRs)
    ignoredPRs.add(prKey)
    saveToStorage('gitbar_ignored_prs', Array.from(ignoredPRs))
    set({ ignoredPRs })
  },

  unignorePR: (prKey: string) => {
    const ignoredPRs = new Set(get().ignoredPRs)
    ignoredPRs.delete(prKey)
    saveToStorage('gitbar_ignored_prs', Array.from(ignoredPRs))
    set({ ignoredPRs })
  },

  dismissReviewedPR: (repoFullName: string, prNumber: number) => {
    const ignoredPRs = new Set(get().ignoredPRs)
    ignoredPRs.add(`${repoFullName}#${prNumber}`)
    const reviewReplies = get().reviewReplies.map(c =>
      c.prRepoFullName === repoFullName && c.prNumber === prNumber ? { ...c, read: true } : c
    )
    saveToStorage('gitbar_ignored_prs', Array.from(ignoredPRs))
    saveToStorage('gitbar_review_replies', reviewReplies)
    set({ ignoredPRs, reviewReplies })
  },

  dismissComment: (id: string) => {
    const dismissedComments = new Set(get().dismissedComments)
    dismissedComments.add(id)
    const myPRComments = get().myPRComments.map(c => c.id === id ? { ...c, read: true } : c)
    const reviewReplies = get().reviewReplies.map(c => c.id === id ? { ...c, read: true } : c)
    saveToStorage('gitbar_dismissed_comments', Array.from(dismissedComments))
    saveToStorage('gitbar_my_pr_comments', myPRComments)
    saveToStorage('gitbar_review_replies', reviewReplies)
    set({ dismissedComments, myPRComments, reviewReplies })
  },

  clearBadge: () => {
    saveToStorage('gitbar_badge', 0)
    set({ badgeCount: 0 })
    window.gitbar?.updateBadge(0)
  },

  updateSettings: (partial: Partial<AppSettings>) => {
    const settings = { ...get().settings, ...partial }
    saveToStorage('gitbar_settings', settings)
    if (DEMO_MODE) {
      const demoCollections = getDemoCollections(settings)
      set({
        settings,
        reviewRequestedPRs: demoCollections.reviewRequestedPRs,
        squadActivityPRs: demoCollections.squadActivityPRs
      })
    } else {
      set({ settings })
    }

    if (partial.pollingInterval && pollTimer) {
      get().stopPolling()
      get().startPolling()
    }
  },

  updateTabs: (tabs: TabConfig[]) => {
    saveToStorage('gitbar_tabs', tabs)
    set({ tabs })
  },

  poll: async () => {
    if (DEMO_MODE) return
    const { token, username, settings } = get()
    if (!token || !username) return

    set({ isPolling: true })

    try {
      const reviewFilter = settings.reviewRequestedFilter?.length
        ? settings.reviewRequestedFilter
        : undefined

      // Fetch user teams once and cache for exclusion logic
      let { userTeams } = get()
      if (userTeams.length === 0 && reviewFilter?.length) {
        const teams = await github.fetchUserTeams(token)
        userTeams = teams.map(t => t.fullSlug)
        if (userTeams.length > 0) {
          saveToStorage('gitbar_user_teams', userTeams)
          set({ userTeams })
        }
      }

      const selectedTeams = (reviewFilter || []).filter(t => t.includes('/'))
      const squadTabVisible = get().tabs.some(t => t.id === 'squad-activity' && t.visible)

      // Fetch team members for selected teams (cached in localStorage)
      let teamMembers = loadFromStorage<string[]>('gitbar_team_members', [])
      if (teamMembers.length === 0 && selectedTeams.length > 0) {
        const memberSets = await Promise.allSettled(
          selectedTeams.map(team => {
            const [org, slug] = team.split('/')
            return github.fetchTeamMembers(token, org, slug)
          })
        )
        const allMembers = new Set<string>()
        for (const r of memberSets) {
          if (r.status === 'fulfilled') r.value.forEach(m => allMembers.add(m))
        }
        teamMembers = Array.from(allMembers)
        if (teamMembers.length > 0) saveToStorage('gitbar_team_members', teamMembers)
      }

      // Core queries (always run - 4 search calls)
      const [rawMyPRs, draftPRs, rawReviewedPRs, rawNotifications] = await Promise.all([
        github.fetchMyPRs(token, username),
        github.fetchDraftPRs(token, username),
        github.fetchReviewedPRs(token, username),
        github.fetchNotifications(token, get().lastPollAt || undefined)
      ])

      // Incoming review state for top My PRs (capped to save API calls)
      const enrichedMyPRs = await github.enrichWithIncomingReviewState(token, rawMyPRs.slice(0, 8))
      const myPRs = [...enrichedMyPRs, ...rawMyPRs.slice(8)]

      // Review requested (2-3 search calls + teammate PRs cached for 5 min)
      const [reviewRequestedPRs, teammatePRs] = await Promise.all([
        github.fetchReviewRequestedPRs(token, username, reviewFilter, userTeams),
        teamMembers.length > 0 ? github.fetchTeammatePRs(token, username, teamMembers) : Promise.resolve([])
      ])

      // Merge teammate PRs into review requested (deduplicated)
      const reviewRequestedSeenIds = new Set(reviewRequestedPRs.map(pr => pr.id))
      const reviewedIds = new Set(rawReviewedPRs.map(pr => pr.id))
      const mergedReviewRequested = [
        ...reviewRequestedPRs,
        ...teammatePRs.filter(pr => !reviewRequestedSeenIds.has(pr.id))
      ]
        .filter(pr => !reviewedIds.has(pr.id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      // Squad activity (cached internally - only fetches if tab is visible)
      const squadActivityPRs = squadTabVisible
        ? await github.fetchSquadActivity(token, username, selectedTeams)
        : []

      // Review state enrichment (limited to 5 most recent to save API calls)
      const reviewedPRs = await github.enrichWithReviewState(token, rawReviewedPRs.slice(0, 5), username)
      const remainingReviewed = rawReviewedPRs.slice(5)
      const allReviewedPRs = [...reviewedPRs, ...remainingReviewed]

      // Comment fetching (limited: 3 my PRs, 5 reviewed PRs)
      const commentMyPRs = myPRs.slice(0, 3)
      const commentReviewedPRs = rawReviewedPRs.slice(0, 5)
      const [rawMyPRComments, rawReviewReplies] = await Promise.all([
        github.fetchCommentsOnMyPRs(token, commentMyPRs, username),
        github.fetchRepliesToMyComments(token, commentReviewedPRs, username)
      ])

      // Resolved-thread enrichment (GraphQL — REST doesn't expose isResolved).
      // Dedupe by repo+number so we don't pay twice when the same PR appears in both lists.
      const resolvedPRMap = new Map<string, PullRequest>()
      for (const pr of [...commentMyPRs, ...commentReviewedPRs]) {
        resolvedPRMap.set(`${pr.repo_full_name}#${pr.number}`, pr)
      }
      const resolvedMap = await github.fetchResolvedThreadMap(token, Array.from(resolvedPRMap.values()))

      // Merge with existing read state
      const existingCommentReadState = new Set([
        ...get().myPRComments.filter(c => c.read).map(c => c.id),
        ...get().reviewReplies.filter(c => c.read).map(c => c.id)
      ])
      const myPRComments = rawMyPRComments.map(c => ({
        ...c,
        read: existingCommentReadState.has(c.id),
        isResolved: resolvedMap.get(c.comment.id) ?? false
      }))
      const reviewReplies = rawReviewReplies.map(c => ({
        ...c,
        read: existingCommentReadState.has(c.id),
        isResolved: resolvedMap.get(c.comment.id) ?? false
      }))

      saveToStorage('gitbar_my_pr_comments', myPRComments)
      saveToStorage('gitbar_review_replies', reviewReplies)

      const existingEventIds = new Set(get().events.map(e => e.id))
      const newEvents: NotificationEvent[] = []

      // Build a set of PR IDs that pass our review-requested filter
      const relevantReviewPRIds = new Set(reviewRequestedPRs.map(pr => pr.number))
      // Also include PRs the user authored (for reply notifications)
      const myPRNumbers = new Set(myPRs.map(pr => pr.number))

      for (const notif of rawNotifications) {
        if (existingEventIds.has(notif.id)) continue
        if (notif.subject.type !== 'PullRequest') continue

        let type: NotificationEvent['type'] | null = null
        if (notif.reason === 'mention' && settings.notifications.mentions) {
          type = 'mention'
        } else if (notif.reason === 'review_requested' && settings.notifications.reviewRequested) {
          // Only notify for review requests that match our filter
          if (reviewFilter?.length) {
            const prNum = Number(notif.subject.url?.match(/\/pulls\/(\d+)/)?.[1] || 0)
            if (!relevantReviewPRIds.has(prNum)) continue
          }
          type = 'review_requested'
        } else if (notif.reason === 'author' && settings.notifications.repliesToMyPR) {
          type = 'reply_to_pr'
        } else if (notif.reason === 'comment' && settings.notifications.repliesToMyComments) {
          type = 'reply_to_comment'
        } else if (notif.reason === 'subscribed' || notif.reason === 'state_change') {
          continue
        }

        if (!type) continue

        let htmlUrl = `${notif.repository.html_url}/pull/${notif.subject.url?.match(/\/pulls\/(\d+)/)?.[1] || ''}`
        let actor: { login: string; avatar_url: string; html_url: string } = {
          login: '',
          avatar_url: '',
          html_url: ''
        }
        let commentBody = ''

        const commentUrl = notif.subject.latest_comment_url
        if (commentUrl) {
          const comment = await github.fetchCommentUrl(token, commentUrl)
          if (comment) {
            htmlUrl = comment.html_url || htmlUrl
            commentBody = comment.body || ''
            if (comment.user) {
              actor = {
                login: comment.user.login,
                avatar_url: comment.user.avatar_url,
                html_url: comment.user.html_url
              }
            }
          }
        }

        if (!actor.login) {
          actor = { login: notif.repository.full_name.split('/')[0] || 'GitHub', avatar_url: '', html_url: '' }
        }

        const prNumber = notif.subject.url?.match(/\/pulls\/(\d+)/)?.[1] || ''
        const matchedPR: PullRequest = myPRs.find(p => p.number === Number(prNumber)) ||
          allReviewedPRs.find(p => p.number === Number(prNumber)) ||
          mergedReviewRequested.find(p => p.number === Number(prNumber)) ||
          {
            id: 0, number: Number(prNumber) || 0, title: notif.subject.title,
            html_url: htmlUrl, state: 'open', draft: false, merged_at: null,
            created_at: notif.updated_at, updated_at: notif.updated_at,
            user: actor, repository_url: '', repo_full_name: notif.repository.full_name,
            labels: [], requested_reviewers: [], comments: 0, review_comments: 0
          }

        let notifBody = `${actor.login} — ${notif.repository.full_name}`
        if (commentBody) {
          const preview = commentBody.replace(/\n/g, ' ').slice(0, 120)
          notifBody = `${actor.login}: "${preview}${commentBody.length > 120 ? '…' : ''}"`
        } else if (type === 'review_requested') {
          notifBody = `Review requested — ${notif.repository.full_name}`
        } else if (type === 'mention') {
          notifBody = `${actor.login} mentioned you — ${notif.repository.full_name}`
        }

        const event: NotificationEvent = {
          id: notif.id,
          type,
          title: notif.subject.title,
          body: notifBody,
          url: htmlUrl,
          pr: matchedPR,
          actor,
          timestamp: notif.updated_at,
          read: false
        }

        newEvents.push(event)
      }

      const isFirstPoll = !get().lastPollAt
      if (newEvents.length > 0 && !isFirstPoll) {
        for (const event of newEvents) {
          window.gitbar?.showNotification({
            title: event.title,
            body: event.body,
            url: event.url
          })
        }
      }

      const allEvents = [...newEvents, ...get().events].slice(0, 100)
      const badgeCount = allEvents.filter(e => !e.read).length

      saveToStorage('gitbar_events', allEvents)
      saveToStorage('gitbar_badge', badgeCount)

      const lastPollAt = new Date().toISOString()
      saveToStorage('gitbar_last_poll', lastPollAt)

      set({
        myPRs,
        draftPRs,
        reviewedPRs: allReviewedPRs,
        reviewRequestedPRs: mergedReviewRequested,
        squadActivityPRs,
        myPRComments,
        reviewReplies,
        events: allEvents,
        badgeCount,
        lastPollAt,
        isPolling: false,
        pollError: null
      })

      window.gitbar?.updateBadge(badgeCount)
    } catch (err) {
      console.error('Poll error:', err)
      if (err instanceof GitHubApiError && err.status === 401) {
        // GitHub occasionally returns a one-off 401 on an otherwise-valid token.
        // Confirm against /user before declaring the token dead and stopping.
        const stillValid = token ? await github.validateToken(token) : null
        if (stillValid) {
          // Transient hiccup: keep polling, the next tick recovers on its own.
          set({ isPolling: false, pollError: null })
        } else {
          get().stopPolling()
          set({ isPolling: false, pollError: 'Token expired, please sign in again' })
        }
      } else if (err instanceof GitHubApiError) {
        set({ isPolling: false, pollError: err.message })
      } else {
        set({ isPolling: false, pollError: 'Network error, check your connection' })
      }
    }
  },

  startPolling: () => {
    if (DEMO_MODE) return
    const { settings, poll } = get()
    if (pollTimer) clearInterval(pollTimer)
    poll()
    pollTimer = setInterval(poll, settings.pollingInterval * 1000)
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
}))

// Hydrate critical data from persistent (main-process) store on startup
if (typeof window !== 'undefined' && window.gitbar) {
  if (DEMO_MODE) {
    useStore.setState({ view: 'main', pollError: null, isPolling: false })
  } else {
  Promise.all([
    loadFromPersistentStore<string | null>('gitbar_token', null),
    loadFromPersistentStore<string | null>('gitbar_username', null),
    loadFromPersistentStore<string | null>('gitbar_avatar', null),
    loadFromPersistentStore<Partial<AppSettings>>('gitbar_settings', {}),
    loadFromPersistentStore<string[]>('gitbar_user_teams', []),
    loadFromPersistentStore<string[]>('gitbar_ignored_prs', []),
    loadFromPersistentStore<string[]>('gitbar_dismissed_comments', []),
  ]).then(([token, username, avatarUrl, settings, userTeams, ignoredPrs, dismissedComments]) => {
    // Always restore dismissal state — localStorage isn't reliably persisted
    // across restarts, so these live in the main-process store.
    const dismissalPatch: Partial<AppState> = {}
    if (Array.isArray(ignoredPrs) && ignoredPrs.length > 0) {
      dismissalPatch.ignoredPRs = new Set([...useStore.getState().ignoredPRs, ...ignoredPrs])
    }
    if (Array.isArray(dismissedComments) && dismissedComments.length > 0) {
      dismissalPatch.dismissedComments = new Set([...useStore.getState().dismissedComments, ...dismissedComments])
    }
    if (Object.keys(dismissalPatch).length > 0) useStore.setState(dismissalPatch)

    const currentToken = useStore.getState().token
    if (!currentToken && token) {
      useStore.setState({
        token,
        username,
        avatarUrl,
        settings: { ...DEFAULT_SETTINGS, ...settings },
        userTeams: userTeams || [],
        view: 'main'
      })
      useStore.getState().startPolling()
    }
  })
  }
}
