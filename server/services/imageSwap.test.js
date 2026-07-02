// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/imageSwap.test.js
const assert = require('assert')
const fs     = require('fs')
const path   = require('path')
const os     = require('os')
const { backupOriginalIfNeeded } = require('./imageSwap')

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vorta-imageswap-test-'))

function cleanup() {
  fs.rmSync(testDir, { recursive: true, force: true })
}

try {
  // 1. No currentImagePath at all (scene never had an image) — nothing to back up
  let result = backupOriginalIfNeeded(testDir, '001', null)
  assert.deepStrictEqual(result, { backedUp: false, existingAbsPath: null })
  console.log('PASS: no-op when scene has no existing image_path')

  // 2. currentImagePath set, but the file doesn't actually exist on disk — nothing to back up
  result = backupOriginalIfNeeded(testDir, '001', '/projects/x/assets/001.png')
  assert.deepStrictEqual(result, { backedUp: false, existingAbsPath: null })
  console.log('PASS: no-op when the referenced file is missing from disk')

  // 3. File exists — first call backs it up
  const originalAbsPath = path.join(testDir, '002.png')
  fs.writeFileSync(originalAbsPath, 'ORIGINAL_HIGGSFIELD_BYTES')
  result = backupOriginalIfNeeded(testDir, '002', '/projects/x/assets/002.png')
  assert.strictEqual(result.backedUp, true)
  assert.strictEqual(result.existingAbsPath, originalAbsPath)
  const backupPath = path.join(testDir, 'scene_002_original.jpg')
  assert.ok(fs.existsSync(backupPath), 'backup file must exist after first call')
  assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_HIGGSFIELD_BYTES')
  console.log('PASS: first call backs up the current file to scene_{id}_original.jpg')

  // 4. Simulate the caller overwriting the live file (a swap/regenerate landing), then a
  //    SECOND backupOriginalIfNeeded call for the same scene must NOT touch the backup again —
  //    otherwise the true original would be lost, overwritten by the first replacement.
  fs.writeFileSync(originalAbsPath, 'FIRST_SWAP_BYTES')
  result = backupOriginalIfNeeded(testDir, '002', '/projects/x/assets/002.png')
  assert.strictEqual(result.backedUp, false, 'second call must not re-backup')
  assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_HIGGSFIELD_BYTES', 'true original must survive a second swap untouched')
  console.log('PASS: second (and later) calls never overwrite an existing backup — true original preserved across repeated swaps')

  // 5. A third swap, same guarantee
  fs.writeFileSync(originalAbsPath, 'SECOND_SWAP_BYTES')
  result = backupOriginalIfNeeded(testDir, '002', '/projects/x/assets/002.png')
  assert.strictEqual(result.backedUp, false)
  assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_HIGGSFIELD_BYTES')
  console.log('PASS: original survives a third swap too')

  console.log('\nAll imageSwap.test.js checks passed.')
} finally {
  cleanup()
}
