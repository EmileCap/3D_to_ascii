function writeWord(output, value) {
  output.push(value & 255, (value >> 8) & 255);
}

function lzwEncode(indices) {
  const bytes = [];
  let accumulator = 0;
  let bitCount = 0;
  const writeCode = code => {
    accumulator |= code << bitCount;
    bitCount += 9;
    while (bitCount >= 8) {
      bytes.push(accumulator & 255);
      accumulator >>>= 8;
      bitCount -= 8;
    }
  };
  writeCode(256);
  let sinceClear = 0;
  for (const index of indices) {
    writeCode(index & 255);
    sinceClear++;
    if (sinceClear === 200) {
      writeCode(256);
      sinceClear = 0;
    }
  }
  writeCode(257);
  if (bitCount) bytes.push(accumulator & 255);
  return bytes;
}

export function encodeGif(frames, width, height, delay = 8) {
  if (!Array.isArray(frames) || frames.length === 0) throw new Error('Au moins une trame GIF est requise');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) throw new Error('Dimensions GIF invalides');
  const output = [...BufferlessText('GIF89a')];
  writeWord(output, width);
  writeWord(output, height);
  output.push(0xf7, 0, 0);
  for (let i = 0; i < 256; i++) output.push((i >> 5) * 255 / 7 | 0, ((i >> 2) & 7) * 255 / 7 | 0, (i & 3) * 255 / 3 | 0);
  output.push(0x21, 0xff, 0x0b, ...BufferlessText('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (const frame of frames) {
    const indices = frame.indices || frame;
    if (indices.length !== width * height) throw new Error('Taille de trame GIF incorrecte');
    output.push(0x21, 0xf9, 4, 0, 0);
    writeWord(output, Math.max(1, Math.min(65535, Math.round(delay))));
    output.push(0, 0, 0x2c);
    writeWord(output, 0);
    writeWord(output, 0);
    writeWord(output, width);
    writeWord(output, height);
    output.push(0, 8);
    const compressed = lzwEncode(indices);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const chunk = compressed.slice(offset, offset + 255);
      output.push(chunk.length, ...chunk);
    }
    output.push(0);
  }
  output.push(0x3b);
  return Uint8Array.from(output);
}

function BufferlessText(text) {
  return Array.from(text, character => character.charCodeAt(0));
}

export async function exportGif(canvases, delay = 8) {
  if (typeof document === 'undefined') throw new Error('L’export GIF requiert un navigateur');
  if (!canvases.length) throw new Error('Au moins une trame GIF est requise');
  const width = canvases[0].width;
  const height = canvases[0].height;
  const indexed = canvases.map(canvas => {
    if (canvas.width !== width || canvas.height !== height) throw new Error('Toutes les trames GIF doivent avoir les mêmes dimensions');
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    const indices = new Uint8Array(width * height);
    for (let i = 0; i < indices.length; i++) indices[i] = (data[i * 4] >> 5) << 5 | (data[i * 4 + 1] >> 5) << 2 | (data[i * 4 + 2] >> 6);
    return indices;
  });
  return new Blob([encodeGif(indexed, width, height, delay)], { type: 'image/gif' });
}
