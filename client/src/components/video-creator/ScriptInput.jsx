import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

const NICHES          = ['Finance', 'History', 'Technology', 'Science', 'Business', 'Politics', 'Culture']
const STYLE_PRESETS   = ['Dark Cinematic', 'Clean Modern', 'Gritty Documentary', 'High Contrast']
const NARRATOR_TONES  = ['Authoritative', 'Conversational', 'Dramatic', 'Measured', 'Urgent']
const LS_KEY          = 'vorta_script_metadata'
const WORDS_PER_MIN   = 130

const TARGET_DURATIONS = [
  { label: '3 min',       value: 3   },
  { label: '5 min',       value: 5   },
  { label: '8 min',       value: 8   },
  { label: '10 min',      value: 10  },
  { label: '15 min',      value: 15  },
  { label: 'Full Script', value: 'full' },
]

const DEFAULTS = {
  title:          '',
  niche:          'Finance',
  stylePreset:    'Dark Cinematic',
  narratorTone:   'Authoritative',
  targetDuration: 'full',
}

function lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) } catch { return null }
}
function lsWrite(value) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

export default function ScriptInput({ onAnalyze, isAnalyzing }) {
  const [script, setScript] = useState(() => {
    const fromScriptWriter = localStorage.getItem('vorta_script_text')
    if (fromScriptWriter) {
      localStorage.removeItem('vorta_script_text')
      return fromScriptWriter
    }
    return lsRead()?.script || ''
  })
  const [metadata, setMetadata] = useState(() => {
    const saved = lsRead()
    if (!saved) return DEFAULTS
    return {
      title:          saved.title          ?? DEFAULTS.title,
      niche:          saved.niche          ?? DEFAULTS.niche,
      stylePreset:    saved.stylePreset    ?? DEFAULTS.stylePreset,
      narratorTone:   saved.narratorTone   ?? DEFAULTS.narratorTone,
      targetDuration: saved.targetDuration ?? DEFAULTS.targetDuration,
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

        <div className="col-span-2 vorta-field">
          <label className="vorta-label">Target Video Length</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TARGET_DURATIONS.map(({ label, value }) => {
              const active = metadata.targetDuration === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMetadata(m => ({ ...m, targetDuration: value }))}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 6,
                    border: `1px solid ${active ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)'}`,
                    background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                    color: active ? 'white' : 'rgba(255,255,255,0.45)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {(() => {
            const td = metadata.targetDuration
            if (td === 'full') {
              return (
                <p className="vorta-hint">
                  Full script · {wordCount} words · ~{Math.round(wordCount / WORDS_PER_MIN)} min · ~{Math.ceil(wordCount / 20)} scenes
                </p>
              )
            }
            const targetWords = td * WORDS_PER_MIN
            const scenes      = Math.ceil(Math.min(wordCount, targetWords) / 20)
            const overrun     = wordCount > targetWords
            return (
              <p className="vorta-hint">
                ~{Math.min(wordCount, targetWords).toLocaleString()} words · ~{scenes} scenes
                {overrun && ` · Claude will select the most important ${Math.round((targetWords / wordCount) * 100)}% of your script`}
                {!overrun && ` · Full script fits within ${td} min`}
              </p>
            )
          })()}
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
