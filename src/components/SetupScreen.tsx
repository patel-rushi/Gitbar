import { useState } from 'react'
import { useStore } from '../store'
import { GitBranchIcon } from './Icons'

export function SetupScreen() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const { setToken: saveToken, isValidating } = useStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return

    setError('')
    const success = await saveToken(token.trim())
    if (!success) {
      setError('Invalid token. Please check your PAT and try again.')
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-logo">
        <GitBranchIcon size={32} />
      </div>
      <h1 className="setup-title">Welcome to GitBar</h1>
      <p className="setup-subtitle">
        Connect your GitHub account to get focused notifications for PRs that matter to you.
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="setup-input-wrapper">
          <input
            className="setup-input"
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={token}
            onChange={e => setToken(e.target.value)}
            autoFocus
          />
        </div>

        {error && <div className="setup-error">{error}</div>}

        <button className="setup-btn" type="submit" disabled={!token.trim() || isValidating}>
          {isValidating ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="spinner" /> Validating…
            </span>
          ) : (
            'Connect GitHub'
          )}
        </button>
      </form>

      <p className="setup-hint">
        Create a PAT at{' '}
        <span className="setup-link" onClick={() => window.gitbar?.openExternal('https://github.com/settings/tokens?type=beta')}>
          github.com/settings/tokens
        </span>
        <br />
        Required scopes: <code>notifications</code>, <code>repo</code>
      </p>
    </div>
  )
}
