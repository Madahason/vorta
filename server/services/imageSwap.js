const path = require('path');
const fs   = require('fs');

// Backs up whatever image is currently on disk for a scene to
// scene_{sceneId}_original.jpg, but ONLY if that backup doesn't already exist. This is
// deliberate: the first swap/regenerate must preserve the true Higgsfield-generated
// original, but a second (or third...) swap must not overwrite that backup with an
// already-replaced image — the original would be lost forever. Once the backup exists,
// later calls are a no-op here; only the live file gets overwritten by the caller.
//
// Returns { backedUp, existingAbsPath } — existingAbsPath is null if there was nothing on
// disk yet to back up (e.g. this scene never had a generated image).
function backupOriginalIfNeeded(assetsDir, sceneId, currentImagePath) {
  if (!currentImagePath) return { backedUp: false, existingAbsPath: null };

  const currentFilename = path.basename(currentImagePath);
  const existingAbsPath = path.join(assetsDir, currentFilename);
  if (!fs.existsSync(existingAbsPath)) return { backedUp: false, existingAbsPath: null };

  const backupPath = path.join(assetsDir, `scene_${sceneId}_original.jpg`);
  if (fs.existsSync(backupPath)) return { backedUp: false, existingAbsPath };

  fs.copyFileSync(existingAbsPath, backupPath);
  return { backedUp: true, existingAbsPath };
}

module.exports = { backupOriginalIfNeeded };
