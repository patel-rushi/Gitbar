import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { PRList } from './PRList'
import { PinnedFilters } from './PinnedFilters'
import { SegmentedToggle } from './SegmentedToggle'
import { CommentsList } from './CommentsList'
import { GearIconSimple, RefreshIcon, CheckIcon } from './Icons'
import { AppVersion } from './AppVersion'
import { UpdateBanner } from './UpdateBanner'
import { formatDistanceToNow } from 'date-fns'

export function MainPanel() {
  const {
    username, avatarUrl, activeTab, setActiveTab, setView,
    myPRs, draftPRs, reviewedPRs, reviewRequestedPRs, squadActivityPRs,
    myPRComments, reviewReplies,
    events, badgeCount, markAllRead, pollError,
    tabs, isPolling, lastPollAt, poll, startPolling
  } = useStore()

  const [myPRsSegment, setMyPRsSegment] = useState<'prs' | 'comments'>('prs')
  const [reviewedSegment, setReviewedSegment] = useState<'prs' | 'replies'>('prs')

  useEffect(() => {
    startPolling()
  }, [])

  const visibleTabs = [...tabs]
    .filter(t => t.visible)
    .sort((a, b) => a.order - b.order)

  const unreadComments = myPRComments.filter(c => !c.read && !c.isResolved).length
  const unreadReplies = reviewReplies.filter(c => !c.read && !c.isResolved).length

  const unreadByTab: Record<string, boolean> = {
    'my-prs': events.some(e => !e.read && e.type === 'reply_to_pr') || unreadComments > 0,
    'drafts': false,
    'reviewed': events.some(e => !e.read && e.type === 'reply_to_comment') || unreadReplies > 0,
    'review-requested': events.some(e => !e.read && e.type === 'review_requested'),
    'squad-activity': false,
    'pinned': false
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'my-prs':
        return (
          <>
            <SegmentedToggle
              segments={[
                { id: 'prs', label: 'PRs' },
                { id: 'comments', label: 'Comments', badge: unreadComments }
              ]}
              active={myPRsSegment}
              onChange={id => setMyPRsSegment(id as 'prs' | 'comments')}
            />
            {myPRsSegment === 'prs'
              ? <PRList prs={myPRs} emptyTitle="No open PRs" emptyText="You don't have any open pull requests." commentSource="myPRComments" onCommentBadgeClick={() => setMyPRsSegment('comments')} showIncomingReviewState />
              : <CommentsList items={myPRComments} emptyTitle="No comments" emptyText="Comments on your PRs will appear here." />
            }
          </>
        )
      case 'drafts':
        return <PRList prs={draftPRs} emptyTitle="No draft PRs" emptyText="Your draft pull requests will appear here." />
      case 'reviewed':
        return (
          <>
            <SegmentedToggle
              segments={[
                { id: 'prs', label: 'PRs' },
                { id: 'replies', label: 'Replies', badge: unreadReplies }
              ]}
              active={reviewedSegment}
              onChange={id => setReviewedSegment(id as 'prs' | 'replies')}
            />
            {reviewedSegment === 'prs'
              ? <PRList prs={reviewedPRs} emptyTitle="No reviewed PRs" emptyText="PRs you've reviewed will appear here." showReviewState commentSource="reviewReplies" onCommentBadgeClick={() => setReviewedSegment('replies')} />
              : <CommentsList items={reviewReplies} showMyComment emptyTitle="No replies" emptyText="Replies to your review comments will appear here." />
            }
          </>
        )
      case 'review-requested':
        return <PRList prs={reviewRequestedPRs} emptyTitle="No review requests" emptyText="No one has requested your review." allowIgnore timeSource="created" />
      case 'squad-activity':
        return <PRList prs={squadActivityPRs} emptyTitle="No squad activity" emptyText="PRs your team is reviewing will appear here. Configure teams in Settings → Review Requested." />
      case 'pinned':
        return <PinnedFilters />
      default:
        return <PRList prs={[]} />
    }
  }

  return (
    <>
      <div className="header">
        <div className="header-left">
          {avatarUrl && <img className="header-avatar" src={avatarUrl} alt={username || ''} />}
          <span className="header-title">GitBar</span>
          <AppVersion className="header-version" />
          {badgeCount > 0 && (
            <span style={{
              background: 'var(--red)',
              color: 'white',
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 10,
              minWidth: 18,
              textAlign: 'center'
            }}>
              {badgeCount}
            </span>
          )}
        </div>
        <div className="header-actions">
          {badgeCount > 0 && (
            <button className="icon-btn" onClick={markAllRead} title="Mark all read">
              <CheckIcon />
            </button>
          )}
          <button className="icon-btn" onClick={() => poll()} title="Refresh" disabled={isPolling}>
            {isPolling ? <span className="spinner" /> : <RefreshIcon />}
          </button>
          <button className="icon-btn" onClick={() => setView('settings')} title="Settings">
            <GearIconSimple />
          </button>
        </div>
      </div>

      <UpdateBanner />

      <div className="tabs">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={`tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {unreadByTab[tab.id] && <span className="tab-badge" />}
          </button>
        ))}
      </div>

      {renderContent()}

      <div className="footer">
        {pollError ? (
          <span style={{ color: 'var(--red)', fontSize: 11 }}>{pollError}</span>
        ) : isPolling ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="poll-dot" /> Syncing…
          </span>
        ) : lastPollAt ? (
          <span>Updated {formatDistanceToNow(new Date(lastPollAt), { addSuffix: true })}</span>
        ) : (
          <span>Not synced yet</span>
        )}
        <span className="footer-right">
          <AppVersion />
          {username && <span className="footer-username">{username}</span>}
        </span>
      </div>
    </>
  )
}
