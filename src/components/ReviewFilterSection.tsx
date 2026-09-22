import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore, DEMO_MODE, DEMO_TEAM_OPTIONS, DEMO_USER_OPTIONS } from '../store'
import type { AppSettings } from '../types'
import { fetchUserTeams, fetchOrgTeams, fetchUserOrgs, fetchAllOrgTeamSlugs, fetchOrgMembers, searchGitHubUsernames, fetchFrequentCollaborators, type TeamInfo } from '../github'
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
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [visibleCollaboratorCount, setVisibleCollaboratorCount] = useState(7)
  const COLLABORATOR_PAGE_SIZE = 7

  useEffect(() => {
    if (DEMO_MODE) {
      setCollaborators(DEMO_USER_OPTIONS.filter(u => u !== username))
      return
    }
    if (!token || !username) return
    setLoadingCollaborators(true)
    fetchFrequentCollaborators(token, username)
      .then(setCollaborators)
      .finally(() => setLoadingCollaborators(false))
  }, [token, username])

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
    window.gitbar?.trackAnalytics('review_filter_updated', { action: 'added', target_type: trimmed.includes('/') ? 'team' : 'user' })
  }

  const removeEntry = (entry: string) => {
    updateSettings({ reviewRequestedFilter: filters.filter(f => f !== entry) })
    window.gitbar?.trackAnalytics('review_filter_updated', { action: 'removed', target_type: entry.includes('/') ? 'team' : 'user' })
  }

  const isTeam = (entry: string) => entry.includes('/')
  const isSelf = (entry: string) => !!username && entry.toLowerCase() === username.toLowerCase()
  const suggestions = discoveredTeams
    .filter(t => !filters.includes(t.fullSlug))
    .slice(0, 10)

  // People you're actively involved with on PRs (via a live GitHub search on mount) —
  // a proxy for "active collaborators", mirroring the team suggestions below.
  const availableCollaborators = useMemo(() =>
    collaborators.filter(login => !filters.includes(login)),
  [collaborators, filters])
  const suggestedCollaborators = availableCollaborators.slice(0, visibleCollaboratorCount)

  const fetchTeamAndUserSuggestions = useCallback(async (query: string) => {
    if (DEMO_MODE) {
      const demoOptions = [...DEMO_TEAM_OPTIONS, ...DEMO_USER_OPTIONS]
      const unique = [...new Set(demoOptions)].filter(option => !filters.includes(option))
      return query ? unique.filter(option => option.toLowerCase().includes(query.toLowerCase())) : unique
    }
    if (!token) return []
    const orgs = await fetchUserOrgs(token)
    const perOrg = await Promise.all(orgs.map(async org => {
      const [teams, members] = await Promise.all([fetchAllOrgTeamSlugs(token, org), fetchOrgMembers(token, org)])
      return [...teams, ...members]
    }))
    const results = perOrg.flat()
    const trimmed = query.trim().toLowerCase()
    const localMatchCount = trimmed ? results.filter(r => r.toLowerCase().includes(trimmed)).length : results.length
    // `/orgs/{org}/members` misses private-visibility members, so a valid colleague's
    // login can be typed but never show up. Only fall back to a live (rate-limited)
    // username search when local results are thin, to avoid hammering the search API.
    if (query.trim().length >= 2 && localMatchCount < 3) {
      results.push(...await searchGitHubUsernames(token, query))
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
            Add an author to see PRs they opened, a team to see PRs waiting on that team's
            review, or yourself to see PRs that name you directly.
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
              No filters active: showing PRs that request a review from <strong style={{ color: 'var(--text-secondary)' }}>you or your teams</strong>.
              Add an author or team below to take over from this default.
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
                      {isTeam(entry) ? 'team' : isSelf(entry) ? 'you' : 'author'}
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
              placeholder="Search authors or teams…"
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
              }}>you</span>
              <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {username}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(direct requests)</span>
              <PlusIcon />
            </button>
          </div>
        )}

        {/* People you actively collaborate with */}
        <div className="settings-section">
          <div className="settings-section-title">
            {loadingCollaborators ? 'Finding Authors You Work With…' : 'Authors You Work With'}
          </div>
          {loadingCollaborators ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fetching from GitHub…</span>
            </div>
          ) : availableCollaborators.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', lineHeight: 1.5 }}>
              {collaborators.length === 0
                ? 'No suggestions right now. Search for anyone by username above.'
                : 'All suggested authors have been added.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {suggestedCollaborators.map(login => (
                <button
                  key={login}
                  className="btn-secondary"
                  onClick={() => addEntry(login)}
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
                  }}>author</span>
                  <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {login}
                  </span>
                  <PlusIcon />
                </button>
              ))}
              {visibleCollaboratorCount < availableCollaborators.length && (
                <button
                  className="btn-secondary"
                  onClick={() => setVisibleCollaboratorCount(n => Math.min(n + COLLABORATOR_PAGE_SIZE, availableCollaborators.length))}
                  style={{ width: '100%', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}
                >
                  Show more
                </button>
              )}
            </div>
          )}
        </div>

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
              }}>author</span>
              <span>Open PRs opened by that <strong>person</strong></span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                background: 'var(--accent)', color: 'white', marginTop: 2, flexShrink: 0
              }}>you</span>
              <span>PRs that request <strong>you</strong> by name, not ones routed to a team you're on</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                background: 'var(--purple)', color: 'white', marginTop: 2, flexShrink: 0
              }}>team</span>
              <span>PRs where that <strong>team</strong> is requested to review (e.g. squad-paganica)</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              With no filters, GitBar shows everything asking for your review, including via
              your teams. Adding any filter replaces that default entirely.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
