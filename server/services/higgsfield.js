const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Available image models (job set types from `higgsfield model list`)
// To switch default without touching code: set HIGGSFIELD_MODEL in .env
const MODELS = {
  default: process.env.HIGGSFIELD_MODEL || 'nano_banana_2', // Nano Banana Pro (Gemini 3 Pro)
  fast:    'nano_banana_flash',                              // Fast tier
  // cinematic_studio_2_5  — cinematic/film tuned, good alternative for documentary B-roll
  // flux_kontext          — precise subject placement, complex prompt following
  // seedream_v4_5         — painterly/editorial mood, good for historical/atmospheric scenes
  // veo3, veo3_1          — video generation, reserved for future optional video scenes
};

// 6 min covers both job creation + wait for worst-case generation times
const TIMEOUT = 360_000;

// Platform-safe argument quoting.
// Windows/cmd.exe: double-quote, escape internal " as "".
// Linux/bash: single-quote, escape internal ' as '\'' (end-quote, literal, re-open).
function quoteCmdArg(str) {
  if (process.platform === 'win32') {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Generate a single image via Higgsfield CLI.
 * Uses --wait so the command blocks until complete and returns the URL on stdout.
 * stdout is a plain URL string, not JSON.
 *
 * @param {string} prompt  - Full Higgsfield prompt (style lock already appended)
 * @param {string} [model] - Job set type; defaults to MODELS.default
 * @returns {Promise<string>} Resolved image URL
 */
async function generateImage(prompt, model = MODELS.default) {
  const cmd = [
    'higgsfield generate create',
    model,
    '--prompt', quoteCmdArg(prompt),
    '--aspect_ratio 16:9',
    '--resolution 2k',
    '--wait',
  ].join(' ');

  console.log('[higgsfield] CMD:', cmd);

  let result;
  try {
    result = await execAsync(cmd, { timeout: TIMEOUT });
  } catch (err) {
    if (err.killed) throw new Error(`Higgsfield timed out after ${TIMEOUT / 1000}s`);
    const detail = err.stderr?.trim() || err.stdout?.trim() || err.message;
    console.error('[higgsfield] exec failed:', detail.slice(0, 300));
    throw new Error(`Higgsfield generation failed: ${detail}`);
  }

  // Strip ANSI colour codes, then find the URL line
  const clean = result.stdout.replace(/\x1B\[[0-9;]*m/g, '');
  const urlLine = clean.split('\n').map(l => l.trim()).find(l => l.startsWith('http'));

  if (!urlLine) {
    console.error('[higgsfield] no URL found in output:', clean.slice(0, 300));
    throw new Error(`Higgsfield returned no URL. Full output: ${clean.slice(0, 200)}`);
  }

  console.log(`[higgsfield] done: ${urlLine}`);
  return urlLine;
}

module.exports = { generateImage, MODELS };
