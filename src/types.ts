export interface GitHubUser {
  login: string
  avatar_url: string
  html_url: string
}

export type ReviewState = 'APPROVED' | 'COMMENTED' | 'CHANGES_REQUESTED' | 'DISMISSED' | null

export interface PullRequest {
  id: number
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  draft: boolean
  merged_at: string | null
  created_at: string
  updated_at: string
  user: GitHubUser
  repository_url: string
  repo_full_name: string
  labels: Array<{ name: string; color: string }>
  requested_reviewers: GitHubUser[]
  comments: number
  review_comments: number
  myReviewState?: ReviewState
  incomingReviewState?: ReviewState
  approvedBy?: string[]
}

export interface NotificationEvent {
  id: string
  type: 'reply_to_pr' | 'reply_to_comment' | 'mention' | 'review_requested'
  title: string
  body: string
  url: string
  pr: PullRequest
  actor: GitHubUser
  timestamp: string
  read: boolean
}

export type TabId = 'my-prs' | 'drafts' | 'reviewed' | 'review-requested' | 'commented' | 'pinned'

export interface TabConfig {
  id: string
  label: string
  visible: boolean
  order: number
  isCustom: boolean
  filter?: CustomFilter
}

export interface CustomFilter {
  labels: string[]
  repos: string[]
  authors: string[]
  query?: string
  name: string
}

export interface CommentActivity {
  id: string
  prNumber: number
  prTitle: string
  prRepoFullName: string
  prHtmlUrl: string
  myComment?: { body: string; html_url: string }
  comment: {
    id: number
    user: GitHubUser
    body: string
    html_url: string
    created_at: string
  }
  read: boolean
  isResolved?: boolean
}

export interface AppSettings {
  pollingInterval: number
  notifications: {
    repliesToMyPR: boolean
    repliesToMyComments: boolean
    mentions: boolean
    reviewRequested: boolean
  }
  reviewRequestedFilter: string[]
  hideResolvedComments: boolean
}

export interface AppState {
  token: string | null
  username: string | null
  avatarUrl: string | null
  isValidating: boolean
  isPolling: boolean
  lastPollAt: string | null
  pollError: string | null
  
  myPRs: PullRequest[]
  draftPRs: PullRequest[]
  reviewedPRs: PullRequest[]
  reviewRequestedPRs: PullRequest[]
  userTeams: string[]
  
  myPRComments: CommentActivity[]
  reviewReplies: CommentActivity[]
  ignoredPRs: Set<string>
  dismissedComments: Set<string>
  
  events: NotificationEvent[]
  badgeCount: number
  
  tabs: TabConfig[]
  settings: AppSettings
  
  view: 'setup' | 'main' | 'settings'
  activeTab: string

  pendingUpdateVersion: string | null

  setToken: (token: string) => Promise<boolean>
  clearToken: () => void
  setPendingUpdate: (version: string | null) => void
  installPendingUpdate: () => void
  setView: (view: 'setup' | 'main' | 'settings') => void
  setActiveTab: (tab: string) => void
  markEventRead: (id: string) => void
  markAllRead: () => void
  markCommentRead: (id: string) => void
  ignorePR: (prKey: string) => void
  unignorePR: (prKey: string) => void
  dismissReviewedPR: (repoFullName: string, prNumber: number) => void
  dismissComment: (id: string) => void
  clearBadge: () => void
  updateSettings: (settings: Partial<AppSettings>) => void
  updateTabs: (tabs: TabConfig[]) => void
  poll: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

declare global {
  interface Window {
    gitbar: {
      updateBadge: (count: number) => void
      showNotification: (data: { title: string; body: string; url?: string }) => void
      openExternal: (url: string) => void
      hideWindow: () => void
      storeGet: (key: string) => Promise<any>
      storeSet: (key: string, value: any) => Promise<void>
      storeRemove: (key: string) => Promise<void>
      installUpdate: () => void
      getPendingUpdate: () => Promise<{ version: string } | null>
      onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void
    }
  }
}
