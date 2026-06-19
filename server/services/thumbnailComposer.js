const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

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
 * Compose text overlay onto a base thumbnail image using SVG-to-raster compositing.
 *
 * @param {object} opts
 * @param {string} opts.basePath       - Absolute path to the base JPEG
 * @param {string} opts.text           - Overlay text (max 3-4 words recommended)
 * @param {string} [opts.position]     - 'left' | 'right' | 'top' | 'bottom' (default: 'left')
 * @param {number} [opts.fontSize]     - Font size in px (auto-scaled from image height if omitted)
 * @param {string} [opts.color]        - Text fill color (default: '#FFFFFF')
 * @param {string} [opts.strokeColor]  - Stroke/outline color (default: '#000000')
 * @param {number} [opts.strokeWidth]  - Stroke width in px (default: auto-scaled)
 * @param {number} [opts.fontWeight]   - CSS font-weight (default: 800)
 * @param {string} opts.outputPath     - Where to save the composited output
 * @returns {Promise<string>} The outputPath on success
 */
async function composeThumbnail({
  basePath,
  text,
  position = 'left',
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

  const safeZoneW = Math.round(imgW * SAFE_ZONE_W_RATIO);
  const safeZoneH = Math.round(imgH * SAFE_ZONE_H_RATIO);

  const padding = Math.round(imgW * 0.04);
  const textBlockH = lines.length * lineHeight;

  let textX, textY, anchor;

  switch (position) {
    case 'right':
      textX = imgW - padding - safeZoneW;
      textY = Math.round(imgH * 0.35);
      anchor = 'end';
      break;
    case 'top':
      textX = padding;
      textY = padding + computedFontSize;
      anchor = 'start';
      break;
    case 'bottom':
      textY = imgH - safeZoneH - textBlockH - padding;
      textX = padding;
      anchor = 'start';
      break;
    case 'left':
    default:
      textX = padding;
      textY = Math.round(imgH * 0.35);
      anchor = 'start';
      break;
  }

  if (position === 'bottom' && textX + (maxCharsPerLine * computedFontSize * 0.55) > imgW - safeZoneW) {
    // nothing needed — text wrapping + left-align already keeps it left of the safe zone
  }

  const shadowOffset = Math.max(2, Math.round(computedFontSize * 0.04));

  const textLines = lines.map((line, i) => {
    const y = textY + i * lineHeight;
    const escaped = escapeXml(line);
    return `
      <text x="${textX}" y="${y}" font-family="${FONT_FAMILY}" font-size="${computedFontSize}" font-weight="${fontWeight}" fill="${strokeColor}" text-anchor="${anchor}" opacity="0.5"
        dx="${shadowOffset}" dy="${shadowOffset}">${escaped}</text>
      <text x="${textX}" y="${y}" font-family="${FONT_FAMILY}" font-size="${computedFontSize}" font-weight="${fontWeight}" fill="none" stroke="${strokeColor}" stroke-width="${computedStrokeWidth * 2}" stroke-linejoin="round" text-anchor="${anchor}">${escaped}</text>
      <text x="${textX}" y="${y}" font-family="${FONT_FAMILY}" font-size="${computedFontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="${anchor}">${escaped}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
${textLines}
</svg>`;

  const svgBuffer = Buffer.from(svg);

  await sharp(basePath)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return outputPath;
}

module.exports = { composeThumbnail };
