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

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value))
  window.gitbar?.storeSet(key, value)
}

async function loadFromPersistentStore<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await window.gitbar?.storeGet(key)
    if (value != null) {
      localStorage.setItem(key, JSON.stringify(value))
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

export const useStore = create<AppState>((set, get) => ({
  token: loadFromStorage<string | null>('gitbar_token', null),
  username: loadFromStorage<string | null>('gitbar_username', null),
  avatarUrl: loadFromStorage<string | null>('gitbar_avatar', null),
  isValidating: false,
  isPolling: false,
  lastPollAt: loadFromStorage<string | null>('gitbar_last_poll', null),
  pollError: null,

  myPRs: [],
  draftPRs: [],
  reviewedPRs: [],
  reviewRequestedPRs: [],
  squadActivityPRs: [],
  userTeams: loadFromStorage<string[]>('gitbar_user_teams', []),

  myPRComments: loadFromStorage<CommentActivity[]>('gitbar_my_pr_comments', []),
  reviewReplies: loadFromStorage<CommentActivity[]>('gitbar_review_replies', []),
  ignoredPRs: new Set<string>(loadFromStorage<string[]>('gitbar_ignored_prs', [])),

  events: loadFromStorage<NotificationEvent[]>('gitbar_events', []),
  badgeCount: loadFromStorage<number>('gitbar_badge', 0),

  tabs: migrateTabs(loadFromStorage<TabConfig[]>('gitbar_tabs', DEFAULT_TABS)),
  settings: { ...DEFAULT_SETTINGS, ...loadFromStorage<Partial<AppSettings>>('gitbar_settings', {}) },

  view: loadFromStorage<string | null>('gitbar_token', null) ? 'main' : 'setup',
  activeTab: 'my-prs',

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
    localStorage.removeItem('gitbar_token')
    localStorage.removeItem('gitbar_username')
    localStorage.removeItem('gitbar_avatar')
    localStorage.removeItem('gitbar_events')
    localStorage.removeItem('gitbar_badge')
    localStorage.removeItem('gitbar_last_poll')
    localStorage.removeItem('gitbar_user_teams')
    localStorage.removeItem('gitbar_my_pr_comments')
    localStorage.removeItem('gitbar_review_replies')
    localStorage.removeItem('gitbar_team_members')
    window.gitbar?.storeRemove('gitbar_token')
    window.gitbar?.storeRemove('gitbar_username')
    window.gitbar?.storeRemove('gitbar_avatar')
    window.gitbar?.storeRemove('gitbar_settings')
    window.gitbar?.storeRemove('gitbar_user_teams')
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
      view: 'setup'
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
    saveToStorage('gitbar_events', events)
    saveToStorage('gitbar_badge', 0)
    set({ events, badgeCount: 0 })
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

  clearBadge: () => {
    saveToStorage('gitbar_badge', 0)
    set({ badgeCount: 0 })
    window.gitbar?.updateBadge(0)
  },

  updateSettings: (partial: Partial<AppSettings>) => {
    const settings = { ...get().settings, ...partial }
    saveToStorage('gitbar_settings', settings)
    set({ settings })

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
      const [myPRs, draftPRs, rawReviewedPRs, rawNotifications] = await Promise.all([
        github.fetchMyPRs(token, username),
        github.fetchDraftPRs(token, username),
        github.fetchReviewedPRs(token, username),
        github.fetchNotifications(token, get().lastPollAt || undefined)
      ])

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
      ].filter(pr => !reviewedIds.has(pr.id))

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
        get().stopPolling()
        set({ isPolling: false, pollError: 'Token expired — please sign in again' })
      } else if (err instanceof GitHubApiError) {
        set({ isPolling: false, pollError: err.message })
      } else {
        set({ isPolling: false, pollError: 'Network error — check your connection' })
      }
    }
  },

  startPolling: () => {
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
  Promise.all([
    loadFromPersistentStore<string | null>('gitbar_token', null),
    loadFromPersistentStore<string | null>('gitbar_username', null),
    loadFromPersistentStore<string | null>('gitbar_avatar', null),
    loadFromPersistentStore<Partial<AppSettings>>('gitbar_settings', {}),
    loadFromPersistentStore<string[]>('gitbar_user_teams', []),
  ]).then(([token, username, avatarUrl, settings, userTeams]) => {
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
