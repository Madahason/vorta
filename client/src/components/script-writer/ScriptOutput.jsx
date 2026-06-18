import { useState } from 'react'
import { Copy, Check, ArrowRight, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react'

function ScanBar({ scanResult }) {
  if (!scanResult) return null

  if (scanResult.skipped) {
    return (
      <div className="vorta-sw-scan-bar skipped">
        <span className="vorta-sw-scan-item text-white/30">
          Originality scan not configured — add Copyleaks credentials in .env
        </span>
      </div>
    )
  }

  const orig = scanResult.originality ?? 0
  const ai = scanResult.aiScore ?? 0

  const origColor = orig >= 90 ? '#22c55e' : orig >= 75 ? '#f59e0b' : '#ef4444'
  const origBg = orig >= 90 ? 'rgba(34,197,94,0.1)' : orig >= 75 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'
  const aiColor = ai <= 20 ? '#22c55e' : ai <= 40 ? '#f59e0b' : '#ef4444'
  const aiBg = ai <= 20 ? 'rgba(34,197,94,0.1)' : ai <= 40 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'

  const ready = orig >= 90 && ai <= 20
  const warn = orig < 75 || ai > 40

  return (
    <div className="vorta-sw-scan-bar">
      <div className="vorta-sw-scan-item" style={{ background: origBg, borderColor: `${origColor}33` }}>
        <ShieldCheck size={13} style={{ color: origColor }} />
        <span style={{ color: origColor, fontWeight: 600 }}>Originality: {orig}%</span>
      </div>
      <div className="vorta-sw-scan-item" style={{ background: aiBg, borderColor: `${aiColor}33` }}>
        <ShieldAlert size={13} style={{ color: aiColor }} />
        <span style={{ color: aiColor, fontWeight: 600 }}>AI Score: {ai}%</span>
      </div>
      {ready && (
        <div className="vorta-sw-scan-item" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)' }}>
          <Check size={13} style={{ color: '#22c55e' }} />
          <span style={{ color: '#22c55e', fontWeight: 500 }}>Ready</span>
        </div>
      )}
      {!ready && orig < 75 && (
        <div className="vorta-sw-scan-item" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <AlertTriangle size={13} style={{ color: '#ef4444' }} />
          <span style={{ color: '#ef4444', fontSize: 11 }}>Regenerate recommended</span>
        </div>
      )}
      {!ready && orig >= 75 && orig < 90 && (
        <div className="vorta-sw-scan-item" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
          <span style={{ color: '#f59e0b', fontSize: 11 }}>Review flagged passages</span>
        </div>
      )}
    </div>
  )
}

export default function ScriptOutput({ script, scanResult, onSendToCreator, onChange }) {
  const [copied, setCopied] = useState(false)

  const wordCount = script.trim().split(/\s+/).filter(Boolean).length
  const estimatedMinutes = (wordCount / 130).toFixed(1)

  function handleCopy() {
    navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="vorta-sw-script-output">
      <div className="vorta-sw-script-header">
        <div className="vorta-sw-script-stats">
          <span className="vorta-sw-stat">{wordCount.toLocaleString()} words</span>
          <span className="vorta-sw-stat-sep" />
          <span className="vorta-sw-stat">~{estimatedMinutes} min</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="vorta-btn vorta-btn-ghost vorta-btn-sm">
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
          <button onClick={onSendToCreator} className="vorta-btn vorta-btn-primary vorta-btn-sm">
            <ArrowRight size={12} /> Send to Video Creator
          </button>
        </div>
      </div>
      <ScanBar scanResult={scanResult} />
      <textarea
        className="vorta-sw-script-editor"
        value={script}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
