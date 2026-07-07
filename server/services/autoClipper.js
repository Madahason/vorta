// ============================================================
// YOUTUBE CLIP SYSTEM — DISABLED
// Replaced by stock footage library (Pexels + Pixabay)
// See: server/services/stockFootage.js
// ============================================================

/*
const path     = require('path');
const fs       = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { buildClipStrategy } = require('./clipIntelligence');
const { callClaude } = require('./claude');
const clipStore = require('./clipStore');

const LIBRARY_CLIPS_DIR  = path.resolve(__dirname, '../../library/clips');
const REMOTION_CLIPS_DIR = path.resolve(__dirname, '../../remotion/localAssets/clips');

[LIBRARY_CLIPS_DIR, REMOTION_CLIPS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function searchYouTube(query, options = {}) {
  const { channelFilter, avoidTerms = [], minDuration = 60, maxResults = 8 } = options;

  const cmd = [
    `yt-dlp`,
    `"ytsearch${maxResults}:${query}"`,
    `--print "%(id)s|||%(title)s|||%(duration)s|||%(webpage_url)s|||%(channel)s"`,
    `--no-download`,
    `--flat-playlist`,
  ].join(' ');

  try {
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    const results = stdout.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const [id, title, duration, url, channel] = line.split('|||');
        return {
          id,
          title:    title || '',
          duration: parseInt(duration) || 0,
          url:      url || `https://www.youtube.com/watch?v=${id}`,
          channel:  channel || '',
          source:   'youtube_fair_use',
          license:  'fair_use',
        };
      })
      .filter(r => r.duration >= minDuration)
      .filter(r => {
        const tl = r.title.toLowerCase();
        return !avoidTerms.some(t => tl.includes(t.toLowerCase()));
      });

    if (channelFilter) {
      const channelResults = results.filter(r =>
        r.channel.toLowerCase().includes(channelFilter.toLowerCase())
      );
      return channelResults.length > 0 ? channelResults : results;
    }
    return results;
  } catch (err) {
    console.warn('[autoClipper] YouTube search failed:', err.message);
    return [];
  }
}

async function searchArchive(query, options = {}) {
  const { avoidTerms = [] } = options;
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://archive.org/advancedsearch.php?q=${encodedQuery}+mediatype:movies&fl[]=identifier,title,description,duration&rows=5&output=json`;

    const https = require('https');
    const data  = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'Vorta/1.0' } }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve({ response: { docs: [] } }); }
        });
      }).on('error', reject);
    });

    return (data.response?.docs || [])
      .filter(doc => {
        const tl = (doc.title || '').toLowerCase();
        return !avoidTerms.some(t => tl.includes(t.toLowerCase()));
      })
      .map(doc => ({
        id:       doc.identifier,
        title:    doc.title || doc.identifier,
        duration: parseInt(doc.duration) || 300,
        url:      `https://archive.org/details/${doc.identifier}`,
        channel:  'Internet Archive',
        source:   'internet_archive',
        license:  'public_domain',
      }));
  } catch (err) {
    console.warn('[autoClipper] Archive search failed:', err.message);
    return [];
  }
}

function scoreResult(result, subjectAnchors, strategy) {
  const titleLower   = result.title.toLowerCase();
  const channelLower = result.channel.toLowerCase();

  const subjectMatch = (subjectAnchors || []).some(anchor => {
    const words = anchor.toLowerCase().split(' ').filter(w => w.length > 3);
    return words.some(w => titleLower.includes(w) || channelLower.includes(w));
  });

  if (!subjectMatch) {
    console.log(`[scorer] REJECTED (no subject match): "${result.title}" | anchors: ${subjectAnchors?.join(', ')}`);
    return -999;
  }

  let score = 0;

  for (const anchor of (subjectAnchors || [])) {
    const a = anchor.toLowerCase();
    if (titleLower.includes(a))   score += 5;
    if (channelLower.includes(a)) score += 3;
  }

  for (const anchor of (subjectAnchors || [])) {
    const words = anchor.toLowerCase().split(' ').filter(w => w.length > 3);
    for (const word of words) {
      if (titleLower.includes(word))   score += 1;
      if (channelLower.includes(word)) score += 1;
    }
  }

  if (result.license === 'public_domain')    score += 2;
  if (result.license === 'creative_commons') score += 1;

  const authSources = ['ted', 'c-span', 'cspan', 'bloomberg',
    'reuters', 'bbc', 'pbs', 'cnbc', 'official'];
  if (authSources.some(s => channelLower.includes(s))) score += 3;

  const qualityTerms = ['keynote', 'speech', 'interview', 'conference',
    'testimony', 'announcement', 'earnings', 'hearing', 'talk'];
  if (qualityTerms.some(t => titleLower.includes(t))) score += 2;

  const lowQuality = ['top 10', 'reaction', 'compilation', '#shorts',
    'tiktok', 'meme', 'funny', 'fail', 'secret'];
  if (lowQuality.some(t => titleLower.includes(t))) score -= 3;

  return score;
}

async function isRelevantClip(result, scene) {
  const titleLower = result.title.toLowerCase();
  const anchors    = (scene.subject_anchors || []).map(a => a.toLowerCase());

  const hasAnchorInTitle = anchors.some(anchor => {
    const words = anchor.split(' ').filter(w => w.length > 3);
    return words.some(w => titleLower.includes(w));
  });

  if (!hasAnchorInTitle) {
    console.log(`[relevance] REJECTED: "${result.title}" — no anchor in title`);
    return false;
  }

  if (result.score >= 6) {
    console.log(`[relevance] ACCEPTED (score ${result.score}): "${result.title}"`);
    return true;
  }

  try {
    const prompt = `Is this YouTube video relevant to the documentary scene?

Scene subject: ${scene.subject_anchors?.join(', ')}
Scene excerpt: "${scene.script_excerpt?.slice(0, 100)}"
Video title: "${result.title}"
Channel: "${result.channel}"

Reply with only: YES or NO`;

    const response = await callClaude(prompt, 'Reply only YES or NO.');
    const relevant = response.trim().toUpperCase().startsWith('YES');
    console.log(`[relevance] Claude says ${relevant ? 'YES' : 'NO'}: "${result.title}"`);
    return relevant;
  } catch {
    return result.score > 2;
  }
}

async function findBestTimestamp(strategy, videoDuration) {
  const hinted   = strategy.timestamp_hint?.start_seconds || 30;
  const maxStart = Math.max(videoDuration - 30, 0);
  const safe     = Math.min(hinted, maxStart);
  console.log(`[autoClipper] using timestamp: ${safe}s (hint: ${hinted}s, duration: ${videoDuration}s)`);
  return safe;
}

async function downloadIntelligentClip({ result, strategy, scene, filename }) {
  const outputPath   = path.join(LIBRARY_CLIPS_DIR,  filename);
  const remotionPath = path.join(REMOTION_CLIPS_DIR, filename);

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
    if (!fs.existsSync(remotionPath)) fs.copyFileSync(outputPath, remotionPath);
    return outputPath;
  }

  const startTime = await findBestTimestamp(strategy, result.duration);
  const endTime   = startTime + 8;

  const tempPath = path.join(LIBRARY_CLIPS_DIR, `_temp_${Date.now()}.mp4`);

  try {
    const dlCmd = [
      'yt-dlp',
      `"${result.url}"`,
      `--download-sections "*${startTime}-${endTime}"`,
      '--force-keyframes-at-cuts',
      `-o "${tempPath}"`,
      '--format "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]"',
      '--merge-output-format mp4',
      '--no-playlist',
      '--quiet',
    ].join(' ');

    await execAsync(dlCmd, { timeout: 120000 });

    const tempFiles = fs.readdirSync(LIBRARY_CLIPS_DIR)
      .filter(f => f.startsWith('_temp_') && !f.endsWith('.part'));

    if (tempFiles.length === 0) throw new Error('yt-dlp produced no output file');

    const downloaded = path.join(LIBRARY_CLIPS_DIR, tempFiles[0]);

    const trimCmd = `ffmpeg -i "${downloaded}" -t 8 -c:v libx264 -preset fast -crf 22 -c:a aac -y "${outputPath}" -loglevel quiet`;
    await execAsync(trimCmd, { timeout: 60000 });

    try { fs.unlinkSync(downloaded); } catch {}

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 50000) {
      throw new Error('Output file missing or too small after trim');
    }

    fs.copyFileSync(outputPath, remotionPath);
    console.log(`[autoClipper] ✓ downloaded: ${filename} (${Math.round(fs.statSync(outputPath).size / 1024)}KB)`);

    return outputPath;
  } catch (err) {
    [tempPath, outputPath].forEach(p => {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    });
    fs.readdirSync(LIBRARY_CLIPS_DIR)
      .filter(f => f.startsWith('_temp_'))
      .forEach(f => { try { fs.unlinkSync(path.join(LIBRARY_CLIPS_DIR, f)); } catch {} });
    throw err;
  }
}

async function autoSourceClip(scene, projectId, onProgress = null) {
  const send = (data) => { if (onProgress) onProgress(data); };

  send({ type: 'analyzing', scene_id: scene.scene_id, message: 'Claude identifying best sources...' });

  const strategy = await buildClipStrategy(scene);

  send({
    type:       'searching',
    scene_id:   scene.scene_id,
    message:    `Searching for: ${strategy.subject}`,
    strategy:   strategy.strategy,
    confidence: strategy.confidence,
  });

  const searchOptions = {
    avoidTerms:  strategy.avoid_terms       || [],
    minDuration: strategy.min_video_duration || 60,
    maxResults:  8,
  };

  let allResults = [];

  for (const pq of (strategy.primary_queries || [])) {
    const results = await searchYouTube(pq.query, {
      ...searchOptions,
      channelFilter: pq.channel_filter,
    });
    allResults.push(...results);
    if (allResults.length >= 3) break;
  }

  if (allResults.length < 2) {
    const archiveResults = await searchArchive(
      strategy.primary_queries?.[0]?.query || strategy.fallback_query,
      searchOptions
    );
    allResults.push(...archiveResults);
  }

  if (allResults.length === 0 && strategy.fallback_query) {
    send({ type: 'fallback_search', scene_id: scene.scene_id, message: 'Trying general search...' });
    allResults.push(...await searchYouTube(strategy.fallback_query, searchOptions));
  }

  const scored = allResults
    .map(r => ({ ...r, score: scoreResult(r, scene.subject_anchors, strategy) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    send({ type: 'no_results', scene_id: scene.scene_id, message: 'No relevant footage found — converting to AI image' });
    return null;
  }

  const relevantResults = [];
  for (const result of scored.slice(0, 5)) {
    const relevant = await isRelevantClip(result, scene);
    if (relevant) relevantResults.push(result);
    if (relevantResults.length >= 2) break;
  }

  if (relevantResults.length === 0) {
    send({ type: 'no_results', scene_id: scene.scene_id, message: 'No relevant clips passed relevance check — converting to AI image' });
    return null;
  }

  const best = relevantResults[0];
  send({
    type:     'downloading',
    scene_id: scene.scene_id,
    message:  `Downloading: "${best.title?.slice(0, 50)}" (score: ${best.score})`,
    source:   best.source,
    channel:  best.channel,
  });

  const safeTitle = (best.title || 'clip')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 35)
    .toLowerCase();
  const filename = `scene_${scene.scene_id}_${safeTitle}_${Date.now()}.mp4`;

  const tryDownload = async (result, fname) => {
    await downloadIntelligentClip({ result, strategy, scene, filename: fname });

    return clipStore.addClip({
      file:       `/library/clips/${fname}`,
      title:      result.title,
      source:     result.source,
      license:    result.license,
      source_url: result.url,
      tags: [
        ...(scene.subject_anchors  || []).map(a => a.toLowerCase()),
        ...(scene.clip_search_tags || []),
      ],
      mood:        scene.mood     || 'neutral',
      category:    scene.category || 'general',
      duration:    8,
      description: `${strategy.subject} — ${result.title?.slice(0, 60)}`,
      warning:     result.license === 'fair_use'
        ? 'Copyrighted — fair use for documentary commentary only. 8 seconds max.'
        : null,
      project_id: projectId || null,
    });
  };

  try {
    const clip = await tryDownload(best, filename);
    send({ type: 'done', scene_id: scene.scene_id, clip, title: best.title, source: best.source, score: best.score });
    return clip;
  } catch (err) {
    console.warn(`[autoClipper] download failed for scene ${scene.scene_id}:`, err.message);

    if (relevantResults.length > 1) {
      send({ type: 'retry', scene_id: scene.scene_id, message: `Trying next result: ${relevantResults[1].title?.slice(0, 40)}` });
      try {
        const fname2 = `scene_${scene.scene_id}_${(relevantResults[1].title || 'clip').replace(/[^a-z0-9]/gi, '_').slice(0, 30).toLowerCase()}_${Date.now()}.mp4`;
        const clip = await tryDownload(relevantResults[1], fname2);
        send({ type: 'done', scene_id: scene.scene_id, clip, title: relevantResults[1].title, source: relevantResults[1].source });
        return clip;
      } catch (err2) {
        console.warn('[autoClipper] retry also failed:', err2.message);
      }
    }

    send({ type: 'failed', scene_id: scene.scene_id, message: 'All download attempts failed — converting to image' });
    return null;
  }
}

async function autoSourceAllClips(scenes, projectId, onProgress = null) {
  const realFootageScenes = scenes.filter(s => s.shot_type === 'real_footage');

  if (realFootageScenes.length === 0) {
    console.log('[autoClipper] no real_footage scenes');
    return { selectedClips: {}, convertToImage: [] };
  }

  console.log(`[autoClipper] sourcing ${realFootageScenes.length} clips with intelligent search...`);

  const selectedClips  = {};
  const convertToImage = [];

  for (const scene of realFootageScenes) {
    try {
      const clip = await autoSourceClip(scene, projectId, onProgress);
      if (clip) {
        selectedClips[scene.scene_id] = clip;
      } else {
        convertToImage.push(scene.scene_id);
      }
    } catch (err) {
      console.warn(`[autoClipper] scene ${scene.scene_id} failed:`, err.message);
      convertToImage.push(scene.scene_id);
    }
  }

  console.log(`[autoClipper] complete: ${Object.keys(selectedClips).length} clips, ${convertToImage.length} converting to image`);
  return { selectedClips, convertToImage };
}

module.exports = { autoSourceAllClips, autoSourceClip };
*/

module.exports = {};
