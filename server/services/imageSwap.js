const path = require('path');
const fs   = require('fs');

// Backs up whatever image is currently on disk for a scene to
// scene_{sceneId}_{backupSuffix}.jpg, but ONLY if that backup doesn't already exist. This is
// deliberate: the first swap/regenerate must preserve the true Higgsfield-generated
// original, but a second (or third...) swap must not overwrite that backup with an
// already-replaced image — the original would be lost forever. Once the backup exists,
// later calls are a no-op here; only the live file gets overwritten by the caller.
//
// backupSuffix defaults to 'original' (FT-3's primary-panel behavior, unchanged for every
// existing caller). FT-7 passes 'secondary_original' for the split-screen secondary panel, so
// its backup never collides with the primary panel's own backup file.
//
// Returns { backedUp, existingAbsPath } — existingAbsPath is null if there was nothing on
// disk yet to back up (e.g. this scene never had a generated image).
function backupOriginalIfNeeded(assetsDir, sceneId, currentImagePath, backupSuffix = 'original') {
  if (!currentImagePath) return { backedUp: false, existingAbsPath: null };

  const currentFilename = path.basename(currentImagePath);
  const existingAbsPath = path.join(assetsDir, currentFilename);
  if (!fs.existsSync(existingAbsPath)) return { backedUp: false, existingAbsPath: null };

  const backupPath = path.join(assetsDir, `scene_${sceneId}_${backupSuffix}.jpg`);
  if (fs.existsSync(backupPath)) return { backedUp: false, existingAbsPath };

  fs.copyFileSync(existingAbsPath, backupPath);
  return { backedUp: true, existingAbsPath };
}

module.exports = { backupOriginalIfNeeded };
