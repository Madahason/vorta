import { useState } from 'react'
import { Copy, Check, ArrowRight } from 'lucide-react'

export default function ScriptOutput({ script, onSendToCreator, onChange }) {
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
      <textarea
        className="vorta-sw-script-editor"
        value={script}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
