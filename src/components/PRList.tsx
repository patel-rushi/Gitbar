import type { PullRequest, CommentActivity } from '../types'
import { PRItem } from './PRItem'
import { InboxIcon } from './Icons'
import { useStore } from '../store'

interface PRListProps {
  prs: PullRequest[]
  emptyTitle?: string
  emptyText?: string
  showReviewState?: boolean
  showIncomingReviewState?: boolean
  commentSource?: 'myPRComments' | 'reviewReplies'
  onCommentBadgeClick?: () => void
  allowIgnore?: boolean
  timeSource?: 'updated' | 'created'
}

export function PRList({ prs, emptyTitle = 'No pull requests', emptyText = 'Nothing here yet.', showReviewState, showIncomingReviewState, commentSource, onCommentBadgeClick, allowIgnore, timeSource }: PRListProps) {
  const store = useStore()
  const { ignoredPRs, ignorePR } = store

  const commentCounts = new Map<number, number>()
  if (commentSource) {
    const items: CommentActivity[] = store[commentSource]
    for (const item of items) {
      if (!item.read) {
        commentCounts.set(item.prNumber, (commentCounts.get(item.prNumber) || 0) + 1)
      }
    }
  }

  const filteredPRs = allowIgnore
    ? prs.filter(pr => !ignoredPRs.has(`${pr.repo_full_name}#${pr.number}`))
    : prs

  if (filteredPRs.length === 0) {
    return (
      <div className="empty-state">
        <InboxIcon />
        <div className="empty-state-title">{emptyTitle}</div>
        <div className="empty-state-text">{emptyText}</div>
        <div className="empty-state-hint">
          Missing PRs from a work org? Your token may need{' '}
          <span className="setup-link" onClick={() => window.gitbar?.openExternal('https://github.com/settings/tokens')}>
            SSO authorized
          </span>
          .
        </div>
      </div>
    )
  }

  return (
    <div className="pr-list">
      {filteredPRs.map(pr => (
        <PRItem
          key={pr.id}
          pr={pr}
          showReviewState={showReviewState}
          showIncomingReviewState={showIncomingReviewState}
          newCommentCount={commentCounts.get(pr.number)}
          onCommentBadgeClick={onCommentBadgeClick}
          onIgnore={allowIgnore ? () => ignorePR(`${pr.repo_full_name}#${pr.number}`) : undefined}
          onClick={() => window.gitbar?.openExternal(pr.html_url)}
          timeSource={timeSource}
        />
      ))}
    </div>
  )
}
