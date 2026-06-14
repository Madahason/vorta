const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const clipStore = require('./clipStore');

const CLIPS_DIR = path.resolve(__dirname, '../../library/clips');
const REMOTION_CLIPS_DIR = path.resolve(__dirname, '../../remotion/public/clips');

[CLIPS_DIR, REMOTION_CLIPS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─────────────────────────────────────────
// PEXELS API
// ─────────────────────────────────────────

async function searchPexels(query, perPage = 10) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || key === 'your_pexels_api_key_here') throw new Error('PEXELS_API_KEY not set');

  return new Promise((resolve) => {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&size=medium`;
    https.get(url, {
      headers: {
        'Authorization': key,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.videos) {
            console.warn('[pexels] unexpected response:', data.slice(0, 200));
            resolve([]);
            return;
          }
          const results = parsed.videos.map(v => {
            const files = v.video_files || [];
            const hd = files.find(f => f.quality === 'hd' && f.width >= 1280) ||
                       files.find(f => f.quality === 'sd') ||
                       files[0];
            return {
              id: `pexels_${v.id}`,
              title: v.url.split('/').slice(-2, -1)[0].replace(/-/g, ' '),
              duration: v.duration,
              width: hd?.width || 1280,
              height: hd?.height || 720,
              downloadUrl: hd?.link,
              thumbnailUrl: v.image,
              source: 'pexels',
              license: 'free_commercial',
              pexelsUrl: v.url
            };
          }).filter(v => v.downloadUrl && v.duration >= 3);

          console.log(`[pexels] "${query}" → ${results.length} results`);
          resolve(results);
        } catch (e) {
          console.warn('[pexels] parse error:', e.message);
          resolve([]);
        }
      });
    }).on('error', err => {
      console.warn('[pexels] request error:', err.message);
      resolve([]);
    });
  });
}

// ─────────────────────────────────────────
// PIXABAY API
// ─────────────────────────────────────────

async function searchPixabay(query, perPage = 10) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key || key === 'your_pixabay_api_key_here') throw new Error('PIXABAY_API_KEY not set');

  return new Promise((resolve) => {
    const params = new URLSearchParams({
      key,
      q: query,
      video_type: 'film',
      per_page: perPage.toString(),
      safesearch: 'true',
      order: 'popular'
    });

    const url = `https://pixabay.com/api/videos/?${params.toString()}`;
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (!data.startsWith('{')) {
            console.warn('[pixabay] non-JSON response:', data.slice(0, 100));
            resolve([]);
            return;
          }
          const parsed = JSON.parse(data);
          const results = (parsed.hits || []).map(v => {
            const videos = v.videos || {};
            const file = videos.large || videos.medium || videos.small || videos.tiny;
            return {
              id: `pixabay_${v.id}`,
              title: v.tags,
              duration: v.duration,
              width: file?.width || 1280,
              height: file?.height || 720,
              downloadUrl: file?.url,
              thumbnailUrl: v.picture_id
                ? `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg`
                : null,
              source: 'pixabay',
              license: 'free_commercial',
              pixabayUrl: v.pageURL
            };
          }).filter(v => v.downloadUrl && v.duration >= 3);

          console.log(`[pixabay] "${query}" → ${results.length} results`);
          resolve(results);
        } catch (e) {
          console.warn('[pixabay] parse error:', e.message);
          resolve([]);
        }
      });
    }).on('error', err => {
      console.warn('[pixabay] request error:', err.message);
      resolve([]);
    });
  });
}

// ─────────────────────────────────────────
// RELEVANCE SCORING
// ─────────────────────────────────────────

function scoreStockResult(result, subjectAnchors, query) {
  let score = 0;
  const titleLower = (result.title || '').toLowerCase();
  const queryLower = query.toLowerCase();

  const queryWords = queryLower.split(' ').filter(w => w.length > 3);
  queryWords.forEach(word => {
    if (titleLower.includes(word)) score += 2;
  });

  (subjectAnchors || []).forEach(anchor => {
    const words = anchor.toLowerCase().split(' ').filter(w => w.length > 3);
    words.forEach(w => { if (titleLower.includes(w)) score += 3; });
  });

  if (result.width >= 1920) score += 2;
  else if (result.width >= 1280) score += 1;

  if (result.source === 'pexels') score += 1;

  if (result.duration >= 10) score += 1;
  if (result.duration >= 20) score += 1;

  return score;
}

// ─────────────────────────────────────────
// DOWNLOAD
// ─────────────────────────────────────────

async function downloadStockClip(result, filename) {
  const outputPath = path.join(CLIPS_DIR, filename);
  const remotionPath = path.join(REMOTION_CLIPS_DIR, filename);

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 50000) {
    if (!fs.existsSync(remotionPath)) fs.copyFileSync(outputPath, remotionPath);
    console.log(`[stock] already cached: ${filename}`);
    return outputPath;
  }

  const url = result.downloadUrl;
  console.log(`[stock] downloading: ${url.slice(0, 80)}...`);

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    const request = (urlStr) => {
      const mod = urlStr.startsWith('https') ? https : http;
      mod.get(urlStr, { headers: { 'User-Agent': 'DevMarketingFlow/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(outputPath, () => {});
          reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (err) => { fs.unlink(outputPath, () => {}); reject(err); });
      }).on('error', (err) => {
        file.close();
        fs.unlink(outputPath, () => {});
        reject(err);
      });
    };

    request(url);
  });

  const stats = fs.statSync(outputPath);
  if (stats.size < 50000) {
    fs.unlinkSync(outputPath);
    throw new Error(`Downloaded file too small: ${stats.size} bytes`);
  }

  console.log(`[stock] downloaded: ${filename} (${Math.round(stats.size / 1024)}KB)`);
  fs.copyFileSync(outputPath, remotionPath);
  console.log(`[stock] synced to remotion: ${filename}`);

  return outputPath;
}

// ─────────────────────────────────────────
// CLAUDE QUERY GENERATION
// ─────────────────────────────────────────

async function generateStockQuery(scene) {
  try {
    const { callClaude } = require('./claude');

    const prompt = `You are selecting stock footage for a documentary scene.

Scene excerpt: "${scene.script_excerpt}"
Subject anchors: ${JSON.stringify(scene.subject_anchors || [])}
Mood: ${scene.mood}
Category: ${scene.category || 'general'}

Generate the BEST search query to find relevant stock footage for this scene.

Rules:
1. Stock footage libraries have B-roll of locations, people in action, business settings, nature, cities, technology
2. Do NOT search for specific named people — stock libraries won't have them
3. DO search for settings, actions, and environments that match the scene
4. Keep query to 2-4 words maximum for best results

Examples:
"Apple iPhone launch 2007" → query: "technology presentation audience"
"Wall Street financial crisis" → query: "stock market trading"
"Netflix headquarters" → query: "modern office building"
"Steve Jobs walking" → query: "businessman walking office"
"Global pandemic 2020" → query: "empty city streets"

Return ONLY the search query — 2-4 words, nothing else.`;

    const response = await callClaude(prompt,
      'Return only the stock footage search query. 2-4 words maximum. Nothing else.');
    const query = response.trim().replace(/['"]/g, '').slice(0, 50);
    console.log(`[stock] Claude query for scene ${scene.scene_id}: "${query}"`);
    return query;
  } catch (err) {
    console.warn('[stock] Claude query failed, using subject anchors:', err.message);
    return (scene.subject_anchors || []).slice(0, 2).join(' ') ||
           (scene.clip_search_tags || []).slice(0, 2).join(' ') ||
           scene.mood;
  }
}

// ─────────────────────────────────────────
// MAIN: SOURCE STOCK CLIP FOR ONE SCENE
// ─────────────────────────────────────────

async function sourceStockClip(scene, projectId) {
  console.log(`\n[stock] sourcing clip for scene ${scene.scene_id}: "${scene.script_excerpt?.slice(0, 60)}"`);

  const query = await generateStockQuery(scene);

  const [pexelsSettled, pixabaySettled] = await Promise.allSettled([
    searchPexels(query, 10),
    searchPixabay(query, 10)
  ]);

  const allResults = [
    ...(pexelsSettled.status === 'fulfilled' ? pexelsSettled.value : []),
    ...(pixabaySettled.status === 'fulfilled' ? pixabaySettled.value : [])
  ];

  if (allResults.length === 0) {
    console.warn(`[stock] no results for query: "${query}"`);
    return null;
  }

  const scored = allResults
    .map(r => ({ ...r, score: scoreStockResult(r, scene.subject_anchors, query) }))
    .sort((a, b) => b.score - a.score);

  console.log(`[stock] top results:`);
  scored.slice(0, 3).forEach((r, i) =>
    console.log(`  ${i+1}. [${r.score}] "${r.title?.slice(0, 40)}" ${r.duration}s ${r.width}x${r.height} (${r.source})`)
  );

  for (const result of scored.slice(0, 3)) {
    try {
      const safeTitle = (result.title || 'clip')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .slice(0, 30)
        .toLowerCase();
      const filename = `${result.id}_${safeTitle}.mp4`;

      await downloadStockClip(result, filename);

      const clip = addToClipIndex({
        file: `/library/clips/${filename}`,
        title: result.title,
        source: result.source,
        license: result.license,
        sourceUrl: result.pexelsUrl || result.pixabayUrl,
        duration: result.duration,
        width: result.width,
        height: result.height,
        tags: [
          ...(scene.subject_anchors || []).map(a => a.toLowerCase()),
          ...(scene.clip_search_tags || [])
        ],
        mood: scene.mood || 'neutral',
        category: scene.category || 'general',
        query,
        projectId
      });

      console.log(`[stock] ✓ clip ready for scene ${scene.scene_id}: ${filename}`);
      return clip;

    } catch (err) {
      console.warn(`[stock] download failed, trying next:`, err.message);
    }
  }

  console.warn(`[stock] all downloads failed for scene ${scene.scene_id}`);
  return null;
}

// ─────────────────────────────────────────
// SOURCE ALL STOCK CLIPS FOR A PROJECT
// ─────────────────────────────────────────

async function sourceAllStockClips(scenes, projectId, onProgress = null) {
  const footageScenes = scenes.filter(s => s.shot_type === 'real_footage');

  if (footageScenes.length === 0) {
    console.log('[stock] no real_footage scenes to source');
    return { selectedClips: {}, fallbackToImage: [] };
  }

  console.log(`[stock] sourcing ${footageScenes.length} stock clips...`);
  const selectedClips = {};
  const fallbackToImage = [];

  for (const scene of footageScenes) {
    if (onProgress) onProgress({ type: 'sourcing', scene_id: scene.scene_id, message: 'Searching Pexels + Pixabay...' });

    try {
      const clip = await sourceStockClip(scene, projectId);
      if (clip) {
        selectedClips[scene.scene_id] = clip;
        if (onProgress) onProgress({ type: 'done', scene_id: scene.scene_id, clip, title: clip.title, source: clip.source });
      } else {
        fallbackToImage.push(scene.scene_id);
        if (onProgress) onProgress({ type: 'fallback', scene_id: scene.scene_id, message: 'No stock clip found — using Higgsfield image' });
      }
    } catch (err) {
      console.warn(`[stock] scene ${scene.scene_id} failed:`, err.message);
      fallbackToImage.push(scene.scene_id);
      if (onProgress) onProgress({ type: 'fallback', scene_id: scene.scene_id, message: err.message });
    }
  }

  console.log(`[stock] complete: ${Object.keys(selectedClips).length} clips, ${fallbackToImage.length} fallbacks`);
  return { selectedClips, fallbackToImage };
}

// ─────────────────────────────────────────
// CLIP LIBRARY INDEX
// ─────────────────────────────────────────

function addToClipIndex(clipData) {
  // Check if already indexed by file path
  const existing = clipStore.loadClips().find(c => c.file === clipData.file);
  if (existing) return existing;

  return clipStore.addClip({
    clip_id: crypto.randomUUID(),
    file: clipData.file,
    title: clipData.title,
    source: clipData.source,
    license: clipData.license,
    source_url: clipData.sourceUrl,
    tags: clipData.tags || [],
    mood: clipData.mood || 'neutral',
    category: clipData.category || 'general',
    duration: clipData.duration,
    description: `Stock footage: ${clipData.query}`,
    warning: null,
    added_at: new Date().toISOString(),
    project_id: clipData.projectId || null,
  });
}

module.exports = {
  searchPexels,
  searchPixabay,
  downloadStockClip,
  sourceStockClip,
  sourceAllStockClips,
  generateStockQuery
};
