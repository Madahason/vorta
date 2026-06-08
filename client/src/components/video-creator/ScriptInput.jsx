import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

const NICHES          = ['Finance', 'History', 'Technology', 'Science', 'Business', 'Politics', 'Culture']
const STYLE_PRESETS   = ['Dark Cinematic', 'Clean Modern', 'Gritty Documentary', 'High Contrast']
const NARRATOR_TONES  = ['Authoritative', 'Conversational', 'Dramatic', 'Measured', 'Urgent']
const LS_KEY          = 'vorta_script_metadata'

const DEFAULTS = {
  title:        '',
  niche:        'Finance',
  stylePreset:  'Dark Cinematic',
  narratorTone: 'Authoritative',
}

function lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) } catch { return null }
}
function lsWrite(value) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

export default function ScriptInput({ onAnalyze, isAnalyzing }) {
  const [script, setScript] = useState(() => lsRead()?.script || '')
  const [metadata, setMetadata] = useState(() => {
    const saved = lsRead()
    if (!saved) return DEFAULTS
    return {
      title:        saved.title        ?? DEFAULTS.title,
      niche:        saved.niche        ?? DEFAULTS.niche,
      stylePreset:  saved.stylePreset  ?? DEFAULTS.stylePreset,
      narratorTone: saved.narratorTone ?? DEFAULTS.narratorTone,
    }
  })

  useEffect(() => {
    lsWrite({ ...metadata, script })
  }, [script, metadata])

  const wordCount = script.split(/\s+/).filter(Boolean).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 vorta-field">
          <label className="vorta-label">Project Title</label>
          <input
            type="text"
            value={metadata.title}
            onChange={e => setMetadata(m => ({ ...m, title: e.target.value }))}
            placeholder="e.g. The Lehman Brothers Collapse"
            className="vorta-input"
          />
        </div>

        <div className="vorta-field">
          <label className="vorta-label">Niche</label>
          <select
            value={metadata.niche}
            onChange={e => setMetadata(m => ({ ...m, niche: e.target.value }))}
            className="vorta-select"
          >
            {NICHES.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>

        <div className="vorta-field">
          <label className="vorta-label">Style Preset</label>
          <select
            value={metadata.stylePreset}
            onChange={e => setMetadata(m => ({ ...m, stylePreset: e.target.value }))}
            className="vorta-select"
          >
            {STYLE_PRESETS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="col-span-2 vorta-field">
          <label className="vorta-label">Narrator Tone</label>
          <select
            value={metadata.narratorTone}
            onChange={e => setMetadata(m => ({ ...m, narratorTone: e.target.value }))}
            className="vorta-select"
          >
            {NARRATOR_TONES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="vorta-field">
        <label className="vorta-label">Script</label>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && script.trim() && !isAnalyzing) {
              e.preventDefault()
              onAnalyze({ script, metadata })
            }
          }}
          placeholder="Paste your documentary script here…  Cmd+Enter to analyze"
          rows={14}
          className="vorta-textarea vorta-textarea-mono"
        />
        <p className="vorta-hint">{wordCount} words</p>
      </div>

      <button
        onClick={() => script.trim() && onAnalyze({ script, metadata })}
        disabled={!script.trim() || isAnalyzing}
        className="vorta-btn vorta-btn-white flex items-center gap-2 px-5 py-2.5 text-sm"
      >
        {isAnalyzing && <Loader2 size={14} className="animate-spin" />}
        {isAnalyzing ? 'Analyzing…' : 'Analyze Script'}
      </button>
    </div>
  )
}
