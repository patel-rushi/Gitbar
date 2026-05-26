import { formatDistanceToNow } from 'date-fns'
import type { PullRequest, ReviewState } from '../types'

function getStatus(pr: PullRequest): 'open' | 'draft' | 'merged' | 'closed' {
  if (pr.merged_at) return 'merged'
  if (pr.draft) return 'draft'
  if (pr.state === 'closed') return 'closed'
  return 'open'
}

function ReviewStateIcon({ state }: { state: ReviewState }) {
  if (state === 'APPROVED') {
    return (
      <span className="review-state-icon approved" title="You approved">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
        </svg>
      </span>
    )
  }
  if (state === 'CHANGES_REQUESTED') {
    return (
      <span className="review-state-icon changes" title="You requested changes">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5-6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM10 10l-4-4" />
        </svg>
      </span>
    )
  }
  if (state === 'COMMENTED') {
    return (
      <span className="review-state-icon commented" title="You commented">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
        </svg>
      </span>
    )
  }
  return null
}

interface PRItemProps {
  pr: PullRequest
  unread?: boolean
  showReviewState?: boolean
  newCommentCount?: number
  onCommentBadgeClick?: () => void
  onIgnore?: () => void
  onClick: () => void
}

export function PRItem({ pr, unread, showReviewState, newCommentCount, onCommentBadgeClick, onIgnore, onClick }: PRItemProps) {
  const status = getStatus(pr)
  const timeAgo = formatDistanceToNow(new Date(pr.updated_at), { addSuffix: true })

  return (
    <div className={`pr-item${unread ? ' pr-item-unread' : ''}`} onClick={onClick}>
      {onIgnore && (
        <button
          className="pr-ignore-btn"
          title="Ignore this PR"
          onClick={e => { e.stopPropagation(); onIgnore() }}
        >
          ✕
        </button>
      )}
      <img className="pr-avatar" src={pr.user.avatar_url} alt={pr.user.login} />
      <div className="pr-content">
        <div className="pr-repo">
          <span className={`status-dot ${status}`} />
          {pr.repo_full_name}
          {showReviewState && pr.myReviewState && (
            <ReviewStateIcon state={pr.myReviewState} />
          )}
          {newCommentCount !== undefined && newCommentCount > 0 && (
            <span
              className="pr-new-comments"
              title={`${newCommentCount} new comment${newCommentCount > 1 ? 's' : ''}`}
              onClick={e => { e.stopPropagation(); onCommentBadgeClick?.() }}
            >
              💬 {newCommentCount}
            </span>
          )}
        </div>
        <div className="pr-title">{pr.title}</div>
        <div className="pr-meta">
          <span>#{pr.number}</span>
          <span>·</span>
          <span>{pr.user.login}</span>
          <span>·</span>
          <span>{timeAgo}</span>
          {pr.comments > 0 && (
            <>
              <span>·</span>
              <span>💬 {pr.comments}</span>
            </>
          )}
        </div>
        {pr.labels.length > 0 && (
          <div className="pr-labels">
            {pr.labels.slice(0, 3).map(label => (
              <span
                key={label.name}
                className="pr-label"
                style={{
                  backgroundColor: `#${label.color}22`,
                  color: `#${label.color}`,
                  border: `1px solid #${label.color}44`
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
