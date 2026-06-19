const sharp = require('sharp');

// Font stack — system fonts only, no bundled font files.
// Swap for a bundled @font-face if a custom font is added later.
const FONT_FAMILY = '"Arial Black", "Helvetica Neue", Impact, sans-serif';

// Bottom-right safe zone (YouTube duration badge): ~15% width, ~12% height
const SAFE_ZONE_W_RATIO = 0.15;
const SAFE_ZONE_H_RATIO = 0.12;

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && (current + ' ' + word).length > maxCharsPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Clamp {x, y} so the text bounding box does not intersect the bottom-right
 * exclusion zone. Position is the CENTER of the text block (normalized 0–1).
 */
function clampPosition(x, y, textW, textH, imgW, imgH) {
  const safeX = imgW * (1 - SAFE_ZONE_W_RATIO);
  const safeY = imgH * (1 - SAFE_ZONE_H_RATIO);

  const halfW = textW / 2;
  const halfH = textH / 2;

  const textRight = x * imgW + halfW;
  const textBottom = y * imgH + halfH;

  let cx = x;
  let cy = y;

  if (textRight > safeX && textBottom > safeY) {
    const pushLeft = (textRight - safeX) / imgW;
    const pushUp = (textBottom - safeY) / imgH;
    if (pushLeft < pushUp) {
      cx = Math.max(0, cx - pushLeft - 0.01);
    } else {
      cy = Math.max(0, cy - pushUp - 0.01);
    }
  }

  const margin = 0.02;
  cx = Math.max(margin, Math.min(1 - margin, cx));
  cy = Math.max(margin, Math.min(1 - margin, cy));

  return { x: cx, y: cy };
}

/**
 * Compose text overlay onto a base thumbnail image using SVG-to-raster compositing.
 *
 * @param {object} opts
 * @param {string} opts.basePath       - Absolute path to the base JPEG
 * @param {string} opts.text           - Overlay text (max 3-4 words recommended)
 * @param {number} [opts.x]            - Normalized 0-1 horizontal center of text (default: 0.5)
 * @param {number} [opts.y]            - Normalized 0-1 vertical center of text (default: 0.5)
 * @param {number} [opts.fontSize]     - Font size in px (auto-scaled from image height if omitted)
 * @param {string} [opts.color]        - Text fill color (default: '#FFFFFF')
 * @param {string} [opts.strokeColor]  - Stroke/outline color (default: '#000000')
 * @param {number} [opts.strokeWidth]  - Stroke width in px (default: auto-scaled)
 * @param {number} [opts.fontWeight]   - CSS font-weight (default: 800)
 * @param {string} opts.outputPath     - Where to save the composited output
 * @returns {Promise<{outputPath: string, x: number, y: number}>}
 */
async function composeThumbnail({
  basePath,
  text,
  x = 0.5,
  y = 0.5,
  fontSize,
  color = '#FFFFFF',
  strokeColor = '#000000',
  strokeWidth,
  fontWeight = 800,
  outputPath,
}) {
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount > 4) {
    console.warn(`[thumbnailComposer] text has ${wordCount} words (recommended max: 4): "${text}"`);
  }

  const metadata = await sharp(basePath).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const computedFontSize = fontSize || Math.round(imgH * 0.10);
  const computedStrokeWidth = strokeWidth !== undefined ? strokeWidth : Math.max(2, Math.round(computedFontSize * 0.06));
  const lineHeight = computedFontSize * 1.15;

  const maxCharsPerLine = Math.max(6, Math.round(20 * (720 / imgH)));
  const lines = wrapText(text.trim(), maxCharsPerLine);

  const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
  const approxTextW = longestLine.length * computedFontSize * 0.55;
  const textBlockH = lines.length * lineHeight;

  const clamped = clampPosition(x, y, approxTextW, textBlockH, imgW, imgH);

  const centerPxX = clamped.x * imgW;
  const centerPxY = clamped.y * imgH;
  const topY = centerPxY - textBlockH / 2 + computedFontSize * 0.85;

  const shadowOffset = Math.max(2, Math.round(computedFontSize * 0.04));

  const textLines = lines.map((line, i) => {
    const ly = topY + i * lineHeight;
    const escaped = escapeXml(line);
    return `
      <text x="${centerPxX}" y="${ly}" font-family="${FONT_FAMILY}" font-size="${computedFontSize}" font-weight="${fontWeight}" fill="${strokeColor}" text-anchor="middle" opacity="0.5"
        dx="${shadowOffset}" dy="${shadowOffset}">${escaped}</text>
      <text x="${centerPxX}" y="${ly}" font-family="${FONT_FAMILY}" font-size="${computedFontSize}" font-weight="${fontWeight}" fill="none" stroke="${strokeColor}" stroke-width="${computedStrokeWidth * 2}" stroke-linejoin="round" text-anchor="middle">${escaped}</text>
      <text x="${centerPxX}" y="${ly}" font-family="${FONT_FAMILY}" font-size="${computedFontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="middle">${escaped}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
${textLines}
</svg>`;

  const svgBuffer = Buffer.from(svg);

  await sharp(basePath)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return { outputPath, x: clamped.x, y: clamped.y };
}

module.exports = { composeThumbnail, SAFE_ZONE_W_RATIO, SAFE_ZONE_H_RATIO };
