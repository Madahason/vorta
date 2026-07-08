const { renderMediaOnLambda, getRenderProgress, downloadMedia } = require('@remotion/lambda');

// Phase 4 — the final piece of the Lambda migration. Everything upstream of this
// (renderAssets.js/s3.js/s3Sync.js, Phase 1-3) already gets every asset a render
// references into S3 and resolves scenes.json to real S3 URLs; this module is what
// actually invokes the render on Lambda instead of the local Remotion CLI.

const POLL_INTERVAL_MS = 3000;

// gl: 'angle' — Lambda's Chromium has no real GPU, so WebGL (ThreeGlobe / 3d_graphic
// scenes) needs an explicit software/ANGLE backend, same reasoning as the local CLI's
// own --gl=angle flag (server/routes/render.js) for Windows. If a 3d_graphic scene
// renders as an error card on Lambda instead of the globe, 'swiftshader' is the
// documented fallback to try — no project in this codebase has a 3d_graphic scene at
// the time this was written, so this couldn't be verified against a real globe render.
const CHROMIUM_OPTIONS = { gl: 'angle' };

// concurrency: how many Lambda function instances this render uses (Remotion computes
// chunk size AS totalFrames/concurrency internally — 'concurrency' and 'framesPerLambda'
// are mutually exclusive inputs, setting both throws). Unthrottled, Remotion aims for
// 75-150 simultaneous instances depending on render length, which hit a real "AWS
// Concurrency limit reached (Rate Exceeded)" error during live testing — confirmed via
// AWS Service Quotas (L-B99A9384) that this account's actual Lambda concurrent-execution
// quota is 10, and the orchestrator invocation itself holds one of those 10 slots, so the
// safe ceiling is ~9. Defaults to a conservative 6; override via REMOTION_LAMBDA_CONCURRENCY
// once that account-level AWS quota has been raised, for faster, more parallel renders.
//
// At concurrency=6-9, a large render's chunks (e.g. ~1300-1900 frames for an 11634-frame
// project) are far bigger than Remotion's own default sizing (~100 frames) and can exceed
// a Lambda function's timeout — this is why the deployed function needs a generous timeout
// (900s here, not Remotion's 240s CLI default) as long as concurrency stays throttled this
// low. Once REMOTION_LAMBDA_CONCURRENCY can be raised well above ~10, chunks shrink back
// toward Remotion's own default sizing and a shorter timeout would be fine again.
const DEFAULT_LAMBDA_CONCURRENCY = 6;
function getLambdaConcurrency() {
  const configured = parseInt(process.env.REMOTION_LAMBDA_CONCURRENCY, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LAMBDA_CONCURRENCY;
}

// renderOnLambda — invokes a Remotion Lambda render, polls until done, downloads the
// finished MP4 to outPath. Mirrors syncAssetsToS3's shape (server/services/s3Sync.js):
// one orchestration function, onProgress/onLog callbacks, so server/routes/render.js's
// SSE wiring stays uniform across the upload and render stages.
//
// inputProps: the exact same propsData object render.js already builds for the local
// CLI (scenes/imagePaths/audioSpecs/selectedClips/audio, S3 URLs from Phase 1) — the
// Documentary composition itself is completely unaware of which render path invoked it.
//
// shouldContinue(): checked once per poll iteration (~every 3s). Returning false stops
// polling and resolves with { cancelled: true } WITHOUT downloading anything — this is
// the only "cancel" @remotion/lambda actually supports for an in-flight render. There is
// no API to terminate a running Lambda invocation itself (deleteRender only removes S3
// output artifacts after the fact); the render keeps running on AWS regardless, we just
// stop tracking/reporting it.
//
// Returns { outputPath, fileSize } on success, { cancelled: true } if shouldContinue()
// returned false, or throws with the real Lambda error message (missing config, an
// invocation error, or a fatal render error surfaced by getRenderProgress) on failure.
async function renderOnLambda({ inputProps, outPath, onProgress, onLog, shouldContinue = () => true }) {
  const region       = process.env.AWS_REGION;
  const functionName = process.env.REMOTION_FUNCTION_NAME;
  const serveUrl      = process.env.REMOTION_SERVE_URL;

  if (!region || !functionName || !serveUrl) {
    throw new Error(
      'Lambda render is not configured: AWS_REGION, REMOTION_FUNCTION_NAME, and REMOTION_SERVE_URL must all be set in .env'
    );
  }

  const concurrency = getLambdaConcurrency();
  if (onLog) onLog(`Invoking Lambda function ${functionName} in ${region} (concurrency=${concurrency})...`);
  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: 'Documentary',
    inputProps,
    codec: 'h264',
    chromiumOptions: CHROMIUM_OPTIONS,
    concurrency,
  });
  if (onLog) onLog(`Lambda render invoked: renderId=${renderId}`);

  for (;;) {
    if (!shouldContinue()) return { cancelled: true };

    const progress = await getRenderProgress({ renderId, bucketName, functionName, region });

    if (progress.fatalErrorEncountered) {
      const detail = progress.errors?.map(e => e.message).join('; ') || 'unknown Lambda render error';
      throw new Error(`Lambda render failed: ${detail}`);
    }

    if (onProgress) {
      const frameRange   = progress.renderMetadata?.frameRange;
      const totalFrames  = frameRange ? frameRange[1] - frameRange[0] + 1 : 0;
      onProgress({
        percent:     Math.round((progress.overallProgress || 0) * 100),
        frame:       progress.framesRendered || 0,
        totalFrames,
      });
    }

    if (progress.done) break;

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (!shouldContinue()) return { cancelled: true };

  if (onLog) onLog('Lambda render complete — downloading output...');
  const { outputPath, sizeInBytes } = await downloadMedia({ region, bucketName, renderId, outPath });

  return { outputPath, fileSize: sizeInBytes };
}

module.exports = { renderOnLambda };
