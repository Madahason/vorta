const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// soul_cinematic — Higgsfield's cinematic still-image model
const IMAGE_MODEL = 'soul_cinematic';

const TIMEOUT_CREATE = 30_000;
const TIMEOUT_WAIT   = 360_000; // 6 min — image generation can take time
const TIMEOUT_GET    = 30_000;

// cmd.exe-safe quoting: wrap in double quotes, escape internal " as ""
// exec() uses cmd.exe on Windows; bash-style \" is wrong here — & % | < > are
// all safe inside double-quoted strings in cmd.exe without additional escaping.
function quoteCmdArg(str) {
  return '"' + str.replace(/"/g, '""') + '"';
}

// create returns: ["job-uuid"]  — an array, not an object
async function createJob(prompt) {
  let result;
  try {
    result = await execAsync(
      `higgsfield generate create ${IMAGE_MODEL} --prompt ${quoteCmdArg(prompt)} --json`,
      { timeout: TIMEOUT_CREATE }
    );
  } catch (err) {
    const detail = err.stderr?.trim() || err.message;
    throw new Error(`higgsfield create failed: ${detail}`);
  }

  let data;
  try {
    data = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`higgsfield create returned non-JSON: ${result.stdout.slice(0, 300)}`);
  }

  // Response shape: ["uuid"]
  const jobId = Array.isArray(data) ? data[0] : (data.id || data.job_id || null);
  if (!jobId) {
    throw new Error(`higgsfield create: no job id in response — ${JSON.stringify(data)}`);
  }

  console.log(`[higgsfield] job created: ${jobId}`);
  return jobId;
}

// wait prints the result URL to stdout on completion (positional job_id, no flag)
async function waitJob(jobId) {
  let result;
  try {
    result = await execAsync(
      `higgsfield generate wait ${jobId} --quiet`,
      { timeout: TIMEOUT_WAIT }
    );
    console.log(`[higgsfield] job complete: ${jobId}`);
  } catch (err) {
    if (err.killed) {
      throw new Error(`higgsfield wait timed out after ${TIMEOUT_WAIT / 1000}s (job: ${jobId})`);
    }
    throw new Error(`higgsfield wait failed: ${err.stderr?.trim() || err.message}`);
  }

  // wait stdout is the result URL — return it as a shortcut to skip the get call
  const url = result.stdout.trim();
  return url.startsWith('http') ? url : null;
}

// get returns full job JSON: { id, status, result_url, ... }
async function getResult(jobId) {
  let result;
  try {
    result = await execAsync(
      `higgsfield generate get ${jobId} --json`,
      { timeout: TIMEOUT_GET }
    );
  } catch (err) {
    throw new Error(`higgsfield get failed: ${err.stderr?.trim() || err.message}`);
  }

  let data;
  try {
    data = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`higgsfield get returned non-JSON: ${result.stdout.slice(0, 300)}`);
  }

  // result_url is the canonical field; also check legacy shapes
  const url = data.result_url || data.output_url || data.url
    || (Array.isArray(data.urls) ? data.urls[0] : null);

  if (!url) {
    throw new Error(`higgsfield get: no output URL in response — ${JSON.stringify(data)}`);
  }

  console.log(`[higgsfield] result: ${url}`);
  return url;
}

module.exports = { createJob, waitJob, getResult };
