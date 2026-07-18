// DD-1: file-based persistence for a project's Direction layer.
//
// Path: projects/proj_[id]/direction.json — same per-project file pattern as scenes.json
// (services/scenesFile.js) and the same load/save style as scriptHistory.json.
//
// Stored shape:
// {
//   "version": 1,
//   "updatedAt": "ISO string",
//   "treatment": { ...object from services/director.js generateTreatment... },
//   "audit": null            // stays null in DD-1; DD-5 fills it
// }
//
// Absence of direction.json is a valid state — every pre-DD-1 project has none, and the
// existing single-pass analyze path runs unchanged for them.

const path = require('path');
const fs   = require('fs');

const { PROJECTS_DIR } = require('./scenesFile');
const { DEFAULT_STYLE_LOCK } = require('../config/styleDefaults');

function directionPath(projectId) {
  return path.join(PROJECTS_DIR, projectId, 'direction.json');
}

// Returns the stored direction object, or null if the file does not exist / is unreadable.
// Never throws on a missing file.
function readDirection(projectId) {
  try {
    return JSON.parse(fs.readFileSync(directionPath(projectId), 'utf8'));
  } catch {
    return null;
  }
}

// Accepts either { treatment, audit } or a bare treatment object. Creates the project dir
// if needed, stamps version/updatedAt, returns what was written.
function writeDirection(projectId, direction) {
  const isWrapped = direction && typeof direction === 'object' && 'treatment' in direction;
  const stored = {
    version:   1,
    updatedAt: new Date().toISOString(),
    treatment: isWrapped ? direction.treatment : (direction ?? null),
    audit:     isWrapped ? (direction.audit ?? null) : null,
  };
  fs.mkdirSync(path.join(PROJECTS_DIR, projectId), { recursive: true });
  fs.writeFileSync(directionPath(projectId), JSON.stringify(stored, null, 2));
  return stored;
}

function hasDirection(projectId) {
  return fs.existsSync(directionPath(projectId));
}

function deleteDirection(projectId) {
  fs.rmSync(directionPath(projectId), { force: true });
}

// Style lock resolution — NOT wired into scene generation yet (DD-3 does that). DD-1 only
// establishes the resolver and proves the fallback: no direction / no visual_signature /
// whitespace-only signature → DEFAULT_STYLE_LOCK.
function resolveStyleLock(direction) {
  const sig = direction?.treatment?.style_bible?.visual_signature;
  return (typeof sig === 'string' && sig.trim().length > 0)
    ? sig.trim()
    : DEFAULT_STYLE_LOCK;
}

module.exports = {
  readDirection,
  writeDirection,
  hasDirection,
  deleteDirection,
  resolveStyleLock,
};
