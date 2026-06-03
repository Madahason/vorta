const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Available image models
const MODELS = {
  default: 'nano_banana_2', // Fast, cinematic quality — default for all scenes
  quality: 'gpt_image_2',   // Higher quality, slower — opt-in per project
};

// 6 min covers both job creation + wait for worst-case generation times
const TIMEOUT = 360_000;

// cmd.exe-safe quoting: wrap in double quotes, escape internal " as ""
// exec() on Windows runs via cmd.exe; bash-style \" is wrong here.
// & % | < > are all literal inside cmd.exe double-quoted strings.
function quoteCmdArg(str) {
  return '"' + str.replace(/"/g, '""') + '"';
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
