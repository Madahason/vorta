import { useState } from 'react'
import {
  Loader2, RefreshCw, CheckCircle, XCircle, SkipForward,
  ChevronDown, ChevronUp, Copy, Code2,
} from 'lucide-react'

// ─── Remotion preview builder ─────────────────────────────────────────────────
// Wraps generated JSX in a self-contained HTML page that mocks Remotion hooks,
// transpiles via Babel CDN, and animates at 30 fps inside the iframe.
function buildPreviewHTML(componentCode, componentType = '') {
  // Strip import statements — all deps are mocked as globals
  const stripped = componentCode
    .replace(/^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"][^'"]+['"]\s*;?\n?/gm, '')
    .replace(/^export\s+default\s+function\s+(\w+)/m, 'function $1')
    .replace(/^export\s+default\s+(\w+)\s*;?\s*$/m, '')
    .trim()

  const fullCode = `
const {useState,useEffect,useRef,useCallback,useMemo}=React;

/* ── Remotion mock ── */
let __f=0;
const useCurrentFrame=()=>__f;
const useVideoConfig=()=>({fps:30,durationInFrames:150,width:1920,height:1080,id:'preview'});
const interpolate=(v,[a,b],[c,d],o={})=>{
  let t=(v-a)/(b-a);
  if(o.extrapolateLeft==='clamp')t=Math.max(0,t);
  if(o.extrapolateRight==='clamp')t=Math.min(1,t);
  t=Math.max(0,Math.min(1,t));
  return c+t*(d-c);
};
const spring=({frame:f=0,fps:r=30,from:a=0,to:b=1,config:cfg={}}={})=>{
  const p=Math.min(1,f/Math.max(1,(cfg.damping||10)*2));
  return a+(b-a)*(1-Math.pow(1-p,3));
};
const AbsoluteFill=({children,style})=>React.createElement('div',{style:{position:'absolute',top:0,left:0,right:0,bottom:0,...(style||{})}},children);
const Sequence=({children})=>children||null;
const Audio=()=>null;
const Video=({src,style})=>React.createElement('video',{src,style,muted:true,autoPlay:true,loop:true});
const Img=({src,style,alt=''})=>React.createElement('img',{src,style,alt});
const staticFile=p=>p;
const random=seed=>((seed*9301+49297)%233280)/233280;
/* ─────────────────── */

${stripped}

function PreviewApp(){
  const [frame,setFrame]=useState(0);
  __f=frame;
  useEffect(()=>{
    const id=setInterval(()=>setFrame(f=>(f+1)%150),33);
    return ()=>clearInterval(id);
  },[]);
  try{return React.createElement(SceneComponent);}
  catch(e){return React.createElement('div',{style:{color:'#444',fontSize:'10px',padding:'12px',fontFamily:'monospace'}},'Preview unavailable');}
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(PreviewApp));
`.trim()

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#root{width:100%;height:100%;background:#0a0a0a;overflow:hidden}
.fallback{display:flex;align-items:center;justify-content:center;height:100%;color:#333;font:10px monospace;text-align:center;padding:8px}
</style>
</head>
<body>
<div id="root"><div class="fallback">${componentType || 'Component'}</div></div>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>
(function(){
  var src=${JSON.stringify(fullCode)};
  try{
    var out=Babel.transform(src,{presets:['react']}).code;
    eval(out);
  }catch(e){
    document.getElementById('root').innerHTML='<div class="fallback">${componentType || 'Component'}<br><span style="color:#2a2a2a;font-size:9px">'+e.message.slice(0,60)+'</span></div>';
  }
})();
</script>
</body>
</html>`
}

// ─── Types ────────────────────────────────────────────────────────────────────

const TYPE_STYLES = {
  image:          'bg-blue-500/15 text-blue-300 border-blue-500/25',
  motion_graphic: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  real_footage:   'bg-amber-500/15 text-amber-300 border-amber-500/25',
}
const TYPE_LABEL = {
  image:          'image',
  motion_graphic: 'motion graphic',
  real_footage:   'real footage',
}
const SHOT_TYPES = ['image', 'motion_graphic', 'real_footage']

// ─── SceneGrid ────────────────────────────────────────────────────────────────

export default function SceneGrid({
  scenes,
  onScenesChange,
  sceneStatuses = {},
  onRetry,
  motionStatuses = {},
  onBuildComponent,
}) {
  const updateScene = (index, patch) =>
    onScenesChange(scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const imageCount   = scenes.filter(s => s.shot_type === 'image').length
  const motionCount  = scenes.filter(s => s.shot_type === 'motion_graphic').length
  const footageCount = scenes.filter(s => s.shot_type === 'real_footage').length
  const doneCount    = Object.values(sceneStatuses).filter(s => s.status === 'done').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
          {doneCount > 0 && <span className="ml-2 text-green-400/60">· {doneCount} generated</span>}
        </h2>
        <div className="flex gap-3 text-[11px] text-white/30">
          <span className="text-blue-400/60">{imageCount} image</span>
          <span className="text-teal-400/60">{motionCount} motion</span>
          <span className="text-amber-400/60">{footageCount} footage</span>
        </div>
      </div>

      <div className="space-y-3">
        {scenes.map((scene, i) => (
          <SceneCard
            key={scene.scene_id}
            scene={scene}
            index={i}
            onChange={patch => updateScene(i, patch)}
            genStatus={sceneStatuses[scene.scene_id] || null}
            onRetry={onRetry}
            motionStatus={motionStatuses[scene.scene_id] || null}
            onBuildComponent={onBuildComponent}
          />
        ))}
      </div>
    </div>
  )
}

// ─── SceneCard ────────────────────────────────────────────────────────────────

function SceneCard({ scene, index, onChange, genStatus, onRetry, motionStatus, onBuildComponent }) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft]     = useState(scene.higgsfield_prompt)
  const [codeExpanded, setCodeExpanded]   = useState(false)
  const [copied, setCopied]               = useState(false)

  const savePrompt   = () => { onChange({ higgsfield_prompt: promptDraft }); setEditingPrompt(false) }
  const cancelPrompt = () => { setPromptDraft(scene.higgsfield_prompt); setEditingPrompt(false) }

  const copyCode = () => {
    navigator.clipboard.writeText(scene.motion_component).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Image generation status
  const status      = genStatus?.status || null
  const isGenerating = status === 'generating'
  const isDone       = status === 'done'
  const isFailed     = status === 'failed'
  const isPending    = status === 'pending'
  const isSkipped    = status === 'skipped'

  // Motion component build status
  const motionBuilding = motionStatus?.status === 'generating'
  const motionFailed   = motionStatus?.status === 'failed'
  const hasComponent   = !!scene.motion_component

  const borderClass = isGenerating
    ? 'border-blue-500/40'
    : isDone    ? 'border-green-500/30'
    : isFailed  ? 'border-red-500/30'
    : 'border-white/[0.06] hover:border-white/[0.1]'

  return (
    <div className={`rounded-xl border bg-white/[0.02] p-4 transition-colors ${borderClass}`}>

      {/* ── Header ── */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-[11px] font-mono text-white/20 mt-0.5 shrink-0 w-7">
          {String(index + 1).padStart(3, '0')}
        </span>
        <p className="flex-1 text-sm text-white/70 leading-snug">{scene.script_excerpt}</p>
        <div className="flex items-center gap-2 shrink-0">
          {isPending    && <span className="text-[10px] text-white/25 font-mono">pending</span>}
          {isGenerating && <Loader2 size={12} className="animate-spin text-blue-400" />}
          {isDone       && <CheckCircle size={13} className="text-green-400" />}
          {isFailed     && <XCircle size={13} className="text-red-400" />}
          {isSkipped && scene.shot_type !== 'motion_graphic' && (
            <SkipForward size={13} className="text-white/20" />
          )}
          <select
            value={scene.shot_type}
            onChange={e => {
              const t = e.target.value
              onChange({ shot_type: t, real_footage_flag: t === 'real_footage' })
            }}
            disabled={isGenerating}
            className={`text-[11px] px-2 py-1 rounded-md border font-medium bg-transparent cursor-pointer focus:outline-none disabled:opacity-50 ${TYPE_STYLES[scene.shot_type]}`}
          >
            {SHOT_TYPES.map(t => (
              <option key={t} value={t} className="bg-[#1a1a1a] text-white">{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Metadata ── */}
      <div className="flex items-center gap-3 mb-3 ml-10 text-[11px] text-white/25">
        <span>mood: <span className="text-white/40">{scene.mood}</span></span>
        <span>·</span>
        <span>{scene.duration_seconds}s</span>
        {scene.clip_search_tags?.length > 0 && (
          <><span>·</span><span className="text-amber-400/50">{scene.clip_search_tags.slice(0, 3).join(', ')}</span></>
        )}
      </div>

      {/* ── Content ── */}
      <div className="ml-10 space-y-2">

        {/* ════ MOTION GRAPHIC ════════════════════════════════════════════════ */}
        {scene.shot_type === 'motion_graphic' && (
          <div className="space-y-3">

            {/* Template label + Build/Regenerate button */}
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-teal-400/50 bg-teal-500/[0.05] rounded-lg px-3 py-2 border border-teal-500/[0.12]">
                Template: <span className="font-mono">{scene.motion_graphic_type || 'TBD'}</span>
              </div>

              {motionBuilding ? (
                <span className="flex items-center gap-1.5 text-[11px] text-teal-400/60">
                  <Loader2 size={11} className="animate-spin" />
                  Generating component…
                </span>
              ) : (
                <button
                  onClick={() => onBuildComponent(scene)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg text-teal-300 transition-colors"
                >
                  {motionFailed ? <RefreshCw size={11} /> : <Code2 size={11} />}
                  {motionFailed ? 'Retry' : hasComponent ? 'Regenerate' : 'Build Component'}
                </button>
              )}
            </div>

            {/* Error message */}
            {motionFailed && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2">
                <p className="text-[11px] text-red-400/70">
                  {motionStatus?.error || 'Component generation failed'}
                </p>
              </div>
            )}

            {/* Live preview + code block */}
            {hasComponent && (
              <div className="space-y-2">

                {/* ── Preview iframe ── */}
                <p className="text-[10px] text-white/25">Preview</p>
                <div className="rounded-lg overflow-hidden border border-teal-500/[0.15]"
                     style={{ aspectRatio: '16 / 9', maxHeight: '160px', width: `${160 * 16 / 9}px`, maxWidth: '100%' }}>
                  <iframe
                    srcDoc={buildPreviewHTML(scene.motion_component, scene.motion_graphic_type)}
                    title={`preview-${scene.scene_id}`}
                    sandbox="allow-scripts"
                    className="w-full h-full border-0"
                    style={{ display: 'block' }}
                  />
                </div>

                {/* ── Ready badge + controls ── */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/[0.08] text-teal-400/50 border border-teal-500/[0.12]">
                    Remotion Component · Ready to use
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={copyCode}
                      className="flex items-center gap-1 text-[10px] text-teal-400/50 hover:text-teal-300 transition-colors"
                    >
                      <Copy size={9} />
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                    <button
                      onClick={() => setCodeExpanded(e => !e)}
                      className="flex items-center gap-1 text-[10px] text-teal-400/40 hover:text-teal-300 transition-colors"
                    >
                      {codeExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                      {codeExpanded ? 'Hide code' : 'Show full code'}
                    </button>
                  </div>
                </div>

                {/* ── Code block ── */}
                <div style={{
                  background: '#0d0d0d',
                  border: '1px solid rgba(20,184,166,0.2)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <pre style={{
                    fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code","Consolas",monospace',
                    fontSize: '11px',
                    lineHeight: '1.6',
                    padding: '12px',
                    color: 'rgba(178,255,236,0.5)',
                    overflowX: 'auto',
                    overflowY: codeExpanded ? 'auto' : 'hidden',
                    maxHeight: codeExpanded ? '480px' : 'none',
                    whiteSpace: 'pre',
                  }}>
                    {codeExpanded
                      ? scene.motion_component
                      : scene.motion_component.split('\n').slice(0, 5).join('\n')
                    }
                  </pre>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ════ REAL FOOTAGE skipped ══════════════════════════════════════════ */}
        {scene.shot_type === 'real_footage' && isSkipped && (
          <div className="text-[11px] text-amber-400/40 bg-amber-500/[0.04] rounded-lg px-3 py-2 border border-amber-500/[0.10] flex items-center gap-2">
            <SkipForward size={11} />
            Skipped — will be matched to clip library in Phase 3
          </div>
        )}

        {/* ════ PROMPT (image + real_footage) ════════════════════════════════ */}
        {(scene.shot_type === 'image' || scene.shot_type === 'real_footage') && (
          <>
            {editingPrompt ? (
              <div className="space-y-2">
                <textarea
                  value={promptDraft}
                  onChange={e => setPromptDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full bg-white/[0.05] border border-white/[0.15] rounded-lg px-3 py-2 text-[11px] text-white/80 focus:outline-none focus:border-white/25 resize-none font-mono leading-relaxed"
                />
                <div className="flex gap-2">
                  <button onClick={savePrompt} className="text-[11px] px-3 py-1 bg-white/10 hover:bg-white/15 rounded text-white/70 transition-colors">Save</button>
                  <button onClick={cancelPrompt} className="text-[11px] px-3 py-1 text-white/25 hover:text-white/50 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setPromptDraft(scene.higgsfield_prompt); setEditingPrompt(true) }}
                disabled={isGenerating}
                className="w-full text-left text-[11px] text-white/35 bg-white/[0.02] hover:bg-white/[0.05] disabled:cursor-default rounded-lg px-3 py-2 font-mono leading-relaxed transition-colors border border-transparent hover:border-white/[0.06]"
                title="Click to edit prompt"
              >
                {scene.higgsfield_prompt || <span className="text-white/15 italic">No prompt generated</span>}
              </button>
            )}
          </>
        )}

        {/* ════ GENERATED IMAGE ═══════════════════════════════════════════════ */}
        {isDone && genStatus.image_path && (
          <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.08]">
            <img
              src={genStatus.image_path}
              alt={`Scene ${scene.scene_id}`}
              className="w-full object-cover max-h-48"
              loading="lazy"
            />
          </div>
        )}

        {/* ════ GENERATING PULSE ══════════════════════════════════════════════ */}
        {isGenerating && (
          <div className="h-24 rounded-lg bg-white/[0.03] border border-blue-500/[0.15] flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin text-blue-400/60" />
            <span className="text-[11px] text-blue-400/50">Generating with Higgsfield…</span>
          </div>
        )}

        {/* ════ IMAGE FAILED ══════════════════════════════════════════════════ */}
        {isFailed && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2.5 flex items-start justify-between gap-3">
            <p className="text-[11px] text-red-400/80 leading-relaxed flex-1">
              {genStatus.error || 'Generation failed'}
            </p>
            {onRetry && (
              <button
                onClick={() => onRetry(scene.scene_id, scene.higgsfield_prompt)}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-red-400 transition-colors shrink-0"
              >
                <RefreshCw size={10} /> Retry
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
