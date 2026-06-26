import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { PRList } from './PRList'
import { PinnedFilters, CustomFilterTab } from './PinnedFilters'
import { ReviewFilterSection } from './ReviewFilterSection'
import { SegmentedToggle } from './SegmentedToggle'
import { CommentsList } from './CommentsList'
import { GearIconSimple, RefreshIcon, CheckIcon } from './Icons'
import { AppVersion } from './AppVersion'
import { UpdatePill, UpdateInfo } from './UpdateBanner'
import { formatDistanceToNow } from 'date-fns'

export function MainPanel() {
  const {
    username, avatarUrl, activeTab, setActiveTab, setView, setSettingsSection, setSettingsOrigin,
    settings, updateSettings,
    myPRs, draftPRs, reviewedPRs, reviewRequestedPRs,
    myPRComments, reviewReplies,
    events, badgeCount, markAllRead, pollError,
    tabs, isPolling, lastPollAt, poll, startPolling,
    pendingUpdateVersion, ignoredPRs
  } = useStore()

  const visibleReviewReplies = reviewReplies.filter(
    c => !ignoredPRs.has(`${c.prRepoFullName}#${c.prNumber}`)
  )

  const [myPRsSegment, setMyPRsSegment] = useState<'prs' | 'comments'>('prs')
  const [reviewedSegment, setReviewedSegment] = useState<'prs' | 'replies'>('prs')
  const [showReviewConfig, setShowReviewConfig] = useState(false)
  const [showUpdateInfo, setShowUpdateInfo] = useState(false)

  const selectTab = (id: string) => {
    setShowUpdateInfo(false)
    if (id !== 'review-requested') {
      setShowReviewConfig(false)
    }
    setActiveTab(id)
  }

  useEffect(() => {
    startPolling()
  }, [])

  const visibleTabs = [...tabs]
    .filter(t => t.visible)
    .sort((a, b) => a.order - b.order)
  const contentTabs = visibleTabs.filter(t => t.id !== 'pinned')

  const unreadComments = myPRComments.filter(c => !c.read && !c.isResolved).length
  const unreadReplies = visibleReviewReplies.filter(c => !c.read && !c.isResolved).length
  const reviewFilterCount = settings.reviewRequestedFilter?.length || 0

  const unreadByTab: Record<string, boolean> = {
    'my-prs': events.some(e => !e.read && e.type === 'reply_to_pr') || unreadComments > 0,
    'drafts': false,
    'reviewed': events.some(e => !e.read && e.type === 'reply_to_comment') || unreadReplies > 0,
    'review-requested': events.some(e => !e.read && e.type === 'review_requested'),
    'pinned': false
  }

  const activeCustomTab = tabs.find(tab => tab.id === activeTab && tab.isCustom && !!tab.filter)

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
              ? <PRList prs={myPRs} emptyTitle="No open PRs" emptyText="You don't have any open pull requests." showIncomingReviewState />
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
              ? <PRList prs={reviewedPRs} emptyTitle="No reviewed PRs" emptyText="PRs you've reviewed will appear here." showReviewState allowDismiss />
              : <CommentsList items={visibleReviewReplies} showMyComment emptyTitle="No replies" emptyText="Replies to your review comments will appear here." />
            }
          </>
        )
      case 'review-requested':
        if (showReviewConfig) {
          return <ReviewFilterSection settings={settings} updateSettings={updateSettings} onBack={() => setShowReviewConfig(false)} />
        }
        return (
          <div className="review-requested-view">
            <button className="review-requested-config-row" onClick={() => setShowReviewConfig(true)}>
              <span className="review-requested-config-copy">
                <span className="review-requested-config-title">Review Requested Filters</span>
                <span className="review-requested-config-subtitle">
                  {reviewFilterCount > 0
                    ? `${reviewFilterCount} active filter${reviewFilterCount > 1 ? 's' : ''}`
                    : 'Showing all requests'}
                </span>
              </span>
              <span className="review-requested-config-cta">Configure</span>
            </button>
            <PRList prs={reviewRequestedPRs} emptyTitle="No review requests" emptyText="No one has requested your review." showIncomingReviewState showReviewRequestedState allowIgnore timeSource="created" />
          </div>
        )
      case 'pinned':
        return <PinnedFilters />
      default:
        if (activeCustomTab?.filter) {
          return <CustomFilterTab filter={activeCustomTab.filter} />
        }
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
          <UpdatePill active={showUpdateInfo} onClick={() => setShowUpdateInfo(v => !v)} />
          {badgeCount > 0 && (
            <button className="icon-btn" onClick={markAllRead} title="Mark all read">
              <CheckIcon />
            </button>
          )}
          <button className="icon-btn" onClick={() => poll()} title="Refresh" disabled={isPolling}>
            {isPolling ? <span className="spinner" /> : <RefreshIcon />}
          </button>
          <button className="icon-btn" onClick={() => { setSettingsOrigin('settings'); setSettingsSection('main'); setView('settings') }} title="Settings">
            <GearIconSimple />
          </button>
        </div>
      </div>

      <div className="tabs-wrap">
        <div className="tabs">
          {contentTabs.map(tab => (
            <button
              key={tab.id}
              className={`tab${!showUpdateInfo && activeTab === tab.id ? ' active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
              {unreadByTab[tab.id] && <span className="tab-badge" />}
            </button>
          ))}
          <button
            className={`tab tab-custom-filters-shortcut${!showUpdateInfo && activeTab === 'pinned' ? ' active' : ''}`}
            onClick={() => selectTab('pinned')}
            title="Open Custom Filters"
          >
            Custom Filters
          </button>
          <button
            className="tab tab-customize-shortcut"
            onClick={() => { setSettingsOrigin('main'); setSettingsSection('tabs'); setView('settings') }}
            title="Open Customize Tabs"
          >
            Customize Tabs
          </button>
        </div>
        <div className="tabs-scroll-cue" aria-hidden="true">Scroll &gt;</div>
      </div>

      {showUpdateInfo && pendingUpdateVersion ? <UpdateInfo /> : renderContent()}

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
