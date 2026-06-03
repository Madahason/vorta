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

  console.log(`[higgsfield] starting: model=${model} | "${prompt.slice(0, 60)}…"`);

  let result;
  try {
    result = await execAsync(cmd, { timeout: TIMEOUT });
  } catch (err) {
    if (err.killed) {
      throw new Error(`Higgsfield timed out after ${TIMEOUT / 1000}s`);
    }
    // err.stdout may have a partial result or error detail from the CLI
    const detail = err.stderr?.trim() || err.stdout?.trim() || err.message;
    throw new Error(`Higgsfield generation failed: ${detail}`);
  }

  const raw = result.stdout.trim();

  if (!raw.startsWith('http')) {
    console.error('[higgsfield] unexpected stdout:', raw.slice(0, 300));
    throw new Error(`Higgsfield returned unexpected output (not a URL): ${raw.slice(0, 200)}`);
  }

  console.log(`[higgsfield] done: ${raw}`);
  return raw;
}

module.exports = { generateImage, MODELS };
