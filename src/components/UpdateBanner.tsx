import { useState, useEffect } from 'react'
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

export function UpdatePill({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { pendingUpdateVersion } = useStore()
  if (!pendingUpdateVersion) return null
  return (
    <button
      className={`update-pill${active ? ' active' : ''}`}
      onClick={onClick}
      title={`Update available · v${pendingUpdateVersion}`}
    >
      <span className="update-pill-dot" />
      Update
    </button>
  )
}

export function UpdateInfo() {
  const { pendingUpdateVersion, installPendingUpdate, token } = useStore()
  const [notes, setNotes] = useState<NoteLine[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pendingUpdateVersion) return
    let cancelled = false
    setLoading(true)
    fetchReleaseNotes(token || '', pendingUpdateVersion).then(body => {
      if (cancelled) return
      setNotes(body ? parseNotes(body) : [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [pendingUpdateVersion, token])

  if (!pendingUpdateVersion) return null

  return (
    <div className="update-info">
      <div className="update-info-header">
        <div>
          <div className="update-info-title">Update available</div>
          <div className="update-info-version">v{pendingUpdateVersion}</div>
        </div>
        <button className="update-banner-cta" onClick={installPendingUpdate}>
          Restart to update
        </button>
      </div>
      <div className="update-info-notes">
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
    </div>
  )
}
