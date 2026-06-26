import type { PullRequest } from '../types'
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
  allowIgnore?: boolean
  allowDismiss?: boolean
  timeSource?: 'updated' | 'created'
}

export function PRList({ prs, emptyTitle = 'No pull requests', emptyText = 'Nothing here yet.', showReviewState, showIncomingReviewState, showReviewRequestedState, allowIgnore, allowDismiss, timeSource }: PRListProps) {
  const store = useStore()
  const { ignoredPRs, ignorePR, dismissReviewedPR } = store

  const filteredPRs = allowIgnore || allowDismiss
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
          showReviewRequestedState={showReviewRequestedState}
          onIgnore={
            allowDismiss
              ? () => dismissReviewedPR(pr.repo_full_name, pr.number)
              : allowIgnore
                ? () => ignorePR(`${pr.repo_full_name}#${pr.number}`)
                : undefined
          }
          ignoreVariant={allowDismiss ? 'check' : 'cross'}
          ignoreTitle={allowDismiss ? 'Dismiss — stop showing this PR' : undefined}
          onClick={() => window.gitbar?.openExternal(pr.html_url)}
          timeSource={timeSource}
        />
      ))}
    </div>
  )
}
