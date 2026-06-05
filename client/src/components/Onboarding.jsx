import { useState, useEffect } from 'react'
import { CheckCircle, X, Key, Cpu, FileText, Zap } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const STEPS = [
  { id: 'apikey',     icon: Key,      title: 'Add your Anthropic API key', desc: 'Required for script analysis. Add ANTHROPIC_API_KEY to your .env file and restart the server.' },
  { id: 'higgsfield', icon: Cpu,      title: 'Authenticate Higgsfield',    desc: 'Run `higgsfield auth login` in your terminal once. Session persists indefinitely.' },
  { id: 'script',     icon: FileText, title: 'Paste your first script',    desc: 'Paste a documentary script into the Script Input box above.' },
  { id: 'analyze',    icon: Zap,      title: 'Click Analyze',              desc: 'Claude will break the script into scenes with prompts, overlays, and timing.' },
]

export default function Onboarding({ onDismiss }) {
  const [apiOk,  setApiOk]  = useState(false)
  const [hfOk,   setHfOk]   = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Check API key status quietly
    fetch(`${SERVER_URL}/api/settings`)
      .then(r => r.json())
      .then(d => { if (d.anthropicKeySet) setApiOk(true) })
      .catch(() => {})

    fetch(`${SERVER_URL}/api/settings/higgsfield-status`)
      .then(r => r.json())
      .then(d => { if (d.authenticated) setHfOk(true) })
      .catch(() => {})
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem('vorta_onboarded', 'true')
    onDismiss?.()
  }

  if (!visible) return null

  const stepStatus = [apiOk, hfOk, false, false]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#161616',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 600, margin: 0 }}>Welcome to Vorta</h2>
            <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: 13, marginTop: 4 }}>
              Complete these 4 steps to create your first video.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginTop: -4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STEPS.map((step, i) => {
            const done = stepStatus[i]
            const Icon = step.icon
            return (
              <div key={step.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '12px 14px',
                background: done ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.20)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done
                    ? <CheckCircle size={16} style={{ color: '#4ade80' }} />
                    : <Icon       size={16} style={{ color: 'rgba(255,255,255,0.35)' }} />
                  }
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 500,
                      color: done ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.85)',
                    }}>
                      {step.title}
                    </span>
                    {done && <span style={{ fontSize: 10, color: '#4ade80' }}>Done</span>}
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.5 }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleDismiss}
            style={{
              padding: '9px 20px',
              background: '#2563eb', border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  )
}
