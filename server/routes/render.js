const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawn } = require('child_process');
const { resolveRenderAssetUrl, buildAssetKey } = require('../services/renderAssets');
const { syncAssetsToS3 } = require('../services/s3Sync');
const { renderOnLambda } = require('../services/lambdaRender');

// In-memory render job store — keyed by projectId
const renderJobs = new Map();

// ── path helpers ───────────────────────────────────────────────────────────────

const PROJECT_ROOT     = path.resolve(__dirname, '../..');

// LOCAL-ONLY sync target for local CLI rendering — NOT remotion/public/. Remotion's own
// bundler (@remotion/bundler's bundle.js, used by both `remotion render` and
// `remotion lambda sites create`) always copies whatever directory is configured as the
// "public dir" into the render bundle wholesale. remotion/public/ is what
// `lambda sites create` bundles by default, and that bundle gets uploaded to S3 as the
// Lambda "site" — so anything synced there (per-project images/audio, the shared clip
// library) bloated that site bundle to ~1.6GB (a site bundle should be a few MB of
// composition code). Lambda renders don't need any of this synced locally anyway — they
// fetch images/audio/clips from S3 via the Phase 1/2 resolver (renderAssets.js/s3Sync.js).
// So local-only sync now targets this sibling directory instead, and buildRenderCommand()
// below passes --public-dir pointing at it so the LOCAL CLI's own bundling (which is what
// makes staticFile() resolve anything) still finds these files — same mechanism, just
// redirected to a source directory that never gets bundled for Lambda.
const LOCAL_ASSETS_DIR = path.resolve(__dirname, '../../remotion/localAssets');

// ── resolveRenderAssetPath — the ONE conversion point for every asset type (image,
// audio, clip, uploaded narration) that reaches the Remotion CLI in local mode.
//
// WHY NOT HTTP URLs: passing http://localhost:PORT/... URLs made headless Chrome fetch
// every image/audio file, frame after frame, from the same Express server that's also
// serving the rest of the app. Under load a fetch stalls, delayRender() hangs, and the
// CLI's --timeout kills the ENTIRE render — at a different % every run depending on
// which fetch happened to stall. This is exactly the bug class already fixed for
// real_footage clips (see FootageScene.jsx) by copying the file into a public-style dir
// and loading it through Remotion's OWN bundle server via staticFile() instead.
//
// WHY NOT absolute filesystem paths: already tried and rejected (see PLAN.md Session
// 12) — Remotion's headless Chrome turns an absolute path into a file:///... URL and
// refuses it ("Can only download URLs starting with http:// or https://").
//
// So every asset type gets the same treatment as clips: copy into
// LOCAL_ASSETS_DIR/<category>/ and return the BARE relative path staticFile() expects
// (e.g. "images/proj_x__scene_001.jpg"). This must stay bare (no leading slash) because
// only staticFile(), called from WITHIN the Remotion composition, knows the right prefix
// to add — confirmed by reading @remotion/bundler's bundle.js: it copies whatever
// directory is configured as the public dir into the bundle at a "/public" mount
// (window.remotion_staticBase = "/public", injected into the render's HTML) and
// staticFile() is the only thing that reads that global to prepend it. A hand-built
// "/images/..." URL 404s during CLI render for exactly that reason — it's missing the
// "/public" prefix Remotion actually serves from.
//
// Because this value is bare, it is NOT written into the scene/clip object's own
// image_path/audio_path/file field (those get read directly into plain <img>/<audio> src
// by the Fine-Tune UI — see server/services/scenesFile.js — which needs a normal
// browser-loadable URL, not something only staticFile() can resolve). Instead it goes
// into the separate top-level imagePaths/audioSpecs maps that Documentary.jsx already
// prefers over the scene's own field, wrapped in staticFile() there. This keeps a
// render from ever corrupting the canonical per-scene fields the wizard reads after a
// page reload.
//
// namespace: prefix to avoid collisions between projects that reuse the same filename
// convention (every project has a "scene_001.jpg"). Clips already live in one shared
// library/clips/ folder with globally-unique filenames, so callers pass namespace=null
// for those to preserve today's de-duplicated sync behaviour.
//
// Returns null if the source file doesn't exist on disk — callers treat that as a
// missing-asset validation failure, never as "not generated yet" (that's a null INPUT,
// handled before this function is even called).
function resolveRenderAssetPath(sourceAbsolutePath, category, namespace) {
  if (!sourceAbsolutePath || !fs.existsSync(sourceAbsolutePath)) return null;

  const baseName = path.basename(sourceAbsolutePath);
  const destName = namespace ? `${namespace}__${baseName}` : baseName;
  const destDir  = path.join(LOCAL_ASSETS_DIR, category);
  const destPath = path.join(destDir, destName);

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(destPath)) fs.copyFileSync(sourceAbsolutePath, destPath);

  return `${category}/${destName}`;
}

// A real absolute filesystem path — Windows drive letter ("C:\..." / "C:/...") or UNC
// ("\\server\share\..."). Deliberately NOT what Node's path.isAbsolute() considers
// absolute: on win32 that also returns true for a bare-leading-slash path like
// "/projects/x/audio/scene_001.mp3", which is actually root-RELATIVE (meant to be
// resolved against PROJECT_ROOT, same as in a browser), not a real filesystem root.
const isRealAbsolutePath = (p) => /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p);

// Resolve any stored asset reference — a root-relative "/projects/..." or
// "/library/..." URL, a stale "http://localhost:PORT/..." URL from a scenes.json
// written before this fix, or an already-absolute filesystem path — to the real file
// on disk under PROJECT_ROOT.
function toAbsoluteSourcePath(assetPath) {
  if (!assetPath) return null;
  const clean = assetPath.replace(/^https?:\/\/[^/]+/, '');
  if (isRealAbsolutePath(clean)) return clean;
  return path.resolve(PROJECT_ROOT, clean.replace(/^\/+/, ''));
}

// ── helpers ────────────────────────────────────────────────────────────────────

const q = (p) => `"${p}"`;  // quote a path for shell command

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(job, data) {
  job.sseClients.forEach(clientRes => {
    try { sendSSE(clientRes, data); } catch {}
  });
}

// Parse Remotion progress lines — handles "X/Y" frame counts and "N%" patterns
function parseProgress(line, job) {
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\r\n]/g, '');
  if (!clean.trim()) return false;

  let updated = false;

  const frameMatch = clean.match(/(\d+)\s*\/\s*(\d+)/);
  if (frameMatch) {
    const frame = parseInt(frameMatch[1]);
    const total = parseInt(frameMatch[2]);
    if (total > 0 && frame <= total) {
      job.progress.frame       = frame;
      job.progress.totalFrames = total;
      job.progress.percent     = Math.min(99, Math.round((frame / total) * 100));
      updated = true;
    }
  }

  if (!updated) {
    const pctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      if (pct >= 0 && pct <= 100) {
        job.progress.percent = Math.round(pct);
        updated = true;
      }
    }
  }

  return updated;
}

// ── POST / — start render ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  // renderTarget: 'local' (default, unchanged behavior — every existing caller omits this
  // field) or 'lambda' — Phase 1 of the Remotion Lambda migration. 'lambda' switches every
  // resolveAsset() call below from the local staticFile sync (resolveRenderAssetPath) to
  // computing an S3 URL (resolveRenderAssetUrl) instead. The local CLI is still spawned
  // either way in this phase — no Lambda invocation yet (that's Phase 4) — so 'lambda' is
  // for inspecting the resulting scenes.json's asset URLs, not for producing a working
  // local render (real_footage clips in particular won't resolve locally in this mode,
  // since staticFile() has nothing synced to find — see the clips block below).
  const { projectId, scenes, selectedClips, audio, renderTarget = 'local' } = req.body;

  if (!projectId || !Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'projectId and scenes array are required' });
  }

  // Kill any previous render for this project
  const existing = renderJobs.get(projectId);
  if (existing?.process) {
    existing.cancelled = true;
    try { existing.process.kill(); } catch {}
  }

  console.log('[render] selectedClips count:', Object.keys(selectedClips || {}).length);

  // ── Resolve every asset field through the ONE shared resolver ────────────────
  // Every image, audio, and clip reference gets copied into LOCAL_ASSETS_DIR/<category>/
  // and resolved to a bare staticFile()-ready path — never an HTTP URL (root cause of
  // the non-deterministic mid-render crashes) and never an absolute filesystem path
  // (already tried and rejected — see resolveRenderAssetPath's comment).
  //
  // Resolved values are deliberately kept OUT of the scene/clip objects themselves and
  // put into separate top-level maps (imagePaths, secondaryImagePaths, cutawayImagePaths,
  // audioSpecs[].narration.url) that Documentary.jsx already prefers over the scene's own
  // field — see resolveRenderAssetPath's comment for why. clip.file is intentionally left
  // untouched too: FootageScene.jsx already derives the clip filename and calls
  // staticFile() itself regardless of clip.file's shape, so resolveAsset only needs to
  // run for its sync-to-disk + validation side effect there.
  //
  // A null/empty path (asset never generated yet) resolves to null with no validation
  // failure — SceneRenderer already falls back to PlaceholderScene for that. A path that
  // IS set but whose file doesn't exist on disk is a genuine missing-asset failure and
  // gets collected in missingAssets so the render can abort before it ever starts,
  // instead of hanging at some non-deterministic percentage.
  const missingAssets = [];

  // Phase 2: every asset resolved in lambda mode also gets queued here for
  // syncAssetsToS3 (server/services/s3Sync.js), which runs once, after all resolution is
  // done and validation has passed, before the render is allowed to start. `key` comes
  // from buildAssetKey() — the exact same call resolveRenderAssetUrl makes internally —
  // so the URL a render is told to fetch from and the key an asset gets uploaded to can
  // never diverge. Always empty in local mode.
  const uploadQueue = [];

  function resolveAsset(rawPath, category, namespace, kind, sceneId) {
    if (!rawPath) return null;

    if (renderTarget === 'lambda') {
      // Same "does the source file actually exist" signal as local mode, but no local
      // sync copy — a Lambda render will fetch this from S3 (Phase 2 uploads it there;
      // Phase 4 invokes Lambda), never from local disk on this machine.
      const abs = toAbsoluteSourcePath(rawPath);
      if (!abs || !fs.existsSync(abs)) {
        missingAssets.push({ scene_id: sceneId, kind, path: rawPath });
        return null;
      }
      const key = buildAssetKey(rawPath, category, namespace);
      uploadQueue.push({ localPath: abs, key, shared: !namespace, sceneId, kind });
      return resolveRenderAssetUrl(rawPath, category, namespace);
    }

    const resolved = resolveRenderAssetPath(toAbsoluteSourcePath(rawPath), category, namespace);
    if (!resolved) {
      missingAssets.push({ scene_id: sceneId, kind, path: rawPath });
      return null;
    }
    return resolved;
  }

  // Strip any motion_component that fails to parse — truncated generation output causes
  // an eval SyntaxError that shows a broken overlay for the scene. Scene objects are
  // otherwise passed through untouched (see comment above for why).
  const renderScenes = scenes.map(scene => {
    let motion_component = scene.motion_component || null;
    if (motion_component) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(motion_component);
      } catch {
        console.warn(`[render] scene ${scene.scene_id}: motion_component failed syntax check — stripping (will use template fallback)`);
        motion_component = null;
      }
    }
    return { ...scene, motion_component };
  });

  // Top-level render-only asset maps, keyed by scene_id — see the big comment above.
  const imagePaths          = {};
  const secondaryImagePaths = {};
  const cutawayImagePaths   = {};
  const audioPaths          = {};
  renderScenes.forEach(scene => {
    const img = resolveAsset(scene.image_path, 'images', projectId, 'image', scene.scene_id);
    if (img) imagePaths[scene.scene_id] = img;

    const secondary = resolveAsset(scene.secondary_image_path, 'images', projectId, 'secondary_image', scene.scene_id);
    if (secondary) secondaryImagePaths[scene.scene_id] = secondary;

    const cutawayImg = resolveAsset(scene.cutaway?.image_path, 'images', projectId, 'cutaway_image', scene.scene_id);
    if (cutawayImg) cutawayImagePaths[scene.scene_id] = cutawayImg;

    const aud = resolveAsset(scene.audio_path, 'audio', projectId, 'audio', scene.scene_id);
    if (aud) audioPaths[scene.scene_id] = aud;
  });

  // Clips — namespace=null in both modes: clips live in one shared, deduplicated
  // library/clips/ folder reused across every project, never namespaced per-project
  // (unlike per-project "scene_001.jpg"-style image/audio filenames).
  //
  // local mode: run resolveAsset purely for its sync-to-disk + validation side effect;
  // clip.file itself is left untouched because FootageScene.jsx already derives the
  // filename and calls staticFile() itself regardless of clip.file's shape.
  //
  // lambda mode: that self-sufficient local resolution has nothing to lean on — a Lambda
  // site's bundled public/ can't contain an arbitrary, per-render clip selection the way
  // LOCAL_ASSETS_DIR/clips/ gets freshly synced before each local CLI run — so clip.file
  // MUST be overwritten with the real S3 URL here.
  let renderClips;
  if (renderTarget === 'lambda') {
    renderClips = Object.fromEntries(
      Object.entries(selectedClips || {}).map(([sceneId, clip]) => [
        sceneId,
        clip?.file ? { ...clip, file: resolveAsset(clip.file, 'clips', null, 'clip', sceneId) } : clip,
      ])
    );
  } else {
    Object.entries(selectedClips || {}).forEach(([sceneId, clip]) => {
      if (clip?.file) resolveAsset(clip.file, 'clips', null, 'clip', sceneId);
    });
    renderClips = selectedClips;
  }

  // Uploaded narration audio (ExportPanel upload flow): this field isn't read directly
  // by the Fine-Tune UI elsewhere, so it's safe to resolve and overwrite in place.
  const audioProps = audio?.path ? { ...audio, path: resolveAsset(audio.path, 'audio', projectId, 'narration_upload', null) } : null;

  // Fail fast, before writing scenes.json or spawning the CLI, if any REFERENCED asset
  // is missing on disk — this is what used to hang the render at a different % each run.
  if (missingAssets.length > 0) {
    const message = `Render aborted before starting: missing asset file(s): ${
      missingAssets.map(a => `scene ${a.scene_id ?? 'global'} (${a.kind}): ${a.path}`).join('; ')
    }. Re-generate or re-select these assets before rendering.`;
    console.error(`[render] ${message}`);
    renderJobs.set(projectId, {
      process:    null,
      progress:   { percent: 0, frame: 0, totalFrames: 0 },
      status:     'error',
      outputPath: null,
      stderr:     message,
      sseClients: new Set(),
      cancelled:  false,
    });
    return res.json({ started: true, projectId });
  }

  // Narration-only audio specs — music and sound effects are handled in post-production.
  // narration.url is the resolved (bare, staticFile()-ready) path from audioPaths, not
  // scene.audio_path — see the big comment above resolveAsset for why the two differ.
  const audioSpecs = renderScenes.map(scene => ({
    scene_id:  scene.scene_id,
    narration: audioPaths[scene.scene_id] ? { url: audioPaths[scene.scene_id], volume: 1.0 } : null,
  }));
  const narrationCount = audioSpecs.filter(s => s.narration?.url).length;
  console.log('[render] audioSpecs: narration', narrationCount, '/', audioSpecs.length, 'scenes');
  audioSpecs.forEach(s =>
    console.log(`  [render] scene ${s.scene_id}:`, s.narration?.url || 'NO NARRATION')
  );
  if (renderScenes[0]) console.log('[render] scene 0 image path:', imagePaths[renderScenes[0].scene_id] || null);

  // Flag image scenes with no image yet — Documentary.jsx's SceneRenderer already falls
  // back to PlaceholderScene for these (never passes a null src to <img>), but a null
  // image_path usually means the scene's Higgsfield generation never finished, so
  // surface it clearly instead of only reporting it silently as a placeholder frame.
  // (Reached only when missingAssets is empty, so a null here can only mean "never
  // generated", never "referenced file missing" — that already aborted above.)
  const scenesWithMissingImages = renderScenes
    .filter(s => s.shot_type === 'image' && !imagePaths[s.scene_id])
    .map(s => s.scene_id);
  if (scenesWithMissingImages.length > 0) {
    console.warn(`[render] scenes with no image_path yet (will render as placeholder): ${scenesWithMissingImages.join(', ')}`);
  }

  const propsData = {
    scenes:               renderScenes,
    imagePaths,
    secondaryImagePaths,
    cutawayImagePaths,
    selectedClips: renderClips,
    audio:                audioProps,
    audioSpecs,
  };

  // Final guard: no resolved asset field should ever contain a local/dev-server URL at
  // this point. If one slipped through, fail loudly instead of silently spawning a
  // render that will hang the same way this whole fix was written to prevent. Flags
  // plain "http://" (this app never serves anything else over http) and any "localhost"
  // substring (belt-and-suspenders in case one somehow appeared behind https); does NOT
  // flag "https://" generally — a Lambda-mode S3 URL (https://<bucket>.s3...) is correct
  // and must pass through untouched.
  const httpOffenders = [];
  const checkHttp = (label, value) => {
    if (typeof value === 'string' && (/^http:\/\//i.test(value) || /localhost/i.test(value))) {
      httpOffenders.push(`${label}: ${value}`);
    }
  };
  Object.entries(imagePaths).forEach(([sceneId, v]) => checkHttp(`scene ${sceneId} imagePaths`, v));
  Object.entries(secondaryImagePaths).forEach(([sceneId, v]) => checkHttp(`scene ${sceneId} secondaryImagePaths`, v));
  Object.entries(cutawayImagePaths).forEach(([sceneId, v]) => checkHttp(`scene ${sceneId} cutawayImagePaths`, v));
  Object.entries(audioPaths).forEach(([sceneId, v]) => checkHttp(`scene ${sceneId} audioPaths`, v));
  // clip.file is only checked in lambda mode — in local mode it's intentionally left
  // untouched (may legitimately still carry a stale http://localhost URL from an older
  // scenes.json) because FootageScene.jsx never uses that field's URL directly; it only
  // extracts the basename and calls staticFile() itself. In lambda mode renderClips[].file
  // WAS just overwritten with the real S3 URL above, so it's meaningful to check here.
  if (renderTarget === 'lambda') {
    Object.entries(renderClips).forEach(([sceneId, clip]) => checkHttp(`clip ${sceneId} file`, clip?.file));
  }
  checkHttp('uploaded narration audio.path', audioProps?.path);

  if (httpOffenders.length > 0) {
    const message = `Render aborted: asset field(s) resolved to a local/dev-server URL instead of a valid ${renderTarget === 'lambda' ? 'S3' : 'local staticFile'} path: ${httpOffenders.join('; ')}`;
    console.error(`[render] ${message}`);
    renderJobs.set(projectId, {
      process:    null,
      progress:   { percent: 0, frame: 0, totalFrames: 0 },
      status:     'error',
      outputPath: null,
      stderr:     message,
      sseClients: new Set(),
      cancelled:  false,
    });
    return res.json({ started: true, projectId });
  }

  // Write project files
  const projectDir = path.resolve(PROJECT_ROOT, `projects/${projectId}`);
  const outputDir  = path.join(projectDir, 'output');
  const propsPath  = path.join(projectDir, 'scenes.json');
  const outputPath = path.join(outputDir, 'final.mp4');

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(propsPath, JSON.stringify(propsData, null, 2));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write project files', details: err.message });
  }

  const remotionDir = path.resolve(PROJECT_ROOT, 'remotion');

  // Load render settings from defaults.json — the Settings-page value is a floor raiser,
  // never a cap: a stale/conservative value saved before this machine's core count was
  // known must not throttle rendering below what the CPU-based default would allow.
  let renderDefaults = {};
  try { renderDefaults = require('../config/defaults.json').render || {}; } catch {}
  const defaultConcurrency  = Math.max(2, os.cpus().length - 1);
  const configuredConcurrency = parseInt(renderDefaults.concurrency);
  const concurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.max(configuredConcurrency, defaultConcurrency)
    : defaultConcurrency;

  // On Linux (Docker/Railway) Remotion needs the system Chromium path explicitly.
  // PUPPETEER_EXECUTABLE_PATH is set in the Dockerfile and Railway env vars.
  const chromeExecutable = process.platform === 'linux'
    ? (process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium')
    : undefined;
  const chromeFlag = chromeExecutable ? `--browser-executable ${q(chromeExecutable)}` : '';

  // --gl=angle/--gl=swiftshader : ThreeGlobe (3d_graphic / globe_markers) scenes use WebGL,
  // which intermittently fails to initialise in headless Chrome without an explicit,
  // platform-appropriate GL backend.
  // --timeout=60000            : per-frame delayRender timeout so one slow frame doesn't abort the job.
  const glFlag = process.platform === 'win32' ? '--gl=angle'
    : process.platform === 'linux' ? '--gl=swiftshader'
    : '';

  // --public-dir : redirects which folder Remotion's own bundler copies into this render's
  // bundle, instead of its default (remotion/public/). remotion/public/ is what
  // `remotion lambda sites create` bundles by default too — if local rendering also synced
  // into it, every locally-rendered project's images/audio/clips (previously ~1.6GB) would
  // get swept into the Lambda site bundle right along with it. LOCAL_ASSETS_DIR is a sibling
  // directory Lambda's site bundling never touches, so this flag is what keeps
  // resolveRenderAssetPath's sync target (LOCAL_ASSETS_DIR) actually reachable via
  // staticFile() for THIS (local CLI) render, regardless of renderTarget.
  const publicDirFlag = `--public-dir ${q(LOCAL_ASSETS_DIR)}`;

  function buildRenderCommand(attemptConcurrency) {
    return `npx remotion render src/index.jsx Documentary ${q(outputPath)} --props ${q(propsPath)} --overwrite --concurrency=${attemptConcurrency} --timeout=60000 ${glFlag} ${chromeFlag} ${publicDirFlag}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Phase 2: 'stage' is an additive field on job.progress/SSE progress events — 'uploading'
  // while syncAssetsToS3 runs (lambda mode only, and only when there's something to
  // upload), 'rendering' for the CLI progress this job object already tracked before
  // Phase 2 existed. Existing consumers reading only percent/frame/totalFrames/type are
  // unaffected; the SSE contract's core shape is unchanged.
  const initialStage = renderTarget === 'lambda' && uploadQueue.length > 0 ? 'uploading' : 'rendering';

  const job = {
    process:    null,
    progress:   { percent: 0, frame: 0, totalFrames: 0, stage: initialStage },
    status:     'rendering',
    outputPath,
    stderr:     '',
    sseClients: new Set(),
    cancelled:  false,
  };
  renderJobs.set(projectId, job);

  function handleChunk(chunk) {
    const lines = chunk.toString().split(/\r?\n/);
    lines.forEach(line => {
      if (parseProgress(line, job)) {
        job.progress.stage = 'rendering';
        broadcast(job, {
          type:        'progress',
          percent:     job.progress.percent,
          frame:       job.progress.frame,
          totalFrames: job.progress.totalFrames,
          stage:       'rendering',
        });
      }
    });
  }

  // On first failure, retry once at reduced concurrency (transient OOM/asset-fetch blips
  // often clear at lower concurrency). Only surface the SSE error after the retry also fails.
  function handleAttemptFailure(attemptConcurrency, isRetry, message) {
    if (job.cancelled) return;
    if (!isRetry) {
      const retryConcurrency = Math.max(1, Math.floor(attemptConcurrency / 2));
      const retryMsg = `Render failed, retrying once at reduced concurrency=${retryConcurrency}`;
      console.log(`[render] ${retryMsg}`);
      broadcast(job, { type: 'log', message: retryMsg });
      startAttempt(retryConcurrency, true);
    } else {
      job.status = 'error';
      broadcast(job, { type: 'error', message });
      job.sseClients.forEach(c => { try { c.end(); } catch {} });
      job.sseClients.clear();
    }
  }

  function startAttempt(attemptConcurrency, isRetry) {
    const cmd = buildRenderCommand(attemptConcurrency);
    const startMsg = isRetry
      ? `Retrying render: concurrency=${attemptConcurrency}`
      : `Render starting: concurrency=${attemptConcurrency}`;
    console.log(`[render] ${startMsg}`);
    console.log(`[render] ${cmd}`);
    broadcast(job, { type: 'log', message: startMsg });

    job.stderr = '';
    const proc = spawn(cmd, [], {
      cwd:   remotionDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env:   { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    });
    job.process = proc;

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', (chunk) => {
      job.stderr += chunk.toString();
      handleChunk(chunk);
    });

    proc.on('close', (code) => {
      if (job.cancelled) return;
      console.log(`[render] Exited with code ${code} for project ${projectId}${isRetry ? ' (retry attempt)' : ''}`);
      if (code === 0) {
        job.status = 'done';
        let fileSize = 0;
        try { fileSize = fs.statSync(outputPath).size; } catch {}
        broadcast(job, {
          type:       'done',
          outputPath: `/projects/${projectId}/output/final.mp4`,
          fileSize,
        });
        job.sseClients.forEach(c => { try { c.end(); } catch {} });
        job.sseClients.clear();
      } else {
        handleAttemptFailure(attemptConcurrency, isRetry, job.stderr || `Render process exited with code ${code}`);
      }
    });

    proc.on('error', (err) => {
      if (job.cancelled) return;
      console.error(`[render] Spawn error for ${projectId}:`, err);
      handleAttemptFailure(attemptConcurrency, isRetry, err.message);
    });
  }

  // Phase 4 — lambda mode's render step. Same job/broadcast/SSE plumbing as
  // startAttempt() above, so ExportPanel needs zero changes regardless of which target
  // actually rendered. inputProps is propsData itself: the Documentary composition
  // doesn't know or care whether it's running on Lambda or the local CLI.
  function startLambdaRender() {
    broadcast(job, { type: 'log', message: 'Starting Lambda render...' });
    renderOnLambda({
      inputProps: propsData,
      outPath:    outputPath,
      shouldContinue: () => !job.cancelled,
      onProgress: ({ percent, frame, totalFrames }) => {
        if (job.cancelled) return;
        job.progress = { percent, frame, totalFrames, stage: 'rendering' };
        broadcast(job, { type: 'progress', percent, frame, totalFrames, stage: 'rendering' });
      },
      onLog: (message) => {
        console.log(`[render] ${message}`);
        broadcast(job, { type: 'log', message });
      },
    }).then((result) => {
      if (job.cancelled || result?.cancelled) return;
      console.log(`[render] Lambda render done for project ${projectId}: ${result.outputPath} (${result.fileSize} bytes)`);
      job.status = 'done';
      broadcast(job, {
        type:       'done',
        outputPath: `/projects/${projectId}/output/final.mp4`,
        fileSize:   result.fileSize,
      });
      job.sseClients.forEach(c => { try { c.end(); } catch {} });
      job.sseClients.clear();
    }).catch((err) => {
      if (job.cancelled) return;
      const message = `Render aborted: Lambda render failed: ${err.message}`;
      console.error(`[render] ${message}`);
      job.status = 'error';
      job.stderr = message;
      broadcast(job, { type: 'error', message });
      job.sseClients.forEach(c => { try { c.end(); } catch {} });
      job.sseClients.clear();
    });
  }

  // Respond immediately — same principle as the CLI spawn below already followed
  // (fire-and-stream, never block the HTTP response on the actual work): the client is
  // free to start GET /progress/:projectId right away and see whichever stage is
  // actually happening (uploading, then rendering) via the SAME job object and SSE
  // channel, instead of the response hanging until an upload that can take a while
  // finishes.
  res.json({ started: true, projectId });

  // Local mode: always the local CLI, exactly as before Phase 2/4.
  if (renderTarget !== 'lambda') {
    startAttempt(concurrency, false);
    return;
  }

  // Lambda mode with nothing queued to upload (e.g. every referenced asset was already
  // in S3, or null/not-yet-generated) — go straight to the Lambda render, no upload step
  // needed. (Phase 2 had this case incorrectly falling through to the LOCAL CLI, since
  // Phase 4's Lambda invocation didn't exist yet at the time — fixed here.)
  if (uploadQueue.length === 0) {
    startLambdaRender();
    return;
  }

  // Lambda mode with assets to upload — sync to S3 first, awaited, before the Lambda
  // render is allowed to start. On any upload failure, abort exactly like the
  // missingAssets/httpOffenders checks above: mark the job errored, broadcast SSE
  // { type: 'error' } naming every failed asset, never invoke Lambda.
  broadcast(job, { type: 'log', message: `Uploading ${uploadQueue.length} asset(s) to S3...` });
  syncAssetsToS3(uploadQueue, {
    onProgress: (completed, total) => {
      const percent = Math.round((completed / total) * 100);
      job.progress = { percent, frame: 0, totalFrames: 0, stage: 'uploading' };
      broadcast(job, { type: 'progress', percent, frame: 0, totalFrames: 0, stage: 'uploading' });
    },
    onRetry: (asset, attempt, maxAttempts, errorMessage) => {
      const message = `Retrying upload: ${asset.key} (attempt ${attempt}/${maxAttempts}) after: ${errorMessage}`;
      console.warn(`[render] ${message}`);
      broadcast(job, { type: 'log', message });
    },
  }).then(({ failures, uploadedCount, skippedCount }) => {
    if (job.cancelled) return;

    if (failures.length > 0) {
      const message = `Render aborted: failed to upload asset(s) to S3: ${
        failures.map(f => `${f.key}${f.sceneId ? ` (scene ${f.sceneId})` : ''}: ${f.error}`).join('; ')
      }`;
      console.error(`[render] ${message}`);
      job.status = 'error';
      job.stderr = message;
      broadcast(job, { type: 'error', message });
      job.sseClients.forEach(c => { try { c.end(); } catch {} });
      job.sseClients.clear();
      return;
    }

    console.log(`[render] S3 upload complete: ${uploadedCount} uploaded, ${skippedCount} already present — starting render`);
    broadcast(job, { type: 'log', message: 'S3 upload complete — starting render.' });
    job.progress = { percent: 0, frame: 0, totalFrames: 0, stage: 'rendering' };
    startLambdaRender();
  }).catch(err => {
    if (job.cancelled) return;
    const message = `Render aborted: S3 upload failed: ${err.message}`;
    console.error(`[render] ${message}`);
    job.status = 'error';
    job.stderr = message;
    broadcast(job, { type: 'error', message });
    job.sseClients.forEach(c => { try { c.end(); } catch {} });
    job.sseClients.clear();
  });
});

// ── GET /progress/:projectId — SSE stream ─────────────────────────────────────
router.get('/progress/:projectId', (req, res) => {
  const { projectId } = req.params;
  const job = renderJobs.get(projectId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  if (!job) {
    sendSSE(res, { type: 'error', message: 'No active render job — server may have restarted' });
    res.end();
    return;
  }

  if (job.status === 'done') {
    sendSSE(res, { type: 'done', outputPath: `/projects/${projectId}/output/final.mp4` });
    res.end();
    return;
  }

  if (job.status === 'error') {
    sendSSE(res, { type: 'error', message: job.stderr || 'Render failed' });
    res.end();
    return;
  }

  sendSSE(res, {
    type:        'progress',
    percent:     job.progress.percent,
    frame:       job.progress.frame,
    totalFrames: job.progress.totalFrames,
    stage:       job.progress.stage,
  });

  job.sseClients.add(res);
  req.on('close', () => job.sseClients.delete(res));
});

// ── DELETE /:projectId — cancel render ────────────────────────────────────────
router.delete('/:projectId', (req, res) => {
  const { projectId } = req.params;
  const job = renderJobs.get(projectId);

  // A local-mode job has a real child process to kill. A Lambda-mode job never sets
  // job.process (there's no local process — see lambdaRender.js's comment on why no
  // "cancel a running Lambda invocation" API exists), so it's recognized as cancellable
  // by job.status === 'rendering' instead; setting job.cancelled here is what makes
  // startLambdaRender()'s poll loop (checked once per ~3s tick via shouldContinue) stop
  // on its next iteration and never download/report a result.
  if (job?.process || job?.status === 'rendering') {
    job.cancelled = true;
    if (job.process) { try { job.process.kill(); } catch {} }
    job.status = 'cancelled';
    job.sseClients.forEach(c => { try { c.end(); } catch {} });
    job.sseClients.clear();
    renderJobs.delete(projectId);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'No active render job found' });
  }
});

module.exports = router;
