const path = require('path');
const fs   = require('fs');

// Backs up whatever narration audio is currently on disk for a scene to
// scene_{sceneId}_original.mp3, but ONLY if that backup doesn't already exist. Same
// deliberate backup-once semantics as imageSwap.backupOriginalIfNeeded (FT-3): the first
// script-edit regeneration must preserve the true originally-generated narration, but a
// second (or third...) regeneration must not overwrite that backup with an
// already-replaced take — the original would be lost forever. Once the backup exists,
// later calls are a no-op here; only the live file gets overwritten by the caller.
//
// Returns { backedUp, existingAbsPath } — existingAbsPath is null if there was nothing on
// disk yet to back up (e.g. this scene never had narration generated).
function backupOriginalVoiceIfNeeded(audioDir, sceneId, currentAudioPath) {
  if (!currentAudioPath) return { backedUp: false, existingAbsPath: null };

  const currentFilename = path.basename(currentAudioPath);
  const existingAbsPath = path.join(audioDir, currentFilename);
  if (!fs.existsSync(existingAbsPath)) return { backedUp: false, existingAbsPath: null };

  const backupPath = path.join(audioDir, `scene_${sceneId}_original.mp3`);
  if (fs.existsSync(backupPath)) return { backedUp: false, existingAbsPath };

  fs.copyFileSync(existingAbsPath, backupPath);
  return { backedUp: true, existingAbsPath };
}

module.exports = { backupOriginalVoiceIfNeeded };
