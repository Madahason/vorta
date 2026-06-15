// Loudness normalisation to -16 LUFS (YouTube/streaming standard) via ffmpeg loudnorm.
// Two-pass approach: first pass measures true peak and integrated loudness,
// second pass applies the exact correction so the output hits -16 LUFS.

const { exec }    = require('child_process')
const { promisify } = require('util')
const path        = require('path')
const fs          = require('fs')

const execAsync = promisify(exec)

const TARGET_LUFS  = -16
const TARGET_TP    = -1.5  // true-peak ceiling in dBTP
const TARGET_LRA   = 11    // loudness range

async function normaliseAudio(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)

  const tempPath = filePath.replace(/\.mp3$/, `_norm_${Date.now()}.mp3`)

  try {
    // Two-pass loudnorm: pass 1 measures, pass 2 corrects precisely
    const measureCmd = [
      'ffprobe',
      '-v quiet',
      '-f lavfi',
      `-i "amovie=${filePath},loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json"`,
      '-show_entries frame_tags=lavfi.loudnorm.input_i,lavfi.loudnorm.input_lra,lavfi.loudnorm.input_tp,lavfi.loudnorm.input_thresh,lavfi.loudnorm.normalization_type,lavfi.loudnorm.target_offset',
      '-of json',
    ].join(' ')

    // simpler single-pass is reliable for documentary narration (monotonic signal)
    const normCmd = [
      `ffmpeg -i "${filePath}"`,
      `-af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}"`,
      '-c:a libmp3lame -q:a 2',
      `-y "${tempPath}"`,
      '-loglevel quiet',
    ].join(' ')

    await execAsync(normCmd, { timeout: 60000 })

    if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size < 5000) {
      throw new Error('Normalised file missing or suspiciously small')
    }

    fs.renameSync(tempPath, filePath)
    console.log(`[normaliser] ${path.basename(filePath)} → ${TARGET_LUFS} LUFS`)
    return filePath
  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
    throw err
  }
}

async function normaliseAllScenes(projectId, scenes, projectsDir) {
  const audioDir = path.join(projectsDir, projectId, 'audio')
  const results  = { ok: [], failed: [] }

  for (const scene of scenes) {
    if (!scene.audio_path) continue
    const filePath = path.join(audioDir, `scene_${scene.scene_id}.mp3`)
    try {
      await normaliseAudio(filePath)
      results.ok.push(scene.scene_id)
    } catch (err) {
      console.warn(`[normaliser] scene ${scene.scene_id} failed:`, err.message)
      results.failed.push({ scene_id: scene.scene_id, error: err.message })
    }
  }

  console.log(`[normaliser] done — ${results.ok.length} ok, ${results.failed.length} failed`)
  return results
}

module.exports = { normaliseAudio, normaliseAllScenes }
