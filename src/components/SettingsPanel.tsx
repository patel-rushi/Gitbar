import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { ChevronLeft } from './Icons'
import type { TabConfig } from '../types'
import { AppVersion } from './AppVersion'
export function SettingsPanel() {
  const { settings, updateSettings, tabs, updateTabs, clearToken, clearAllData, clearBadge, setView, username, ignoredPRs, unignorePR, settingsSection, setSettingsSection, settingsOrigin, setSettingsOrigin } = useStore()
  const [activeSection, setActiveSection] = useState<'main' | 'tabs' | 'ignored-prs'>(settingsSection)

  useEffect(() => {
    setActiveSection(settingsSection)
  }, [settingsSection])

  const handleToggle = (key: keyof typeof settings.notifications) => {
    updateSettings({
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key]
      }
    })
  }

  const handleTabRename = (id: string, label: string) => {
    const updated = tabs.map(t => t.id === id ? { ...t, label } : t)
    updateTabs(updated)
  }

  const handleTabVisibility = (id: string) => {
    const updated = tabs.map(t => t.id === id ? { ...t, visible: !t.visible } : t)
    updateTabs(updated)
  }

  const moveTab = (index: number, direction: -1 | 1) => {
    const pinned = tabs.find(t => t.id === 'pinned' && !t.isCustom)
    const sorted = [...tabs]
      .filter(t => !(t.id === 'pinned' && !t.isCustom))
      .sort((a, b) => a.order - b.order)
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= sorted.length) return

    const temp = sorted[index].order
    sorted[index] = { ...sorted[index], order: sorted[newIndex].order }
    sorted[newIndex] = { ...sorted[newIndex], order: temp }
    const normalized = [...sorted].sort((a, b) => a.order - b.order)
    const next = pinned ? [...normalized, pinned] : normalized
    updateTabs(next.map((t, i) => ({ ...t, order: i })))
  }

  if (activeSection === 'ignored-prs') {
    return <IgnoredPRsSection
      ignoredPRs={ignoredPRs}
      unignorePR={unignorePR}
      onBack={() => { setActiveSection('main'); setSettingsSection('main') }}
    />
  }

  if (activeSection === 'tabs') {
    const sortedTabs = [...tabs]
      .filter(t => !(t.id === 'pinned' && !t.isCustom))
      .sort((a, b) => a.order - b.order)
    return (
      <>
        <div className="settings-header">
          <button className="settings-back" onClick={() => {
            if (settingsOrigin === 'main') {
              setSettingsOrigin('settings')
              setSettingsSection('main')
              setActiveSection('main')
              setView('main')
              return
            }
            setActiveSection('main')
            setSettingsSection('main')
          }}>
            <ChevronLeft />
          </button>
          <span className="settings-title">Customize Tabs</span>
        </div>
        <div className="settings-panel">
          <div className="settings-section">
            <div className="settings-section-title">Tab Order & Visibility</div>
            {sortedTabs.map((tab, idx) => (
              <div key={tab.id} className="tab-custom-item">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    className="icon-btn"
                    onClick={() => moveTab(idx, -1)}
                    disabled={idx === 0}
                    style={{ width: 20, height: 16, fontSize: 10, opacity: idx === 0 ? 0.3 : 1 }}
                  >▲</button>
                  <button
                    className="icon-btn"
                    onClick={() => moveTab(idx, 1)}
                    disabled={idx === sortedTabs.length - 1}
                    style={{ width: 20, height: 16, fontSize: 10, opacity: idx === sortedTabs.length - 1 ? 0.3 : 1 }}
                  >▼</button>
                </div>
                <input
                  className="tab-custom-name"
                  value={tab.label}
                  onChange={e => handleTabRename(tab.id, e.target.value)}
                />
                <button
                  className={`toggle${tab.visible ? ' on' : ''}`}
                  onClick={() => handleTabVisibility(tab.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="settings-header">
        <button className="settings-back" onClick={() => { setSettingsSection('main'); setView('main') }}>
          <ChevronLeft />
        </button>
        <span className="settings-title">Settings</span>
      </div>
      <div className="settings-panel">
        <div className="settings-section">
          <div className="settings-section-title">Notifications</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Replies to my PRs</div>
              <div className="settings-sublabel">When someone comments on your PR</div>
            </div>
            <button
              className={`toggle${settings.notifications.repliesToMyPR ? ' on' : ''}`}
              onClick={() => handleToggle('repliesToMyPR')}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Replies to my comments</div>
              <div className="settings-sublabel">When someone replies to your comment</div>
            </div>
            <button
              className={`toggle${settings.notifications.repliesToMyComments ? ' on' : ''}`}
              onClick={() => handleToggle('repliesToMyComments')}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">@mentions</div>
              <div className="settings-sublabel">When you're mentioned in a PR</div>
            </div>
            <button
              className={`toggle${settings.notifications.mentions ? ' on' : ''}`}
              onClick={() => handleToggle('mentions')}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Review requested</div>
              <div className="settings-sublabel">When a review is requested from you</div>
            </div>
            <button
              className={`toggle${settings.notifications.reviewRequested ? ' on' : ''}`}
              onClick={() => handleToggle('reviewRequested')}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Comments</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Hide resolved comments</div>
              <div className="settings-sublabel">When off, resolved threads show with a strikethrough</div>
            </div>
            <button
              className={`toggle${settings.hideResolvedComments ? ' on' : ''}`}
              onClick={() => updateSettings({ hideResolvedComments: !settings.hideResolvedComments })}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Polling Interval</div>
          <div className="settings-range">
            <input
              type="range"
              min={15}
              max={300}
              step={15}
              value={settings.pollingInterval}
              onChange={e => updateSettings({ pollingInterval: Number(e.target.value) })}
            />
            <span className="settings-range-value">{settings.pollingInterval}s</span>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Tabs</div>
          <button className="btn-secondary" onClick={() => { setSettingsOrigin('settings'); setActiveSection('tabs'); setSettingsSection('tabs') }} style={{ width: '100%' }}>
            Customize Tabs
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Actions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={clearBadge}>
              Clear Badge Count
            </button>
            {ignoredPRs.size > 0 && (
              <button className="btn-secondary" onClick={() => { setActiveSection('ignored-prs'); setSettingsSection('ignored-prs') }}>
                Manage Ignored PRs ({ignoredPRs.size})
              </button>
            )}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Account</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Signed in as <strong>{username}</strong></div>
              <div className="settings-sublabel">Personal Access Token</div>
            </div>
          </div>
          <div className="settings-sublabel" style={{ marginTop: 8, lineHeight: 1.5 }}>
            Sign out only disconnects your account. Your tabs, custom filters, review settings, and ignored PRs stay on this device.
          </div>
          <button className="btn-danger" onClick={clearToken} style={{ marginTop: 8 }}>
            Revoke Token & Sign Out
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Reset</div>
          <div className="settings-sublabel" style={{ marginBottom: 8, lineHeight: 1.5 }}>
            Use this if you want to start fresh. This removes your local customization and stored app data.
          </div>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('This will clear all saved customization and app data on this device. Continue?')) {
                clearAllData()
              }
            }}
          >
            Clear All Data
          </button>
        </div>

        <div className="settings-version"><AppVersion /></div>
      </div>
    </>
  )
}

function IgnoredPRsSection({
  ignoredPRs,
  unignorePR,
  onBack
}: {
  ignoredPRs: Set<string>
  unignorePR: (prKey: string) => void
  onBack: () => void
}) {
  const ignoredList = Array.from(ignoredPRs).sort()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelected(new Set())
  }, [ignoredPRs.size])

  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  const selectAll = () => setSelected(new Set(ignoredList))
  const clearSelection = () => setSelected(new Set())

  const unignoreSelected = () => {
    for (const key of selected) unignorePR(key)
    setSelected(new Set())
  }

  const unignoreAll = () => {
    for (const key of ignoredList) unignorePR(key)
    setSelected(new Set())
  }

  return (
    <>
      <div className="settings-header">
        <button className="settings-back" onClick={onBack}>
          <ChevronLeft />
        </button>
        <span className="settings-title">Ignored PRs</span>
      </div>
      <div className="settings-panel">
        <div className="settings-section">
          <div className="settings-section-title">Manage Ignored PRs</div>
          <div className="settings-sublabel" style={{ marginBottom: 10 }}>
            Unignore individual PRs or select multiple at once.
          </div>

          {ignoredList.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              No ignored PRs.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="btn-secondary" onClick={selectAll}>Select All</button>
                <button className="btn-secondary" onClick={clearSelection} disabled={selected.size === 0}>Clear</button>
                <button className="btn-secondary" onClick={unignoreSelected} disabled={selected.size === 0}>
                  Unignore Selected ({selected.size})
                </button>
                <button className="btn-secondary" onClick={unignoreAll}>
                  Unignore All ({ignoredList.length})
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ignoredList.map(key => {
                  const [repo, pr] = key.split('#')
                  return (
                    <div key={key} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '8px 10px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                        />
                        <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {repo}#{pr}
                        </span>
                      </label>
                      <button className="btn-secondary" onClick={() => unignorePR(key)}>
                        Unignore
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

