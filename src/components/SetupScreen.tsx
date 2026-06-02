import { useState } from 'react'
import { useStore } from '../store'
import { GitBranchIcon } from './Icons'
import { AppVersion } from './AppVersion'
import createTokenImg from '../assets/create-token.jpg'
import configureSsoImg from '../assets/configure-sso.jpg'

const PAT_URL = 'https://github.com/settings/tokens/new?description=GitBar&scopes=repo,notifications,read:org'

export function SetupScreen() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [zoomed, setZoomed] = useState<string | null>(null)
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
        Paste your GitHub token to connect. New here? Steps below.
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

      <div className="setup-steps">
        <div className="setup-step">
          <div className="setup-step-header">
            <span className="setup-step-num">1</span>
            <span className="setup-step-title">Create your token</span>
          </div>
          <p className="setup-step-text">
            Open the{' '}
            <span className="setup-link" onClick={() => window.gitbar?.openExternal(PAT_URL)}>
              token page
            </span>
            {' '}(scopes are already picked for you), then click <strong>Generate token</strong> and copy it.
          </p>
          <img className="setup-step-img" src={createTokenImg} onClick={() => setZoomed(createTokenImg)} alt="GitHub new personal access token page with scopes pre-selected" />
        </div>

        <div className="setup-step">
          <div className="setup-step-header">
            <span className="setup-step-num">2</span>
            <span className="setup-step-title">Authorize SSO</span>
          </div>
          <p className="setup-step-text">
            On a work org with single sign-on? Click <strong>Configure SSO</strong> next to your token and authorize it. Otherwise skip this.
          </p>
          <img className="setup-step-img" src={configureSsoImg} onClick={() => setZoomed(configureSsoImg)} alt="Configure SSO button next to a personal access token" />
        </div>
      </div>

      <AppVersion className="setup-version" />

      {zoomed && (
        <div className="setup-zoom-overlay" onClick={() => setZoomed(null)}>
          <img className="setup-zoom-img" src={zoomed} alt="Expanded screenshot" />
        </div>
      )}
    </div>
  )
}
