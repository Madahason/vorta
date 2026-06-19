const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SAFE_ZONE_W_RATIO = 0.15;
const SAFE_ZONE_H_RATIO = 0.12;

const FONTS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'fonts');

const FONT_CONFIG = {
  anton: {
    name: 'Anton',
    weights: {
      400: { file: 'Anton-Regular.ttf', label: 'Regular' },
    },
    defaultWeight: 400,
    // No dedicated italic file — SVG skew used as fallback
    italicAvailable: false,
  },
  inter: {
    name: 'Inter',
    weights: {
      700: { file: 'Inter-Bold.ttf', label: 'Bold' },
      900: { file: 'Inter-Black.ttf', label: 'Black' },
    },
    defaultWeight: 900,
    italicAvailable: false,
  },
  playfair: {
    name: 'Playfair Display',
    weights: {
      700: { file: 'PlayfairDisplay-Bold.ttf', label: 'Bold' },
      900: { file: 'PlayfairDisplay-Black.ttf', label: 'Black' },
    },
    defaultWeight: 700,
    italicAvailable: false,
  },
  oswald: {
    name: 'Oswald',
    weights: {
      700: { file: 'Oswald-Bold.ttf', label: 'Bold' },
    },
    defaultWeight: 700,
    italicAvailable: false,
  },
};

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

function clampPosition(x, y, blockW, blockH, imgW, imgH) {
  const safeX = imgW * (1 - SAFE_ZONE_W_RATIO);
  const safeY = imgH * (1 - SAFE_ZONE_H_RATIO);
  const halfW = blockW / 2;
  const halfH = blockH / 2;
  const right = x * imgW + halfW;
  const bottom = y * imgH + halfH;
  let cx = x;
  let cy = y;
  if (right > safeX && bottom > safeY) {
    const pushLeft = (right - safeX) / imgW;
    const pushUp = (bottom - safeY) / imgH;
    if (pushLeft < pushUp) cx = Math.max(0, cx - pushLeft - 0.01);
    else cy = Math.max(0, cy - pushUp - 0.01);
  }
  cx = Math.max(0.02, Math.min(0.98, cx));
  cy = Math.max(0.02, Math.min(0.98, cy));
  return { x: cx, y: cy };
}

function resolveFontFile(fontFamily, fontWeight) {
  const cfg = FONT_CONFIG[fontFamily] || FONT_CONFIG.anton;
  const weightKey = fontWeight && cfg.weights[fontWeight] ? fontWeight : cfg.defaultWeight;
  const entry = cfg.weights[weightKey];
  return {
    filePath: path.join(FONTS_DIR, entry.file),
    fontName: cfg.name,
    weight: weightKey,
  };
}

function buildFontFaceRule(fontName, fontFilePath) {
  const fontData = fs.readFileSync(fontFilePath);
  const base64 = fontData.toString('base64');
  return `@font-face { font-family: '${fontName}'; src: url('data:font/truetype;base64,${base64}'); }`;
}

async function composeThumbnail({
  basePath,
  text,
  x = 0.5,
  y = 0.5,
  fontSize,
  color = '#FFFFFF',
  strokeColor = '#000000',
  strokeWidth,
  fontFamily = 'anton',
  fontWeight,
  italic = false,
  uppercase = true,
  letterSpacing = 0,
  backgroundPill = false,
  backgroundPillColor = '#000000',
  backgroundPillOpacity = 0.6,
  outputPath,
}) {
  let displayText = text.trim();
  if (uppercase) displayText = displayText.toUpperCase();

  const wordCount = displayText.split(/\s+/).length;
  if (wordCount > 4) {
    console.warn(`[thumbnailComposer] text has ${wordCount} words (recommended max: 4): "${displayText}"`);
  }

  const metadata = await sharp(basePath).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const { filePath: fontFilePath, fontName, weight: resolvedWeight } = resolveFontFile(fontFamily, fontWeight);
  const fontFaceRule = buildFontFaceRule(fontName, fontFilePath);

  const computedFontSize = fontSize || Math.round(imgH * 0.10);
  const computedStrokeWidth = strokeWidth !== undefined ? strokeWidth : Math.max(2, Math.round(computedFontSize * 0.06));
  const lineHeight = computedFontSize * 1.15;
  const lsAttr = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';

  // Italic: SVG skew fallback since no dedicated italic font files are bundled
  const italicTransform = italic ? ' font-style="italic"' : '';

  const maxCharsPerLine = Math.max(6, Math.round(20 * (720 / imgH)));
  const lines = wrapText(displayText, maxCharsPerLine);

  const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
  const charWidthFactor = fontFamily === 'anton' || fontFamily === 'oswald' ? 0.48 : fontFamily === 'playfair' ? 0.52 : 0.55;
  const approxTextW = longestLine.length * computedFontSize * charWidthFactor;
  const textBlockH = lines.length * lineHeight;

  const pillPadX = backgroundPill ? Math.round(computedFontSize * 0.4) : 0;
  const pillPadY = backgroundPill ? Math.round(computedFontSize * 0.25) : 0;
  const blockW = approxTextW + pillPadX * 2;
  const blockH = textBlockH + pillPadY * 2;

  const clamped = clampPosition(x, y, blockW, blockH, imgW, imgH);

  const centerPxX = clamped.x * imgW;
  const centerPxY = clamped.y * imgH;
  const topY = centerPxY - textBlockH / 2 + computedFontSize * 0.85;

  const shadowOffset = Math.max(2, Math.round(computedFontSize * 0.04));

  let pillSvg = '';
  if (backgroundPill) {
    const pillX = centerPxX - blockW / 2;
    const pillY = centerPxY - blockH / 2;
    const radius = Math.round(computedFontSize * 0.15);
    pillSvg = `<rect x="${pillX}" y="${pillY}" width="${blockW}" height="${blockH}" rx="${radius}" ry="${radius}" fill="${backgroundPillColor}" opacity="${backgroundPillOpacity}" />`;
  }

  const textLines = lines.map((line, i) => {
    const ly = topY + i * lineHeight;
    const escaped = escapeXml(line);
    const common = `font-family="'${fontName}'" font-size="${computedFontSize}" font-weight="${resolvedWeight}" text-anchor="middle"${lsAttr}${italicTransform}`;
    return `
      <text x="${centerPxX}" y="${ly}" ${common} fill="${strokeColor}" opacity="0.5" dx="${shadowOffset}" dy="${shadowOffset}">${escaped}</text>
      <text x="${centerPxX}" y="${ly}" ${common} fill="none" stroke="${strokeColor}" stroke-width="${computedStrokeWidth * 2}" stroke-linejoin="round">${escaped}</text>
      <text x="${centerPxX}" y="${ly}" ${common} fill="${color}">${escaped}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
<defs><style>${fontFaceRule}</style></defs>
${pillSvg}
${textLines}
</svg>`;

  const svgBuffer = Buffer.from(svg);

  await sharp(basePath)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return { outputPath, x: clamped.x, y: clamped.y };
}

module.exports = { composeThumbnail, SAFE_ZONE_W_RATIO, SAFE_ZONE_H_RATIO, FONT_CONFIG };
