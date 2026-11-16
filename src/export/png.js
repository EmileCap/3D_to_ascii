import {glyphAspect} from '../core/ascii.js';

export function drawPng(canvas, frame, fontSize = 12) {
  const context = canvas.getContext('2d');
  const cellWidth = fontSize * glyphAspect;
  canvas.width = Math.ceil(frame.width * cellWidth);
  canvas.height = frame.height * fontSize;
  if (frame.settings?.bg !== 'transparent') {
    context.fillStyle = frame.settings?.bg === 'white' ? '#fff' : '#080b08';
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  context.font = `${fontSize}px monospace`;
  context.textBaseline = 'top';
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const glyph = frame.rows[y][x];
      if (glyph.trim()) {
        context.fillStyle = frame.colors[y][x];
        context.fillText(glyph, x * cellWidth, y * fontSize);
      }
    }
  }
  return canvas;
}

export function composeSpriteSheet(frames, options = {}) {
  if (!frames.length) throw new Error('Aucune image à assembler.');
  const columns = Math.max(1, Math.min(frames.length, Math.floor(options.columns || Math.ceil(Math.sqrt(frames.length)))));
  const rows = Math.ceil(frames.length / columns);
  const cellWidth = frames[0].canvas.width;
  const cellHeight = frames[0].canvas.height;
  const padding = Math.max(0, Math.floor(options.padding || 0));
  const width = columns * cellWidth + Math.max(0, columns - 1) * padding;
  const height = rows * cellHeight + Math.max(0, rows - 1) * padding;
  if (width > 16384 || height > 16384 || width * height > 100_000_000) {
    throw new Error('Sprite sheet trop grande : réduisez la largeur ASCII ou le nombre d’images.');
  }
  const sheet = options.createCanvas ? options.createCanvas() : document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  const context = sheet.getContext('2d');
  for (const [index, frame] of frames.entries()) {
    const x = (index % columns) * (cellWidth + padding);
    const y = Math.floor(index / columns) * (cellHeight + padding);
    context.drawImage(frame.canvas, x, y);
    frame.rect = {x, y, width: cellWidth, height: cellHeight};
  }
  return {canvas: sheet, columns, rows, cellWidth, cellHeight, frames};
}

export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Échec de création du PNG.')), 'image/png');
  });
}

export function exportPngSequence(frames, fontSize = 12) {
  if (typeof document === 'undefined') throw new Error('La séquence PNG requiert un navigateur');
  return Promise.all(frames.map(frame => {
    const canvas = drawPng(document.createElement('canvas'), frame, fontSize);
    return canvasToPng(canvas);
  }));
}
