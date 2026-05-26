import packageJson from '../../package.json'

export function AppVersion({ className = 'app-version' }: { className?: string }) {
  return <span className={className}>v{packageJson.version}</span>
}
