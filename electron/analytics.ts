import { app } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PostHog } from 'posthog-node'

let client: PostHog | null = null
let deviceId = ''
let distinctId = ''

// Stable per-install id so PostHog can report accurate unique-user counts.
function getDeviceId(): string {
  const idPath = path.join(app.getPath('userData'), 'gitbar-analytics-id.json')
  try {
    const { id } = JSON.parse(fs.readFileSync(idPath, 'utf-8'))
    if (id) return id
  } catch {}
  const id = crypto.randomUUID()
  try {
    fs.writeFileSync(idPath, JSON.stringify({ id }), 'utf-8')
  } catch {}
  return id
}

export function initAnalytics(): void {
  const projectToken = process.env.POSTHOG_PROJECT_TOKEN
  const host = process.env.POSTHOG_HOST
  if (!projectToken || !host) {
    if (!app.isPackaged) {
      const variable = !projectToken ? 'POSTHOG_PROJECT_TOKEN' : 'POSTHOG_HOST'
      console.error(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`)
    }
    return
  }
  if (process.env.VITE_DEV_SERVER_URL) return
  try {
    deviceId = getDeviceId()
    distinctId = deviceId
    // flushAt: 1 sends each event immediately instead of batching, since the
    // app can quit right after a track() call.
    client = new PostHog(projectToken, { host, flushAt: 1 })
    app.on('before-quit', () => {
      client?.shutdown().catch(() => {})
    })
  } catch (err) {
    console.error('Analytics init failed:', err)
  }
}

export function identifyAnalytics(githubUserId: number, githubLogin: string): void {
  if (!client || !Number.isSafeInteger(githubUserId) || githubUserId <= 0) return
  try {
    const newDistinctId = `github:${githubUserId}`
    // Merges the pre-login anonymous device id into the identified person.
    if (deviceId && deviceId !== newDistinctId) {
      client.alias({ distinctId: newDistinctId, alias: deviceId })
    }
    distinctId = newDistinctId
    client.identify({
      distinctId,
      // `name` is one of PostHog's default display-name properties, so the
      // person list shows the GitHub username instead of the distinct id.
      properties: { name: githubLogin, github_login: githubLogin }
    })
  } catch (err) {
    console.error('Analytics identify failed:', err)
  }
}

export function resetAnalytics(): void {
  distinctId = deviceId
}

export function track(name: string, props?: Record<string, string | number>): void {
  if (!client) return
  try {
    client.capture({
      distinctId,
      event: name,
      properties: { version: app.getVersion(), ...(props || {}) }
    })
  } catch (err) {
    console.error('Analytics track failed:', err)
  }
}
