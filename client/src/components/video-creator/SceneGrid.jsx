import { useState } from 'react'

const TYPE_STYLES = {
  image: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  motion_graphic: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  real_footage: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
}

const TYPE_LABEL = {
  image: 'image',
  motion_graphic: 'motion graphic',
  real_footage: 'real footage',
}

const SHOT_TYPES = ['image', 'motion_graphic', 'real_footage']

export default function SceneGrid({ scenes, onScenesChange }) {
  const updateScene = (index, patch) =>
    onScenesChange(scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider text-[11px]">
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''} detected
        </h2>
        <div className="flex gap-3 text-[11px] text-white/30">
          <span className="text-blue-400/60">{scenes.filter(s => s.shot_type === 'image').length} image</span>
          <span className="text-teal-400/60">{scenes.filter(s => s.shot_type === 'motion_graphic').length} motion</span>
          <span className="text-amber-400/60">{scenes.filter(s => s.shot_type === 'real_footage').length} footage</span>
        </div>
      </div>

      <div className="space-y-3">
        {scenes.map((scene, i) => (
          <SceneCard
            key={scene.scene_id}
            scene={scene}
            index={i}
            onChange={patch => updateScene(i, patch)}
          />
        ))}
      </div>
    </div>
  )
}

function SceneCard({ scene, index, onChange }) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState(scene.higgsfield_prompt)

  const savePrompt = () => {
    onChange({ higgsfield_prompt: promptDraft })
    setEditingPrompt(false)
  }

  const cancelPrompt = () => {
    setPromptDraft(scene.higgsfield_prompt)
    setEditingPrompt(false)
  }

  const isVisual = scene.shot_type === 'image' || scene.shot_type === 'real_footage'

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.1] transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-[11px] font-mono text-white/20 mt-0.5 shrink-0 w-7">
          {String(index + 1).padStart(3, '0')}
        </span>
        <p className="flex-1 text-sm text-white/70 leading-snug">
          {scene.script_excerpt}
        </p>
        <select
          value={scene.shot_type}
          onChange={e => {
            const newType = e.target.value
            onChange({
              shot_type: newType,
              real_footage_flag: newType === 'real_footage',
            })
          }}
          className={`text-[11px] px-2 py-1 rounded-md border font-medium bg-transparent cursor-pointer focus:outline-none shrink-0 ${TYPE_STYLES[scene.shot_type]}`}
        >
          {SHOT_TYPES.map(t => (
            <option key={t} value={t} className="bg-[#1a1a1a] text-white">
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 mb-3 ml-10 text-[11px] text-white/25">
        <span>mood: <span className="text-white/40">{scene.mood}</span></span>
        <span>·</span>
        <span>{scene.duration_seconds}s</span>
        {scene.clip_search_tags?.length > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-400/50">{scene.clip_search_tags.slice(0, 3).join(', ')}</span>
          </>
        )}
      </div>

      {/* Prompt / motion graphic type */}
      <div className="ml-10">
        {scene.shot_type === 'motion_graphic' ? (
          <div className="text-[11px] text-teal-400/50 bg-teal-500/[0.05] rounded-lg px-3 py-2 border border-teal-500/[0.12]">
            Template: <span className="font-mono">{scene.motion_graphic_type || 'TBD'}</span>
          </div>
        ) : editingPrompt ? (
          <div className="space-y-2">
            <textarea
              value={promptDraft}
              onChange={e => setPromptDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full bg-white/[0.05] border border-white/[0.15] rounded-lg px-3 py-2 text-[11px] text-white/80 focus:outline-none focus:border-white/25 resize-none font-mono leading-relaxed"
            />
            <div className="flex gap-2">
              <button
                onClick={savePrompt}
                className="text-[11px] px-3 py-1 bg-white/10 hover:bg-white/15 rounded text-white/70 transition-colors"
              >
                Save
              </button>
              <button
                onClick={cancelPrompt}
                className="text-[11px] px-3 py-1 text-white/25 hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setPromptDraft(scene.higgsfield_prompt); setEditingPrompt(true) }}
            className="w-full text-left text-[11px] text-white/35 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg px-3 py-2 font-mono leading-relaxed transition-colors border border-transparent hover:border-white/[0.06] group"
            title="Click to edit prompt"
          >
            {scene.higgsfield_prompt || <span className="text-white/15 italic">No prompt generated</span>}
          </button>
        )}
      </div>
    </div>
  )
}
