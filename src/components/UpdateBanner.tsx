import { useState } from 'react'
import { useStore } from '../store'
import { fetchReleaseNotes } from '../github'

type NoteLine = { kind: 'heading' | 'item' | 'text'; text: string }

function cleanText(line: string): string {
  return line
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+by\s+@[\w-]+/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]*\)/g, '$1')
    .replace(/\s+in\s*$/i, '')
    .replace(/#\d+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseNotes(body: string): NoteLine[] {
  const lines: NoteLine[] = []
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^full changelog/i.test(line.replace(/[*_]/g, '').trim())) continue
    if (line.startsWith('#')) {
      const text = cleanText(line.replace(/^#+\s*/, ''))
      if (text) lines.push({ kind: 'heading', text })
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const text = cleanText(line.replace(/^[-*]\s+/, ''))
      if (text) lines.push({ kind: 'item', text })
      continue
    }
    const text = cleanText(line)
    if (text) lines.push({ kind: 'text', text })
  }
  return lines
}

export function UpdateBanner() {
  const { pendingUpdateVersion, installPendingUpdate, token } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState<NoteLine[] | null>(null)
  const [loading, setLoading] = useState(false)

  if (!pendingUpdateVersion) return null

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && notes === null && !loading) {
      setLoading(true)
      const body = await fetchReleaseNotes(token || '', pendingUpdateVersion)
      setNotes(body ? parseNotes(body) : [])
      setLoading(false)
    }
  }

  return (
    <div className="update-banner-wrap">
      <div className="update-banner">
        <span className="update-banner-dot" />
        <span className="update-banner-text">
          Update available · v{pendingUpdateVersion}
        </span>
        <button className="update-banner-link" onClick={toggle}>
          {expanded ? 'Hide' : "What's new"}
        </button>
        <button className="update-banner-cta" onClick={installPendingUpdate}>
          Restart to update
        </button>
      </div>
      {expanded && (
        <div className="update-banner-notes">
          {loading ? (
            <div className="spinner" />
          ) : notes && notes.length > 0 ? (
            <ul>
              {notes.map((line, i) =>
                line.kind === 'heading' ? (
                  <li key={i} className="update-banner-notes-heading">{line.text}</li>
                ) : (
                  <li key={i}>{line.text}</li>
                )
              )}
            </ul>
          ) : (
            <div className="update-banner-empty">No release notes available for this version.</div>
          )}
        </div>
      )}
    </div>
  )
}
