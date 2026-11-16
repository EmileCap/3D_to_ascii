import fs from 'node:fs/promises';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function writeSpriteSheet(filePath, data, metadata) {
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) throw new Error('Données PNG invalides.');
  const png = Buffer.from(data);
  if (png.length < pngSignature.length || !png.subarray(0, pngSignature.length).equals(pngSignature)) throw new Error('Signature PNG invalide.');
  if (!metadata || metadata.format !== 'ascii3d-spritesheet' || !Array.isArray(metadata.frames)) throw new Error('Métadonnées de sprite sheet invalides.');
  const pngPath = /\.png$/i.test(filePath) ? filePath : `${filePath}.png`;
  const jsonPath = pngPath.replace(/\.png$/i, '') + '.json';
  let pngWritten = false;
  try {
    await fs.writeFile(pngPath, png);
    pngWritten = true;
    await fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2));
  } catch (error) {
    if (pngWritten) await fs.rm(pngPath, {force: true});
    throw error;
  }
  return {pngPath, jsonPath};
}
