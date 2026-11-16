import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { charsets, getCharset } from '../src/core/charsets.js';
import { defaults, validateSettings, presets, parsePreset } from '../src/core/settings.js';
import { convertPixels } from '../src/core/ascii.js';
import { edgeGlyph, sobel } from '../src/core/edges.js';
import { exportTxt } from '../src/export/txt.js';
import { exportAnsi } from '../src/export/ansi.js';
import { exportHtml } from '../src/export/html.js';
import { exportFrames } from '../src/export/json.js';
import { encodeGif } from '../src/export/gif.js';
import { composeSpriteSheet, drawPng } from '../src/export/png.js';
import { createExportCamera, THREE } from '../src/renderer/scene.js';
import { glyphAspect, imageHeight } from '../src/core/ascii.js';
import { writeSpriteSheet } from '../src/main/sprite-sheet.js';
import { compatibleAnimationClips } from '../src/renderer/loaders.js';

const project = process.cwd();

test('jeux de caractères et validation des réglages/préréglages', () => {
  assert.equal(getCharset('short').length, 10);
  assert.equal(getCharset('long').length, 70);
  assert.equal(charsets.blocks.length, 4);
  assert.equal(getCharset('braille').length, 64);
  assert.equal(validateSettings({ width: 900 }).width, 400);
  assert.equal(validateSettings({ width: 5 }).width, 40);
  assert.throws(() => validateSettings({ color: 'rainbow' }), /couleur/);
  assert.throws(() => parsePreset('{'), /invalide/);
  assert.equal(parsePreset(JSON.stringify(presets.poster)).charset, 'long');
});

test('conversion pixels et détection Sobel', () => {
  const pixels = new Uint8Array(4 * 5 * 5);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) pixels.set(x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * 5 + x) * 4);
  }
  const frame = convertPixels(pixels, 5, 5, { ...defaults, charset: 'short' });
  assert.equal(frame.rows.length, 5);
  assert.equal(frame.rows[0].length, 5);
  assert.equal(frame.text.split('\n').length, 5);
  const edges = sobel(pixels, 5, 5, 0.1);
  assert.equal(edges.length, 25);
  assert.notEqual(edges[2 * 5 + 2], 0);
  assert.equal(edgeGlyph(0), '-');
  assert.ok(['/', '|', String.fromCharCode(92)].includes(edgeGlyph(1.5)));
});

test('exports TXT, ANSI, HTML et JSON', () => {
  const frame = convertPixels(new Uint8Array(4 * 4 * 4).fill(255), 4, 4, defaults);
  assert.equal(exportTxt(frame), `${frame.text}\n`);
  assert.match(exportAnsi(frame), /\u001b\[38;2;/);
  assert.match(exportHtml(frame), /<pre>/);
  assert.match(exportHtml(frame), /<span/);
  const parsed = JSON.parse(exportFrames([{ ...frame, angle: 30 }]));
  assert.equal(parsed.format, 'ascii3d-frames');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.frames[0].angle, 30);
  assert.deepEqual(Object.keys(parsed.frames[0]), ['angle', 'width', 'height', 'rows', 'colors']);
});

test('sauvegarde atomique des sprites PNG et métadonnées JSON', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ascii3d-sprites-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const pngPath = path.join(directory, 'sprite.png');
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('image')]);
  const metadata = {version: 1, format: 'ascii3d-spritesheet', frames: [{x: 0, y: 0}]};
  const saved = await writeSpriteSheet(pngPath, png, metadata);
  assert.deepEqual(saved, {pngPath, jsonPath: path.join(directory, 'sprite.json')});
  assert.deepEqual(fs.readFileSync(saved.pngPath), png);
  assert.deepEqual(JSON.parse(fs.readFileSync(saved.jsonPath, 'utf8')), metadata);
  await assert.rejects(writeSpriteSheet(path.join(directory, 'bad.png'), Buffer.from('not png'), metadata), /PNG invalide/);
  await assert.rejects(writeSpriteSheet(path.join(directory, 'bad.png'), png, {format: 'unknown', frames: []}), /métadonnées/i);
  assert.equal(fs.existsSync(path.join(directory, 'bad.png')), false);
});

test('import d’animations séparées vérifie la compatibilité du rig', () => {
  const root = new THREE.Group();
  root.name = 'Armature';
  const bone = new THREE.Bone();
  bone.name = 'Hips';
  root.add(bone);
  const clip = new THREE.AnimationClip('Marche', 1, [new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 0, 1, 0])]);
  assert.deepEqual(compatibleAnimationClips(root, [clip]), [clip]);
  const incompatible = new THREE.AnimationClip('Autre rig', 1, [new THREE.VectorKeyframeTrack('Other.position', [0, 1], [0, 0, 0, 0, 1, 0])]);
  assert.throws(() => compatibleAnimationClips(root, [incompatible]), /ne correspondent pas/);
  assert.deepEqual(compatibleAnimationClips(root, [incompatible, clip]), [clip]);
});

test('ratio de grille compense la largeur réelle des caractères ASCII', () => {
  assert.equal(glyphAspect, 0.62);
  assert.equal(imageHeight(100, 0.5), 50);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const preview = createExportCamera('preview', camera, null, 100, 50, glyphAspect);
  assert.ok(Math.abs(preview.aspect - 1.24) < 1e-10);
  const correctedContentAspect = preview.aspect * (50 / 100) / glyphAspect;
  assert.ok(Math.abs(correctedContentAspect - 1) < 1e-10);
});

test('caméras export fixes ou aperçu, sans mutation de la caméra interactive', () => {
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.01, 100);
  camera.position.set(2, 1, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const model = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), new THREE.MeshBasicMaterial());
  model.position.set(3, -2, 4);
  const position = camera.position.clone();
  const quaternion = camera.quaternion.clone();
  const isometric = createExportCamera('isometric', camera, model, 160, 80);
  const preview = createExportCamera('preview', camera, model, 160, 80);
  assert.equal(isometric.isOrthographicCamera, true);
  assert.equal(isometric.left, -isometric.right);
  assert.equal(isometric.top, -isometric.bottom);
  assert.equal(preview.isPerspectiveCamera, true);
  assert.equal(preview.aspect, 2 * glyphAspect);
  assert.ok(preview.position.equals(position));
  assert.ok(preview.quaternion.equals(quaternion));
  assert.ok(camera.position.equals(position));
  assert.ok(camera.quaternion.equals(quaternion));
});

test('rendu PNG préserve les espaces transparents et le composeur ordonne la sprite sheet', () => {
  const drawn = [];
  const context = {
    fillRect() {},
    clearRect() {},
    fillText(glyph, x, y) { drawn.push({glyph, x, y}); }
  };
  const canvas = {getContext: () => context};
  const frame = {width: 2, height: 2, rows: ['@ ', ' @'], colors: [['#fff', '#fff'], ['#fff', '#fff']], settings: {bg: 'transparent'}};
  assert.equal(drawPng(canvas, frame, 10), canvas);
  assert.equal(canvas.width, 13);
  assert.equal(canvas.height, 20);
  assert.deepEqual(drawn.map(item => item.glyph), ['@', '@']);
  assert.deepEqual(drawn.map(item => [item.x, item.y]), [[0, 0], [6.2, 10]]);
  const frames = [{canvas: {width: 13, height: 20}}, {canvas: {width: 13, height: 20}}, {canvas: {width: 13, height: 20}}];
  const contextCalls = [];
  const createCanvas = () => ({getContext: () => ({drawImage: (...args) => contextCalls.push(args)}), set width(value) { this._width = value; }, get width() { return this._width; }, set height(value) { this._height = value; }, get height() { return this._height; }});
  const result = composeSpriteSheet(frames, {columns: 2, padding: 1, createCanvas});
  assert.equal(result.columns, 2);
  assert.equal(result.rows, 2);
  assert.equal(result.canvas.width, 27);
  assert.equal(result.canvas.height, 41);
  assert.deepEqual(frames.map(item => item.rect), [{x: 0, y: 0, width: 13, height: 20}, {x: 14, y: 0, width: 13, height: 20}, {x: 0, y: 21, width: 13, height: 20}]);
  assert.equal(contextCalls.length, 3);
  assert.throws(() => composeSpriteSheet([], {}), /Aucune image/);
});

test('encodeur GIF produit GIF89a et un trailer GIF', () => {
  const data = encodeGif([new Uint8Array([0, 1, 2, 3])], 2, 2);
  assert.equal(Buffer.from(data.subarray(0, 6)).toString('ascii'), 'GIF89a');
  assert.equal(data.at(-1), 0x3b);
  assert.ok(data.includes(0x2c));
});

test('CLI rend le GLB, exporte les quatre formats et un batch de deux modèles', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ascii3d-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const obj = path.join(directory, 'second.obj');
  fs.writeFileSync(obj, 'v -1 -1 0\nv 1 -1 0\nv 0 1 0\nf 1 2 3\n');
  for (const format of ['txt', 'ans', 'html', 'json']) {
    const output = path.join(directory, `sample.${format}`);
    const result = spawnSync(process.execPath, ['bin/ascii3d.js', '--input', 'assets/sample.glb', '--width', '80', '--charset', 'long', '--color', 'ansi', '--format', format, '--output', output], { cwd: project, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const contents = fs.readFileSync(output, format === 'ans' ? 'utf8' : 'utf8');
    assert.ok(contents.length > 80);
    if (format === 'txt') assert.match(contents, /[^\s]/);
    if (format === 'ans') assert.match(contents, /\u001b\[/);
    if (format === 'html') assert.match(contents, /<pre>/);
    if (format === 'json') assert.equal(JSON.parse(contents).frames.length, 1);
  }
  const batch = path.join(directory, 'batch');
  const result = spawnSync(process.execPath, ['bin/ascii3d.js', '--input', 'assets/sample.glb', '--input', obj, '--width', '40', '--out-dir', batch], { cwd: project, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readdirSync(batch).filter(file => file.endsWith('.txt')).length, 2);
});
