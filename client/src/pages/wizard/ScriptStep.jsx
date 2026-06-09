import ScriptInput from '../../components/video-creator/ScriptInput'
import { Loader2 } from 'lucide-react'

export function ScriptStep({ scenes, isAnalyzing, analyzeError, onAnalyze, wizard, resetKey }) {
  const hasScenes = scenes.length > 0

  const formatError = (msg) => {
    if (!msg) return 'Something went wrong. Try again.'
    if (msg.toLowerCase().includes('api key')) return 'API key missing or invalid. Check ANTHROPIC_API_KEY in Settings.'
    return msg
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Your Script</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
          Paste your documentary script and click Analyze. Claude will break it into scenes.
        </p>
      </div>

      <ScriptInput key={resetKey} onAnalyze={onAnalyze} isAnalyzing={isAnalyzing} />

      {analyzeError && (
        <div style={{
          marginTop: 16,
          padding: '10px 16px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8,
          color: '#f87171',
          fontSize: 13,
        }}>
          {formatError(analyzeError)}
        </div>
      )}

      {isAnalyzing && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          Breaking script into scenes…
        </div>
      )}

      {hasScenes && !isAnalyzing && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => wizard.goNext()}
            className="vorta-btn vorta-btn-secondary"
          >
            Use existing {scenes.length} scenes →
          </button>
        </div>
      )}
    </div>
  )
}
