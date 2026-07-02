const path = require('path');
const fs   = require('fs');

const PROJECTS_DIR = path.resolve(__dirname, '../../projects');

// scenes.json is written as a flat array by generate.js, but render.js overwrites the same
// path with a wrapped { scenes, imagePaths, selectedClips, audio, audioSpecs } object once a
// render has run. All Fine-Tune endpoints (server/routes/scenes.js, images.js,
// higgsfieldRegenerate.js) need to read/write through this same pair of helpers so they all
// handle both on-disk shapes identically.
function readScenesFile(projectId) {
  const scenesPath = path.join(PROJECTS_DIR, projectId, 'scenes.json');
  if (!fs.existsSync(scenesPath)) return null;
  const raw = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
  const isWrapped = !Array.isArray(raw);
  const scenes = isWrapped ? (raw.scenes || []) : raw;
  return { scenesPath, raw, isWrapped, scenes };
}

function writeScenesFile({ scenesPath, raw, isWrapped, scenes }) {
  const out = isWrapped ? { ...raw, scenes } : scenes;
  fs.writeFileSync(scenesPath, JSON.stringify(out, null, 2));
}

module.exports = { PROJECTS_DIR, readScenesFile, writeScenesFile };
