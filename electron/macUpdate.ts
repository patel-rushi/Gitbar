import { app } from 'electron'
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export function getAppBundlePath(): string {
  return path.resolve(app.getPath('exe'), '../../..')
}

export function isAppProperlySigned(): boolean {
  const bundle = getAppBundlePath()
  const result = spawnSync('codesign', ['-dv', bundle], { encoding: 'utf8' })
  const output = `${result.stdout}\n${result.stderr}`

  return (
    output.includes('TeamIdentifier=') &&
    !output.includes('TeamIdentifier=not set') &&
    !output.includes('Signature=adhoc')
  )
}

export function installUnsignedMacUpdate(downloadedZip: string): void {
  const appBundle = getAppBundlePath()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitbar-update-'))
  const extractDir = path.join(tempDir, 'extract')
  fs.mkdirSync(extractDir)

  const unzip = spawnSync('ditto', ['-x', '-k', downloadedZip, extractDir], { encoding: 'utf8' })
  if (unzip.status !== 0) {
    throw new Error(unzip.stderr || 'Failed to extract update')
  }

  const updatedApp = path.join(extractDir, `${path.basename(appBundle)}`)
  if (!fs.existsSync(updatedApp)) {
    throw new Error(`Update archive did not contain ${path.basename(appBundle)}`)
  }

  const scriptPath = path.join(tempDir, 'install.sh')
  const script = `#!/bin/bash
set -e
sleep 1
ditto "${updatedApp}" "${appBundle}"
xattr -cr "${appBundle}" || true
open "${appBundle}"
rm -rf "${tempDir}"
`

  fs.writeFileSync(scriptPath, script, { mode: 0o755 })

  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()

  app.exit(0)
}
