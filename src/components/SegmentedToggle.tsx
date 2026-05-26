interface SegmentedToggleProps {
  segments: Array<{ id: string; label: string; badge?: number }>
  active: string
  onChange: (id: string) => void
}

export function SegmentedToggle({ segments, active, onChange }: SegmentedToggleProps) {
  return (
    <div className="segmented-toggle">
      {segments.map(seg => (
        <button
          key={seg.id}
          className={`segment${active === seg.id ? ' active' : ''}`}
          onClick={() => onChange(seg.id)}
        >
          {seg.label}
          {seg.badge !== undefined && seg.badge > 0 && (
            <span className="segment-badge">{seg.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
