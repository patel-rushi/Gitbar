import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore, DEMO_MODE } from '../store'
import type { PullRequest, CustomFilter } from '../types'
import { fetchFilteredPRs, fetchRepoLabels, fetchOrgRepos, fetchOrgMembers, fetchUserOrgs } from '../github'
import { PRItem } from './PRItem'
import { AutocompleteInput } from './AutocompleteInput'
import { InboxIcon, PlusIcon, TrashIcon, PencilIcon } from './Icons'

interface SavedFilter extends CustomFilter {
  id: string
  isDefault?: boolean
}

const PINNED_FILTERS_KEY = DEMO_MODE ? 'gitbar_custom_filters_demo' : 'gitbar_custom_filters'

function loadFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(PINNED_FILTERS_KEY)
    const parsed: SavedFilter[] = raw ? JSON.parse(raw) : []
    let foundDefault = false
    return parsed.map(f => {
      const isDefault = !!f.isDefault && !foundDefault
      if (isDefault) foundDefault = true
      return { ...f, isDefault }
    })
  } catch {
    return []
  }
}

function saveFilters(filters: SavedFilter[]) {
  localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(filters))
  window.gitbar?.storeSet(PINNED_FILTERS_KEY, filters)
}

export function PinnedFilters() {
  const { token } = useStore()
  const [filters, setFilters] = useState<SavedFilter[]>(loadFilters)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const didAutoOpenDefault = useRef(false)
  const [results, setResults] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<SavedFilter, 'id'>>({
    name: '',
    labels: [],
    repos: [],
    authors: [],
    query: '',
    isDefault: false
  })

  const emptyDraft = (): Omit<SavedFilter, 'id'> => ({ name: '', labels: [], repos: [], authors: [], query: '', isDefault: false })

  const startCreate = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setEditing(true)
  }

  const startEdit = (f: SavedFilter) => {
    setEditingId(f.id)
    setDraft({ name: f.name, labels: f.labels, repos: f.repos, authors: f.authors, query: f.query ?? '', isDefault: !!f.isDefault })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditingId(null)
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
      const normalized = stored.map(f => ({ ...f, isDefault: !!f.isDefault }))
      setFilters(normalized)
      localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(normalized))
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (didAutoOpenDefault.current) return
    didAutoOpenDefault.current = true
    const defaultFilter = filters.find(f => f.isDefault)
    if (defaultFilter) setActiveFilter(defaultFilter.id)
  }, [filters])

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
    let updated = editingId
      ? filters.map(f => (f.id === editingId ? nextFilter : f))
      : [...filters, nextFilter]
    if (nextFilter.isDefault) {
      updated = updated.map(f => ({ ...f, isDefault: f.id === id }))
    }
    setFilters(updated)
    saveFilters(updated)
    setEditing(false)
    setEditingId(null)
    setDraft(emptyDraft())
    setActiveFilter(id)
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
    if (activeFilter === id) {
      setActiveFilter(null)
      setResults([])
    }
  }

  const setDefaultFilter = (id: string | null) => {
    const updated = filters.map(f => ({ ...f, isDefault: id ? f.id === id : false }))
    setFilters(updated)
    saveFilters(updated)
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
                checked={!!draft.isDefault}
                onChange={e => setDraft({ ...draft, isDefault: e.target.checked })}
              />
              <span>Open this filter by default in Pinned Filters tab</span>
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
          <div className="empty-state-title">No pinned filters</div>
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
                  {f.isDefault && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Default</span>
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
                className="icon-btn"
                onClick={() => setDefaultFilter(f.isDefault ? null : f.id)}
                style={{ color: f.isDefault ? 'var(--accent)' : 'var(--text-secondary)' }}
                title={f.isDefault ? 'Clear default filter' : 'Set as default filter'}
              >
                {f.isDefault ? '★' : '☆'}
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
