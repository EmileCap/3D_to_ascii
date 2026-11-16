import fs from 'node:fs/promises';
import path from 'node:path';
import { convertPixels, imageHeight } from '../core/ascii.js';

function glbData(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('Fichier GLB invalide');
  let offset = 12;
  let json;
  let binary;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = buffer.subarray(offset, offset + size);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) binary = chunk;
    offset += size;
  }
  if (!json || !binary) throw new Error('GLB sans JSON ou buffer intégré');
  return { json, binary };
}

function gltfTriangles(json, buffers) {
  const triangles = [];
  const readAccessor = accessorIndex => {
    const accessor = json.accessors[accessorIndex];
    const view = json.bufferViews[accessor.bufferView];
    const buffer = buffers[view.buffer];
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const components = accessor.type === 'VEC3' ? 3 : 1;
    const stride = view.byteStride || components * (accessor.componentType === 5126 ? 4 : accessor.componentType === 5123 ? 2 : 1);
    const read = (position, component) => {
      const at = offset + position * stride + component * (accessor.componentType === 5126 ? 4 : accessor.componentType === 5123 ? 2 : 1);
      if (accessor.componentType === 5126) return buffer.readFloatLE(at);
      if (accessor.componentType === 5123) return buffer.readUInt16LE(at);
      if (accessor.componentType === 5125) return buffer.readUInt32LE(at);
      if (accessor.componentType === 5121) return buffer.readUInt8(at);
      throw new Error(`Type accessor glTF non pris en charge : ${accessor.componentType}`);
    };
    return Array.from({ length: accessor.count }, (_, i) => components === 3 ? [read(i, 0), read(i, 1), read(i, 2)] : read(i, 0));
  };
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      const vertices = readAccessor(primitive.attributes.POSITION);
      const indices = primitive.indices === undefined ? vertices.map((_, i) => i) : readAccessor(primitive.indices);
      for (let i = 0; i + 2 < indices.length; i += 3) triangles.push([vertices[indices[i]], vertices[indices[i + 1]], vertices[indices[i + 2]]]);
    }
  }
  return triangles;
}

function objTriangles(text) {
  const vertices = [];
  const triangles = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') vertices.push(parts.slice(1, 4).map(Number));
    if (parts[0] === 'f') {
      const indices = parts.slice(1).map(part => {
        const raw = Number(part.split('/')[0]);
        return raw < 0 ? vertices.length + raw : raw - 1;
      });
      for (let i = 1; i + 1 < indices.length; i++) triangles.push([vertices[indices[0]], vertices[indices[i]], vertices[indices[i + 1]]]);
    }
  }
  return triangles;
}

function stlTriangles(buffer) {
  if (buffer.length >= 84) {
    const count = buffer.readUInt32LE(80);
    if (84 + count * 50 === buffer.length) {
      const result = [];
      for (let i = 0; i < count; i++) {
        const base = 84 + i * 50 + 12;
        result.push([0, 1, 2].map(vertex => [0, 1, 2].map(axis => buffer.readFloatLE(base + vertex * 12 + axis * 4))));
      }
      return result;
    }
  }
  const text = buffer.toString('utf8');
  const vertices = [...text.matchAll(/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/g)].map(match => match.slice(1).map(Number));
  const result = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) result.push(vertices.slice(i, i + 3));
  return result;
}

function rasterize(triangles, settings, angle = 0) {
  if (!triangles.length) throw new Error('Le modèle ne contient aucun triangle');
  const width = settings.width;
  const height = imageHeight(width, settings.ratio);
  const pixels = new Uint8Array(width * height * 4);
  const depth = new Float32Array(width * height).fill(Infinity);
  const points = triangles.flat();
  const min = [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis])));
  const scale = 2 / Math.max(...max.map((value, axis) => value - min[axis]), 1e-6);
  const cosine = Math.cos(angle * Math.PI / 180);
  const sine = Math.sin(angle * Math.PI / 180);
  const project = point => {
    const x = (point[0] - (min[0] + max[0]) / 2) * scale;
    const y = (point[1] - (min[1] + max[1]) / 2) * scale;
    const z = (point[2] - (min[2] + max[2]) / 2) * scale;
    return [(x * cosine - z * sine) * 0.78 * width + width / 2, (1.25 - (y * 1.12 + 0.28)) * height / 2, 4 - (x * sine + z * cosine)];
  };
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map(project);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (!area) continue;
    const ux = triangle[1][0] - triangle[0][0];
    const uy = triangle[1][1] - triangle[0][1];
    const uz = triangle[1][2] - triangle[0][2];
    const vx = triangle[2][0] - triangle[0][0];
    const vy = triangle[2][1] - triangle[0][1];
    const vz = triangle[2][2] - triangle[0][2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const normalLength = Math.hypot(nx, ny, nz) || 1;
    const shade = Math.max(0.12, Math.min(1, (0.35 + Math.abs(ny / normalLength) * 0.5 + Math.abs(nz / normalLength) * 0.3) * settings.light));
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const u = ((b[0] - x) * (c[1] - y) - (b[1] - y) * (c[0] - x)) / area;
        const v = ((c[0] - x) * (a[1] - y) - (c[1] - y) * (a[0] - x)) / area;
        const t = 1 - u - v;
        if (u < 0 || v < 0 || t < 0) continue;
        const index = y * width + x;
        const distance = u * a[2] + v * b[2] + t * c[2];
        if (distance >= depth[index]) continue;
        depth[index] = distance;
        const pixel = index * 4;
        pixels[pixel] = Math.round(220 * shade);
        pixels[pixel + 1] = Math.round(232 * shade);
        pixels[pixel + 2] = Math.round(220 * shade);
        pixels[pixel + 3] = 255;
      }
    }
  }
  return convertPixels(pixels, width, height, settings);
}

export async function renderFile(file, settings, angle = 0) {
  const extension = path.extname(file).toLowerCase();
  const buffer = await fs.readFile(file);
  let triangles;
  if (extension === '.glb') {
    const { json, binary } = glbData(buffer);
    triangles = gltfTriangles(json, [binary]);
  } else if (extension === '.gltf') {
    const json = JSON.parse(buffer.toString('utf8'));
    const buffers = await Promise.all((json.buffers || []).map(async item => item.uri?.startsWith('data:')
      ? Buffer.from(item.uri.split(',')[1], 'base64')
      : fs.readFile(path.resolve(path.dirname(file), item.uri))));
    triangles = gltfTriangles(json, buffers);
  } else if (extension === '.obj') triangles = objTriangles(buffer.toString('utf8'));
  else if (extension === '.stl') triangles = stlTriangles(buffer);
  else if (extension === '.fbx') throw new Error(`FBX non pris en charge par le rasteriseur CLI sans interface : ${file}`);
  else throw new Error(`Format ${extension || '(sans extension)'} non pris en charge`);
  return rasterize(triangles, settings, angle);
}
