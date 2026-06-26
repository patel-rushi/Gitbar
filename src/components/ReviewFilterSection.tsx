import { useCallback, useEffect, useState } from 'react'
import { useStore, DEMO_MODE, DEMO_TEAM_OPTIONS, DEMO_USER_OPTIONS } from '../store'
import type { AppSettings } from '../types'
import { fetchUserTeams, fetchOrgTeams, fetchUserOrgs, fetchAllOrgTeamSlugs, fetchOrgMembers, type TeamInfo } from '../github'
import { ChevronLeft, PlusIcon, TrashIcon } from './Icons'
import { AutocompleteInput } from './AutocompleteInput'

export function ReviewFilterSection({
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
