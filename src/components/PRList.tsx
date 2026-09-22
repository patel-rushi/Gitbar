import type { PullRequest } from '../types'
import { isPullRequest } from '../types'
import { PRItem } from './PRItem'
import { InboxIcon } from './Icons'
import { useStore } from '../store'

interface PRListProps {
  prs: PullRequest[]
  emptyTitle?: string
  emptyText?: string
  showReviewState?: boolean
  showIncomingReviewState?: boolean
  showReviewRequestedState?: boolean
  showPipelineState?: boolean
  allowIgnore?: boolean
  allowDismiss?: boolean
  timeSource?: 'updated' | 'created'
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
}

export function PRList({ prs, emptyTitle = 'No pull requests', emptyText = 'Nothing here yet.', showReviewState, showIncomingReviewState, showReviewRequestedState, showPipelineState, allowIgnore, allowDismiss, timeSource, hasMore, isLoadingMore, onLoadMore }: PRListProps) {
  const store = useStore()
  const { ignoredPRs, ignorePR, dismissReviewedPR } = store

  const validPRs = (prs || []).filter(isPullRequest)

  const filteredPRs = allowIgnore || allowDismiss
    ? validPRs.filter(pr => !ignoredPRs.has(`${pr.repo_full_name}#${pr.number}`))
    : validPRs

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
          showReviewRequestedState={showReviewRequestedState}
          showPipelineState={showPipelineState}
          onIgnore={
            allowDismiss
              ? () => dismissReviewedPR(pr.repo_full_name, pr.number)
              : allowIgnore
                ? () => ignorePR(`${pr.repo_full_name}#${pr.number}`)
                : undefined
          }
          ignoreVariant={allowDismiss ? 'check' : 'cross'}
          ignoreTitle={allowDismiss ? 'Dismiss — stop showing this PR' : undefined}
          onClick={() => {
            window.gitbar?.trackAnalytics('pull_request_opened', {
              list_type: allowDismiss ? 'reviewed' : allowIgnore ? 'review_requested_or_filtered' : 'authored_or_draft'
            })
            window.gitbar?.openExternal(pr.html_url)
          }}
          timeSource={timeSource}
        />
      ))}
      {hasMore && onLoadMore && (
        <button
          className="btn-secondary"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          style={{ width: '100%', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}
        >
          {isLoadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
