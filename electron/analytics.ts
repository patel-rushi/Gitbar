import { app } from 'electron'
import { initialize, trackEvent } from '@aptabase/electron/main'

const APTABASE_APP_KEY = 'A-US-4231437362'

let enabled = false

function isConfigured(): boolean {
  return APTABASE_APP_KEY.length > 0 && !APTABASE_APP_KEY.startsWith('<')
}

export function initAnalytics(): void {
  if (!isConfigured()) return
  if (process.env.VITE_DEV_SERVER_URL) return
  try {
    initialize(APTABASE_APP_KEY)
    enabled = true
  } catch (err) {
    console.error('Analytics init failed:', err)
  }
}

export function track(name: string, props?: Record<string, string | number>): void {
  if (!enabled) return
  try {
    trackEvent(name, { version: app.getVersion(), ...(props || {}) })
  } catch (err) {
    console.error('Analytics track failed:', err)
  }
}
