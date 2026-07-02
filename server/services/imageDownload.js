const fs    = require('fs');
const https = require('https');
const http  = require('http');

// Streams a URL to a local file, following up to 5 redirects. Shared by
// server/routes/generate.js (bulk generation) and server/routes/higgsfieldRegenerate.js
// (Fine-Tune single-scene regenerate) — kept in one place so both call the same code.
function downloadImage(url, dest, hops = 0) {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadImage(res.headers.location, dest, hops + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Image download failed: HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', reject);
  });
}

module.exports = { downloadImage };
