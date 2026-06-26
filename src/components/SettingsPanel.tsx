import { useState, useEffect, useCallback } from 'react'
import { useStore, DEMO_MODE, DEMO_TEAM_OPTIONS, DEMO_USER_OPTIONS } from '../store'
import { ChevronLeft, DragHandle, PlusIcon, TrashIcon } from './Icons'
import { AutocompleteInput } from './AutocompleteInput'
import type { TabConfig, AppSettings } from '../types'
import { fetchUserTeams, fetchOrgTeams, fetchUserOrgs, fetchAllOrgTeamSlugs, fetchOrgMembers, type TeamInfo } from '../github'
import { AppVersion } from './AppVersion'
export function SettingsPanel() {
  const { settings, updateSettings, tabs, updateTabs, clearToken, clearBadge, setView, username, ignoredPRs, unignorePR } = useStore()
  const [activeSection, setActiveSection] = useState<'main' | 'tabs' | 'review-filter' | 'ignored-prs'>('main')

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
    const sorted = [...tabs].sort((a, b) => a.order - b.order)
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= sorted.length) return

    const temp = sorted[index].order
    sorted[index] = { ...sorted[index], order: sorted[newIndex].order }
    sorted[newIndex] = { ...sorted[newIndex], order: temp }
    updateTabs(sorted)
  }

  if (activeSection === 'review-filter') {
    return <ReviewFilterSection
      settings={settings}
      updateSettings={updateSettings}
      onBack={() => setActiveSection('main')}
    />
  }

  if (activeSection === 'ignored-prs') {
    return <IgnoredPRsSection
      ignoredPRs={ignoredPRs}
      unignorePR={unignorePR}
      onBack={() => setActiveSection('main')}
    />
  }

  if (activeSection === 'tabs') {
    const sortedTabs = [...tabs].sort((a, b) => a.order - b.order)
    return (
      <>
        <div className="settings-header">
          <button className="settings-back" onClick={() => setActiveSection('main')}>
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
        <button className="settings-back" onClick={() => setView('main')}>
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
          <div className="settings-section-title">Review Requested</div>
          <div className="settings-sublabel" style={{ marginBottom: 8 }}>
            Filter the noisy review list to specific users or teams
          </div>
          <button className="btn-secondary" onClick={() => setActiveSection('review-filter')} style={{ width: '100%', textAlign: 'left' }}>
            {(settings.reviewRequestedFilter?.length)
              ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {settings.reviewRequestedFilter.length} filter{settings.reviewRequestedFilter.length > 1 ? 's' : ''} active
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {settings.reviewRequestedFilter.join(', ')}
                  </span>
                </span>
              )
              : 'Configure Filter (showing all)'}
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Tabs</div>
          <button className="btn-secondary" onClick={() => setActiveSection('tabs')} style={{ width: '100%' }}>
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
              <button className="btn-secondary" onClick={() => setActiveSection('ignored-prs')}>
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
          <button className="btn-danger" onClick={clearToken} style={{ marginTop: 8 }}>
            Revoke Token & Sign Out
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

function ReviewFilterSection({
  settings,
  updateSettings,
  onBack
}: {
  settings: AppSettings
  updateSettings: (s: Partial<AppSettings>) => void
  onBack: () => void
}) {
  const { token, username } = useStore()
  const filters = settings.reviewRequestedFilter || []
  const [discoveredTeams, setDiscoveredTeams] = useState<TeamInfo[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)

  useEffect(() => {
    if (DEMO_MODE) {
      setDiscoveredTeams(DEMO_TEAM_OPTIONS.map(fullSlug => {
        const [org, slug] = fullSlug.split('/')
        return {
          slug,
          org,
          name: slug.replace(/-/g, ' '),
          fullSlug
        }
      }))
      setLoadingTeams(false)
      setTeamError(null)
      return
    }

    if (!token) return
    setLoadingTeams(true)
    setTeamError(null)

    fetchUserTeams(token).then(teams => {
      if (teams.length > 0) {
        setDiscoveredTeams(teams)
        setLoadingTeams(false)
        return
      }
      // Fallback: try fetching from each org
      fetchUserOrgs(token).then(async orgs => {
        const allTeams: TeamInfo[] = []
        for (const org of orgs) {
          const orgTeams = await fetchOrgTeams(token, org)
          allTeams.push(...orgTeams)
        }
        setDiscoveredTeams(allTeams)
        if (allTeams.length === 0 && orgs.length > 0) {
          setTeamError('Could not fetch teams (SAML/SSO may require authorizing your token)')
        }
        setLoadingTeams(false)
      })
    })
  }, [token])

  const addEntry = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || filters.includes(trimmed)) return
    updateSettings({ reviewRequestedFilter: [...filters, trimmed] })
  }

  const removeEntry = (entry: string) => {
    updateSettings({ reviewRequestedFilter: filters.filter(f => f !== entry) })
  }

  const isTeam = (entry: string) => entry.includes('/')
  const suggestions = discoveredTeams
    .filter(t => !filters.includes(t.fullSlug))
    .slice(0, 10)

  const fetchTeamAndUserSuggestions = useCallback(async (query: string) => {
    if (DEMO_MODE) {
      const demoOptions = [...DEMO_TEAM_OPTIONS, ...DEMO_USER_OPTIONS]
      const unique = [...new Set(demoOptions)].filter(option => !filters.includes(option))
      return query ? unique.filter(option => option.toLowerCase().includes(query.toLowerCase())) : unique
    }
    if (!token) return []
    const results: string[] = []
    const orgs = await fetchUserOrgs(token)
    for (const org of orgs) {
      const teams = await fetchAllOrgTeamSlugs(token, org)
      results.push(...teams)
      const members = await fetchOrgMembers(token, org)
      results.push(...members)
    }
    const unique = [...new Set(results)].filter(r => !filters.includes(r))
    return query ? unique.filter(r => r.toLowerCase().includes(query.toLowerCase())) : unique
  }, [token, filters])

  return (
    <>
      <div className="settings-header">
        <button className="settings-back" onClick={onBack}>
          <ChevronLeft />
        </button>
        <span className="settings-title">Review Requested</span>
      </div>
      <div className="settings-panel">
        <div className="settings-section">
          <div className="settings-section-title">Active Filters</div>
          <div className="settings-sublabel" style={{ marginBottom: 12 }}>
            Only show PRs where review is requested from these targets.
            Without any filters, shows all review requests for you.
          </div>

          {filters.length === 0 ? (
            <div style={{
              padding: '12px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.5,
              marginBottom: 12
            }}>
              No filters active — showing <strong style={{ color: 'var(--text-secondary)' }}>all</strong> review
              requests including catch-all teams.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {filters.map(entry => (
                <div key={entry} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 5px',
                      borderRadius: 3,
                      background: isTeam(entry) ? 'var(--purple)' : 'var(--accent)',
                      color: 'white',
                      letterSpacing: '0.3px'
                    }}>
                      {isTeam(entry) ? 'team' : 'user'}
                    </span>
                    <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12 }}>{entry}</span>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => removeEntry(entry)}
                    style={{ color: 'var(--red)', width: 24, height: 24 }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 4 }}>
            <AutocompleteInput
              value={[]}
              onChange={items => { if (items.length > 0) addEntry(items[items.length - 1]) }}
              fetchSuggestions={fetchTeamAndUserSuggestions}
              placeholder="Search teams or usernames…"
              allowCustom
            />
          </div>
        </div>

        {/* Quick add: username */}
        {username && !filters.includes(username) && (
          <div className="settings-section">
            <div className="settings-section-title">Quick Add</div>
            <button
              className="btn-secondary"
              onClick={() => addEntry(username)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                textAlign: 'left'
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                padding: '2px 5px', borderRadius: 3,
                background: 'var(--accent)', color: 'white', flexShrink: 0
              }}>user</span>
              <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {username}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(direct requests)</span>
              <PlusIcon />
            </button>
          </div>
        )}

        {/* Discovered teams */}
        <div className="settings-section">
          <div className="settings-section-title">
            {loadingTeams ? 'Discovering Teams…' : 'Your Teams'}
          </div>
          {loadingTeams ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{DEMO_MODE ? 'Loading demo teams…' : 'Fetching from GitHub…'}</span>
            </div>
          ) : teamError ? (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--orange)', marginBottom: 8, lineHeight: 1.5 }}>
                {teamError}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                You can still manually type team slugs above in the format <code>org/team-slug</code>
              </div>
            </div>
          ) : suggestions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {suggestions.map(team => (
                <button
                  key={team.fullSlug}
                  className="btn-secondary"
                  onClick={() => addEntry(team.fullSlug)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left'
                  }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                    padding: '2px 5px', borderRadius: 3,
                    background: 'var(--purple)', color: 'white', flexShrink: 0
                  }}>team</span>
                  <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {team.fullSlug}
                  </span>
                  <PlusIcon />
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', lineHeight: 1.5 }}>
              {discoveredTeams.length === 0 && !teamError
                ? 'No teams found. Type team slugs manually above (e.g. org/squad-paganica).'
                : 'All discovered teams have been added.'}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="settings-section">
          <div className="settings-section-title">How it works</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                background: 'var(--accent)', color: 'white', marginTop: 2, flexShrink: 0
              }}>user</span>
              <span>PRs where <strong>you</strong> are directly requested as a reviewer</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                background: 'var(--purple)', color: 'white', marginTop: 2, flexShrink: 0
              }}>team</span>
              <span>PRs where a <strong>specific team</strong> is requested (e.g. squad-paganica)</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              Tip: Filter out noisy catch-all teams (like <em>core-squad</em>) by only adding the teams you care about.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
