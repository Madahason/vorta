import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader2, Save, RefreshCw, Download, Upload } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const inputCls  = 'w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25 disabled:opacity-40'
const selectCls = inputCls + ' cursor-pointer'
const labelCls  = 'block text-[11px] text-white/40 mb-1.5 uppercase tracking-wider'

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-5 pb-2 border-b border-white/[0.06]">
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function Settings() {
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [defaults, setDefaults] = useState({ style: {}, render: {} })
  const [apiStatus, setApiStatus] = useState(null)  // null | 'testing' | 'ok' | 'fail'
  const [apiError,  setApiError]  = useState('')
  const [hfStatus,  setHfStatus]  = useState(null)  // null | 'loading' | { authenticated, message }
  const [elStatus,  setElStatus]  = useState(null)  // null | 'testing' | { connected, plan, charactersRemaining, error }
  const [gapInsights, setGapInsights] = useState([])
  const [clipCount,   setClipCount]   = useState(null)

  // ─── Load settings on mount ─────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${SERVER_URL}/api/settings`).then(r => r.json()),
      fetch(`${SERVER_URL}/api/library`).then(r => r.json()).catch(() => ({ clips: [] })),
      fetch(`${SERVER_URL}/api/library/gaps`).then(r => r.json()).catch(() => ({ gaps: [] })),
    ]).then(([settingsData, libData, gapsData]) => {
      if (settingsData.defaults) setDefaults(settingsData.defaults)
      setClipCount(libData.clips?.length ?? null)
      setGapInsights((gapsData.gaps || []).slice(0, 5))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // ─── Save defaults ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const res  = await fetch(`${SERVER_URL}/api/settings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ defaults }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    finally { setSaving(false) }
  }

  const patchStyle    = (k, v) => setDefaults(d => ({ ...d, style:  { ...d.style,  [k]: v } }))
  const patchRender   = (k, v) => setDefaults(d => ({ ...d, render: { ...d.render, [k]: v } }))
  const patchOverlay  = (k, v) => setDefaults(d => ({ ...d, overlayTemplates: { ...(d.overlayTemplates || {}), [k]: v } }))

  // ─── Test Anthropic key ──────────────────────────────────────────────────────
  const testAnthropicKey = async () => {
    setApiStatus('testing')
    setApiError('')
    try {
      const res  = await fetch(`${SERVER_URL}/api/settings/test-anthropic`, { method: 'POST' })
      const data = await res.json()
      setApiStatus(data.success ? 'ok' : 'fail')
      if (!data.success) setApiError(data.error || 'Test failed')
    } catch (err) {
      setApiStatus('fail')
      setApiError(err.message)
    }
  }

  // ─── Test ElevenLabs key ─────────────────────────────────────────────────────
  const testElevenLabs = async () => {
    setElStatus('testing')
    try {
      const res  = await fetch(`${SERVER_URL}/api/voiceover/status`)
      const data = await res.json()
      setElStatus(data)
    } catch (err) {
      setElStatus({ connected: false, error: err.message })
    }
  }

  // ─── Check Higgsfield status ─────────────────────────────────────────────────
  const checkHiggsfield = async () => {
    setHfStatus('loading')
    try {
      const res  = await fetch(`${SERVER_URL}/api/settings/higgsfield-status`)
      const data = await res.json()
      setHfStatus(data)
    } catch (err) {
      setHfStatus({ authenticated: false, message: err.message })
    }
  }

  // ─── Export / import library ─────────────────────────────────────────────────
  const exportLibrary = async () => {
    const res  = await fetch(`${SERVER_URL}/api/library`)
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'clips.json'; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-white/30 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading settings…
      </div>
    )
  }

  const s  = defaults.style            || {}
  const r  = defaults.render           || {}
  const ot = defaults.overlayTemplates || {}

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-white/40 mt-1 text-sm">API keys, style presets, library management, render options.</p>
      </div>

      {/* ── API Keys ─────────────────────────────────────────────────────────── */}
      <Section title="API Keys">
        <div className="space-y-5">

          <div>
            <label className={labelCls}>Anthropic API Key</label>
            <div className="flex gap-3">
              <input
                type="password"
                value="••••••••••••••••••••••"
                readOnly
                className={inputCls}
                placeholder="Set in .env file"
              />
              <button
                onClick={testAnthropicKey}
                disabled={apiStatus === 'testing'}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-sm text-white/60 transition-colors shrink-0 disabled:opacity-40"
              >
                {apiStatus === 'testing'
                  ? <Loader2 size={13} className="animate-spin" />
                  : apiStatus === 'ok'   ? <CheckCircle size={13} className="text-green-400" />
                  : apiStatus === 'fail' ? <XCircle     size={13} className="text-red-400" />
                  : null
                }
                Test key
              </button>
            </div>
            {apiStatus === 'ok'   && <p className="text-[11px] text-green-400/70 mt-1.5">API key is valid</p>}
            {apiStatus === 'fail' && <p className="text-[11px] text-red-400/70  mt-1.5">{apiError}</p>}
            <p className="text-[11px] text-white/25 mt-1.5">Set in .env — restart server after changing</p>
          </div>

          <div>
            <label className={labelCls}>Higgsfield Authentication</label>
            <div className="flex gap-3">
              <div className="flex-1 px-3 py-2 bg-white/[0.02] border border-white/[0.07] rounded-lg text-sm">
                {hfStatus === null
                  ? <span className="text-white/25">Not checked</span>
                  : hfStatus === 'loading'
                  ? <span className="flex items-center gap-2 text-white/30"><Loader2 size={12} className="animate-spin" /> Checking…</span>
                  : hfStatus.authenticated
                  ? <span className="flex items-center gap-2 text-green-400/80"><CheckCircle size={13} /> Authenticated</span>
                  : <span className="flex items-center gap-2 text-amber-400/80"><XCircle size={13} /> {hfStatus.message}</span>
                }
              </div>
              <button
                onClick={checkHiggsfield}
                disabled={hfStatus === 'loading'}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-sm text-white/60 transition-colors shrink-0 disabled:opacity-40"
              >
                <RefreshCw size={13} /> Check
              </button>
            </div>
            <p className="text-[11px] text-white/25 mt-1.5">Run <code className="bg-white/[0.05] px-1 rounded">higgsfield auth login</code> in terminal if not authenticated</p>
          </div>

          <div>
            <label className={labelCls}>ElevenLabs API Key</label>
            <div className="flex gap-3">
              <input
                type="password"
                value="••••••••••••••••••••••"
                readOnly
                className={inputCls}
                placeholder="Set ELEVENLABS_API_KEY in .env"
              />
              <button
                onClick={testElevenLabs}
                disabled={elStatus === 'testing'}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-sm text-white/60 transition-colors shrink-0 disabled:opacity-40"
              >
                {elStatus === 'testing'
                  ? <Loader2 size={13} className="animate-spin" />
                  : elStatus?.connected   ? <CheckCircle size={13} className="text-green-400" />
                  : elStatus && !elStatus.connected ? <XCircle size={13} className="text-red-400" />
                  : null
                }
                Test key
              </button>
            </div>
            {elStatus?.connected && (
              <p className="text-[11px] text-green-400/70 mt-1.5">
                Connected · {elStatus.plan} · {elStatus.charactersRemaining?.toLocaleString()} chars remaining
              </p>
            )}
            {elStatus && !elStatus.connected && (
              <p className="text-[11px] text-red-400/70 mt-1.5">{elStatus.error || 'Connection failed'}</p>
            )}
            <p className="text-[11px] text-white/25 mt-1.5">Set <code className="bg-white/[0.05] px-1 rounded">ELEVENLABS_API_KEY</code> in .env — restart server after changing</p>
          </div>

        </div>
      </Section>

      {/* ── Default Style Presets ─────────────────────────────────────────────── */}
      <Section title="Default Style Presets">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Default color grade</label>
            <select value={s.grade || 'cool_blue'} onChange={e => patchStyle('grade', e.target.value)} className={selectCls}>
              <option value="cool_blue">Cool Blue (default)</option>
              <option value="warm_amber">Warm Amber</option>
              <option value="desaturated">Desaturated</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Default motion type</label>
            <select value={s.motionType || 'push_in'} onChange={e => patchStyle('motionType', e.target.value)} className={selectCls}>
              <option value="push_in">Push In</option>
              <option value="pull_out">Pull Out</option>
              <option value="drift_left">Drift Left</option>
              <option value="drift_right">Drift Right</option>
              <option value="drift_up">Drift Up</option>
              <option value="static">Static</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Default transition</label>
            <select value={s.transition || 'dissolve'} onChange={e => patchStyle('transition', e.target.value)} className={selectCls}>
              <option value="dissolve">Dissolve</option>
              <option value="cut">Cut</option>
              <option value="dip_black">Dip Black</option>
              <option value="dip_white">Dip White</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Default scene duration (seconds)</label>
            <input type="number" min={2} max={15} value={s.durationSeconds || 5}
              onChange={e => patchStyle('durationSeconds', parseInt(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Default grain intensity — {(s.grainIntensity ?? 0.06).toFixed(2)}</label>
            <input type="range" min={0} max={0.3} step={0.01} value={s.grainIntensity ?? 0.06}
              onChange={e => patchStyle('grainIntensity', parseFloat(e.target.value))}
              className="w-full mt-1" style={{ accentColor: '#3b82f6' }} />
          </div>
          <div>
            <label className={labelCls}>Default vignette intensity — {(s.vignetteIntensity ?? 0.45).toFixed(2)}</label>
            <input type="range" min={0} max={1} step={0.05} value={s.vignetteIntensity ?? 0.45}
              onChange={e => patchStyle('vignetteIntensity', parseFloat(e.target.value))}
              className="w-full mt-1" style={{ accentColor: '#3b82f6' }} />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save presets'}
        </button>
      </Section>

      {/* ── Default Overlay Templates ─────────────────────────────────────────── */}
      <Section title="Default Overlay Templates">
        <p className="text-[11px] text-white/30 mb-4">
          These templates are used when Claude auto-generates overlays during script analysis.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Lower Third style</label>
            <select value={ot.lower_third || 'minimal_line'} onChange={e => patchOverlay('lower_third', e.target.value)} className={selectCls}>
              <option value="minimal_line">Minimal Line</option>
              <option value="color_block">Color Block</option>
              <option value="underline_reveal">Underline Reveal</option>
              <option value="frosted_glass">Frosted Glass</option>
              <option value="split_reveal">Split Reveal</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Date Stamp style</label>
            <select value={ot.date_stamp || 'minimal_pill'} onChange={e => patchOverlay('date_stamp', e.target.value)} className={selectCls}>
              <option value="minimal_pill">Minimal Pill</option>
              <option value="corner_badge">Corner Badge</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Kinetic Text style</label>
            <select value={ot.kinetic_text || 'center_impact'} onChange={e => patchOverlay('kinetic_text', e.target.value)} className={selectCls}>
              <option value="center_impact">Center Impact</option>
              <option value="bottom_fade">Bottom Fade</option>
              <option value="word_by_word">Word by Word</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Stat Callout style</label>
            <select value={ot.stat_callout || 'big_number'} onChange={e => patchOverlay('stat_callout', e.target.value)} className={selectCls}>
              <option value="big_number">Big Number</option>
              <option value="corner_stat">Corner Stat</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Chapter Title style</label>
            <select value={ot.chapter_title || 'minimal_chapter'} onChange={e => patchOverlay('chapter_title', e.target.value)} className={selectCls}>
              <option value="minimal_chapter">Minimal Chapter</option>
              <option value="full_screen_chapter">Full Screen</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Background Overlay style</label>
            <select value={ot.background_overlay || 'gradient_bottom'} onChange={e => patchOverlay('background_overlay', e.target.value)} className={selectCls}>
              <option value="gradient_bottom">Gradient Bottom</option>
              <option value="full_dark">Full Dark</option>
              <option value="vignette_strong">Strong Vignette</option>
              <option value="cinematic_bars">Cinematic Bars</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save overlay defaults'}
        </button>
      </Section>

      {/* ── Clip Library Management ───────────────────────────────────────────── */}
      <Section title="Clip Library">
        <div className="space-y-4">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-white/30 text-[11px] uppercase tracking-wider block mb-0.5">Total clips</span>
              <span className="text-white/80 font-medium">{clipCount ?? '—'}</span>
            </div>
            {gapInsights.length > 0 && (
              <div>
                <span className="text-white/30 text-[11px] uppercase tracking-wider block mb-0.5">Top missing tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {gapInsights.map((g, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/[0.07] text-amber-400/60 border border-amber-500/[0.12]">
                      {(g.tags || []).slice(0, 2).join(', ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={exportLibrary}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.10] rounded-lg text-sm text-white/55 transition-colors">
              <Download size={13} /> Export clips.json
            </button>
          </div>
          <p className="text-[11px] text-white/25">Add clips via the Clip Library panel in Video Creator, or source with: <code className="bg-white/[0.05] px-1 rounded">yt-dlp</code></p>
        </div>
      </Section>

      {/* ── Render Settings ───────────────────────────────────────────────────── */}
      <Section title="Render Settings">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Output resolution</label>
            <select value={r.resolution || '1080p'} onChange={e => patchRender('resolution', e.target.value)} className={selectCls}>
              <option value="1080p">1080p (1920×1080)</option>
              <option value="4k">4K (3840×2160)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Frame rate</label>
            <select value={r.fps || 30} onChange={e => patchRender('fps', parseInt(e.target.value))} className={selectCls}>
              <option value={24}>24 fps (cinematic)</option>
              <option value={30}>30 fps (default)</option>
              <option value={60}>60 fps (smooth)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Remotion concurrency</label>
            <input type="number" min={1} max={16} value={r.concurrency || 1}
              onChange={e => patchRender('concurrency', parseInt(e.target.value))} className={inputCls} />
            <p className="text-[11px] text-white/20 mt-1">Higher = faster render, more CPU</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save settings'}
        </button>
      </Section>
    </div>
  )
}
