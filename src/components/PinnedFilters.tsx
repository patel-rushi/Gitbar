import { useState, useEffect, useCallback } from 'react'
import { useStore, DEMO_MODE } from '../store'
import type { PullRequest, CustomFilter } from '../types'
import { fetchFilteredPRs, fetchRepoLabels, fetchOrgRepos, fetchOrgMembers, fetchUserOrgs } from '../github'
import { PRItem } from './PRItem'
import { AutocompleteInput } from './AutocompleteInput'
import { InboxIcon, PlusIcon, TrashIcon, PencilIcon } from './Icons'

interface SavedFilter extends CustomFilter {
  id: string
}

const PINNED_FILTERS_KEY = DEMO_MODE ? 'gitbar_custom_filters_demo' : 'gitbar_custom_filters'

function loadFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(PINNED_FILTERS_KEY)
    const parsed: SavedFilter[] = raw ? JSON.parse(raw) : []
    return parsed
  } catch {
    return []
  }
}

function saveFilters(filters: SavedFilter[]) {
  localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(filters))
  window.gitbar?.storeSet(PINNED_FILTERS_KEY, filters)
}

export function PinnedFilters() {
  const { token, tabs, updateTabs } = useStore()
  const [filters, setFilters] = useState<SavedFilter[]>(loadFilters)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [results, setResults] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftAsTab, setDraftAsTab] = useState(false)
  const [draft, setDraft] = useState<Omit<SavedFilter, 'id'>>({
    name: '',
    labels: [],
    repos: [],
    authors: [],
    query: ''
  })

  const emptyDraft = (): Omit<SavedFilter, 'id'> => ({ name: '', labels: [], repos: [], authors: [], query: '' })
  const tabIdForFilter = (id: string) => `custom-filter-${id}`
  const toTabFilter = (filter: SavedFilter): CustomFilter => ({
    name: filter.name,
    labels: filter.labels,
    repos: filter.repos,
    authors: filter.authors,
    query: filter.query
  })

  const upsertCustomFilterTab = (filter: SavedFilter) => {
    const tabId = tabIdForFilter(filter.id)
    const existing = tabs.find(t => t.id === tabId)
    const nextFilter = toTabFilter(filter)
    if (existing) {
      updateTabs(tabs.map(t => t.id === tabId ? { ...t, label: filter.name, filter: nextFilter } : t))
      return
    }

    const pinned = tabs.find(t => t.id === 'pinned' && !t.isCustom)
    const withoutPinned = [...tabs]
      .filter(t => !(t.id === 'pinned' && !t.isCustom))
      .sort((a, b) => a.order - b.order)

    const nextTabs = [
      ...withoutPinned,
      {
        id: tabId,
        label: filter.name,
        visible: true,
        order: withoutPinned.length,
        isCustom: true,
        filter: nextFilter
      },
      ...(pinned ? [pinned] : [])
    ]

    updateTabs(nextTabs.map((t, i) => ({ ...t, order: i })))
  }

  const removeCustomFilterTab = (filterId: string) => {
    const tabId = tabIdForFilter(filterId)
    const hadTarget = tabs.some(t => t.id === tabId)
    const pinned = tabs.find(t => t.id === 'pinned' && !t.isCustom)
    const updated = tabs
      .filter(t => t.id !== tabId && !(t.id === 'pinned' && !t.isCustom))
      .sort((a, b) => a.order - b.order)
    const next = pinned ? [...updated, pinned] : updated
    if (hadTarget) {
      updateTabs(next.map((t, i) => ({ ...t, order: i })))
    }
  }

  const isTabbed = (filterId: string) => tabs.some(t => t.id === tabIdForFilter(filterId))

  const startCreate = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setDraftAsTab(false)
    setEditing(true)
  }

  const startEdit = (f: SavedFilter) => {
    setEditingId(f.id)
    setDraft({ name: f.name, labels: f.labels, repos: f.repos, authors: f.authors, query: f.query ?? '' })
    setDraftAsTab(isTabbed(f.id))
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditingId(null)
    setDraftAsTab(false)
    setDraft(emptyDraft())
  }

  const [orgs, setOrgs] = useState<string[]>([])

  useEffect(() => {
    if (token) {
      fetchUserOrgs(token).then(setOrgs)
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    window.gitbar?.storeGet(PINNED_FILTERS_KEY).then((stored: SavedFilter[] | null) => {
      if (cancelled || !stored || !Array.isArray(stored)) return
      setFilters(stored)
      localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(stored))
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const [filterError, setFilterError] = useState<string | null>(null)

  useEffect(() => {
    if (activeFilter && token) {
      const f = filters.find(f => f.id === activeFilter)
      if (!f) return
      setLoading(true)
      setFilterError(null)
      fetchFilteredPRs(token, f)
        .then(prs => {
          setResults(prs)
          setLoading(false)
        })
        .catch(err => {
          setLoading(false)
          setFilterError(err.message || 'Failed to fetch')
        })
    }
  }, [activeFilter, token, filters])

  const saveFilter = () => {
    if (!draft.name.trim()) return
    const id = editingId ?? Date.now().toString()
    const nextFilter = { ...draft, id }
    const updated = editingId
      ? filters.map(f => (f.id === editingId ? nextFilter : f))
      : [...filters, nextFilter]
    setFilters(updated)
    saveFilters(updated)
    setEditing(false)
    setEditingId(null)
    setDraftAsTab(false)
    setDraft(emptyDraft())
    setActiveFilter(id)

    if (draftAsTab) {
      upsertCustomFilterTab(nextFilter)
    } else {
      removeCustomFilterTab(id)
    }
  }

  const fetchLabelSuggestions = useCallback(async (query: string) => {
    if (!token) return []
    const allLabels: string[] = []
    // Fetch from repos if selected, otherwise from first org's main repos
    const repos = draft.repos.length > 0 ? draft.repos : orgs.slice(0, 1).map(o => `${o}/${o}`)
    for (const repo of repos.slice(0, 2)) {
      const [owner, name] = repo.split('/')
      if (owner && name) {
        const labels = await fetchRepoLabels(token, owner, name)
        allLabels.push(...labels)
      }
    }
    // Also try the main org repo
    if (allLabels.length === 0 && orgs.length > 0) {
      for (const org of orgs) {
        const orgRepos = await fetchOrgRepos(token, org)
        if (orgRepos.length > 0) {
          const [owner, name] = orgRepos[0].split('/')
          if (owner && name) {
            const labels = await fetchRepoLabels(token, owner, name)
            allLabels.push(...labels)
            break
          }
        }
      }
    }
    const unique = [...new Set(allLabels)]
    return query ? unique.filter(l => l.toLowerCase().includes(query.toLowerCase())) : unique
  }, [token, draft.repos, orgs])

  const fetchRepoSuggestions = useCallback(async (query: string) => {
    if (!token) return []
    const allRepos: string[] = []
    for (const org of orgs) {
      const repos = await fetchOrgRepos(token, org)
      allRepos.push(...repos)
    }
    return query ? allRepos.filter(r => r.toLowerCase().includes(query.toLowerCase())) : allRepos
  }, [token, orgs])

  const fetchAuthorSuggestions = useCallback(async (query: string) => {
    if (!token) return []
    const allMembers: string[] = []
    for (const org of orgs) {
      const members = await fetchOrgMembers(token, org)
      allMembers.push(...members)
    }
    const unique = [...new Set(allMembers)]
    return query ? unique.filter(m => m.toLowerCase().includes(query.toLowerCase())) : unique
  }, [token, orgs])

  const removeFilter = (id: string) => {
    const updated = filters.filter(f => f.id !== id)
    setFilters(updated)
    saveFilters(updated)
    removeCustomFilterTab(id)
    if (activeFilter === id) {
      setActiveFilter(null)
      setResults([])
    }
  }

  if (editing) {
    return (
      <div className="pr-list" style={{ padding: '12px 16px' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{editingId ? 'Edit Filter' : 'New Custom Filter'}</div>
          <div className="filter-field">
            <label>Filter Name</label>
            <input
              className="filter-input"
              placeholder="e.g. WIP PRs, Urgent"
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="filter-field">
            <label>Repositories</label>
            <AutocompleteInput
              value={draft.repos}
              onChange={repos => setDraft({ ...draft, repos })}
              fetchSuggestions={fetchRepoSuggestions}
              placeholder="Search repos…"
            />
          </div>
          <div className="filter-field">
            <label>Labels</label>
            <AutocompleteInput
              value={draft.labels}
              onChange={labels => setDraft({ ...draft, labels })}
              fetchSuggestions={fetchLabelSuggestions}
              placeholder="Search labels…"
            />
          </div>
          <div className="filter-field">
            <label>Authors</label>
            <AutocompleteInput
              value={draft.authors}
              onChange={authors => setDraft({ ...draft, authors })}
              fetchSuggestions={fetchAuthorSuggestions}
              placeholder="Search teammates…"
            />
          </div>
          <div className="filter-field">
            <label>Advanced query <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span></label>
            <input
              className="filter-input"
              placeholder="e.g. draft:false -review:approved"
              value={draft.query ?? ''}
              onChange={e => setDraft({ ...draft, query: e.target.value })}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
              GitHub search qualifiers, combined with the fields above. <code>is:pr is:open</code> are added automatically unless you set them here.
            </div>
          </div>
          <div className="filter-field" style={{ marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draftAsTab}
                onChange={e => setDraftAsTab(e.target.checked)}
              />
              <span>Add as stand-alone tab</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="setup-btn" onClick={saveFilter} disabled={!draft.name.trim()} style={{ flex: 1 }}>
              {editingId ? 'Save Changes' : 'Save Filter'}
            </button>
            <button className="btn-secondary" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (activeFilter) {
    const f = filters.find(f => f.id === activeFilter)
    return (
      <div className="pr-list">
        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn-secondary" onClick={() => { setActiveFilter(null); setResults([]) }} style={{ padding: '4px 10px', fontSize: 11 }}>
            ← Back
          </button>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{f?.name}</span>
          <button className="btn-secondary" onClick={() => f && startEdit(f)} style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} title="Edit filter">
            <PencilIcon /> Edit
          </button>
        </div>
        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : filterError ? (
          <div className="empty-state">
            <div className="empty-state-title" style={{ color: 'var(--red)' }}>Error</div>
            <div className="empty-state-text">{filterError}</div>
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <InboxIcon />
            <div className="empty-state-title">No matches</div>
            <div className="empty-state-text">No PRs match this filter.</div>
          </div>
        ) : (
          results.map(pr => (
            <PRItem key={pr.id} pr={pr} onClick={() => window.gitbar?.openExternal(pr.html_url)} />
          ))
        )}
      </div>
    )
  }

  return (
    <div className="pr-list">
      {filters.length === 0 ? (
        <div className="empty-state">
          <InboxIcon />
          <div className="empty-state-title">No custom filters</div>
          <div className="empty-state-text">Create custom filters to quickly find PRs by label, repo, or author.</div>
          <button className="add-filter-btn" onClick={startCreate} style={{ width: 'auto', marginTop: 8, padding: '6px 16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PlusIcon /> Create Filter
            </span>
          </button>
        </div>
      ) : (
        <div style={{ padding: '8px 0' }}>
          {filters.map(f => (
            <div key={f.id} className="pr-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setActiveFilter(f.id)}>
                <div className="pr-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{f.name}</span>
                  {isTabbed(f.id) && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Tab</span>
                  )}
                </div>
                <div className="pr-meta">
                  {f.repos.length > 0 && <span>Repos: {f.repos.join(', ')}</span>}
                  {f.labels.length > 0 && <span>Labels: {f.labels.join(', ')}</span>}
                  {f.authors.length > 0 && <span>Authors: {f.authors.join(', ')}</span>}
                  {f.query?.trim() && <span>Query: {f.query.trim()}</span>}
                </div>
              </div>
              <button className="icon-btn" onClick={() => startEdit(f)} title="Edit filter">
                <PencilIcon />
              </button>
              <button
                className="btn-secondary"
                onClick={() => (isTabbed(f.id) ? removeCustomFilterTab(f.id) : upsertCustomFilterTab(f))}
                style={{
                  color: isTabbed(f.id) ? 'var(--accent)' : 'var(--text-secondary)',
                  padding: '4px 8px',
                  fontSize: 11,
                  minWidth: 56
                }}
                title={isTabbed(f.id) ? 'Remove tab' : 'Add tab'}
              >
                {isTabbed(f.id) ? 'On Tab' : 'Add Tab'}
              </button>
              <button className="icon-btn" onClick={() => removeFilter(f.id)} style={{ color: 'var(--red)' }} title="Delete filter">
                <TrashIcon />
              </button>
            </div>
          ))}
          <div style={{ padding: '8px 16px' }}>
            <button className="add-filter-btn" onClick={startCreate}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <PlusIcon /> Add Filter
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CustomFilterTab({ filter }: { filter: CustomFilter }) {
  const { token } = useStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<PullRequest[]>([])

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchFilteredPRs(token, filter)
      .then(prs => {
        if (cancelled) return
        setResults(prs)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message || 'Failed to fetch')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, filter])

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-title" style={{ color: 'var(--red)' }}>Error</div>
        <div className="empty-state-text">{error}</div>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <InboxIcon />
        <div className="empty-state-title">No matches</div>
        <div className="empty-state-text">No PRs match this filter.</div>
      </div>
    )
  }

  return (
    <div className="pr-list">
      {results.map(pr => (
        <PRItem key={pr.id} pr={pr} onClick={() => window.gitbar?.openExternal(pr.html_url)} />
      ))}
    </div>
  )
}
