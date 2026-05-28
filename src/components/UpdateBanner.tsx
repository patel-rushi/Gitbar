import { useStore } from '../store'

export function UpdateBanner() {
  const { pendingUpdateVersion, installPendingUpdate } = useStore()
  if (!pendingUpdateVersion) return null

  return (
    <button className="update-banner" onClick={installPendingUpdate}>
      <span className="update-banner-dot" />
      <span className="update-banner-text">
        Update available · v{pendingUpdateVersion}
      </span>
      <span className="update-banner-cta">Restart to update</span>
    </button>
  )
}
