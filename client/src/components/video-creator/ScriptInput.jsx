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
  try { localStorage.setItem(LS_KEY, JSON.stringify(value)) } catch {}
}

export default function ScriptInput({ onAnalyze, isAnalyzing }) {
  const [script, setScript] = useState(() => lsRead()?.script || '')
  const [metadata, setMetadata] = useState(() => {
    const saved = lsRead()
    if (!saved) return DEFAULTS
    const { script: _ignored, ...rest } = saved
    return { ...DEFAULTS, ...rest }
  })

  // Persist script + metadata together on every change
  useEffect(() => {
    lsWrite({ ...metadata, script })
  }, [script, metadata])

  const wordCount = script.split(/\s+/).filter(Boolean).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs text-white/40 mb-1.5">Project Title</label>
          <input
            type="text"
            value={metadata.title}
            onChange={e => setMetadata(m => ({ ...m, title: e.target.value }))}
            placeholder="e.g. The Lehman Brothers Collapse"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1.5">Niche</label>
          <select
            value={metadata.niche}
            onChange={e => setMetadata(m => ({ ...m, niche: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
          >
            {NICHES.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1.5">Style Preset</label>
          <select
            value={metadata.stylePreset}
            onChange={e => setMetadata(m => ({ ...m, stylePreset: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
          >
            {STYLE_PRESETS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs text-white/40 mb-1.5">Narrator Tone</label>
          <select
            value={metadata.narratorTone}
            onChange={e => setMetadata(m => ({ ...m, narratorTone: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
          >
            {NARRATOR_TONES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/40 mb-1.5">Script</label>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder="Paste your documentary script here..."
          rows={14}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 resize-none font-mono leading-relaxed transition-colors"
        />
        <p className="text-xs text-white/20 mt-1">{wordCount} words</p>
      </div>

      <button
        onClick={() => script.trim() && onAnalyze({ script, metadata })}
        disabled={!script.trim() || isAnalyzing}
        className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {isAnalyzing && <Loader2 size={14} className="animate-spin" />}
        {isAnalyzing ? 'Analyzing…' : 'Analyze Script'}
      </button>
    </div>
  )
}
