import fs from 'node:fs/promises';
import path from 'node:path';

const modelPattern = /\.(glb|gltf|obj|stl|fbx)$/i;
const help = `ASCII3D — conversion 3D en art ASCII
Usage : node bin/ascii3d.js --input fichier.glb [options]
  --input fichier|dossier|glob (répétable)  --output fichier  --out-dir dossier
  --format txt|ans|html|json  --frames N  --width 40..400  --ratio 0.5
  --charset short|long|blocks|braille|custom  --custom-charset texte
  --invert  --color mono|model|ansi|gradient  --edges  --threshold 0.18
  --contrast 1  --brightness 0  --gamma 1  --light 1  --bg black|white
  --wireframe  --preset fichier.json  --help`;

export function parseArgs(argv) {
  const options = { inputs: [] };
  const flags = new Set(['invert', 'edges', 'wireframe']);
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!argument.startsWith('--')) throw new Error(`Option inattendue : ${argument}`);
    const key = argument.slice(2);
    if (flags.has(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Valeur manquante pour --${key}`);
    if (key === 'input') options.inputs.push(value);
    else options[key] = value;
  }
  if (!options.help && !options.inputs.length) throw new Error('--input est obligatoire');
  return options;
}

function globRegex(pattern) {
  let result = '^';
  for (const char of pattern) {
    if (char === '*') result += '.*';
    else if (char === '?') result += '.';
    else result += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${result}$`, process.platform === 'win32' ? 'i' : '');
}

async function expandInputs(inputs) {
  const files = new Set();
  for (const raw of inputs) {
    const absolute = path.resolve(raw);
    try {
      const stat = await fs.stat(absolute);
      if (stat.isDirectory()) {
        for (const name of await fs.readdir(absolute)) {
          if (modelPattern.test(name)) files.add(path.join(absolute, name));
        }
      } else files.add(absolute);
    } catch {
      const directory = path.dirname(absolute);
      const expression = globRegex(path.basename(absolute));
      try {
        for (const name of await fs.readdir(directory)) {
          if (expression.test(name) && modelPattern.test(name)) files.add(path.join(directory, name));
        }
      } catch {}
    }
  }
  if (!files.size) throw new Error('Aucun fichier 3D trouvé');
  return [...files].sort();
}

export async function runCli(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help);
    return 0;
  }
  const [{ defaults, validateSettings }, { renderFile }, { exportTxt }, { exportAnsi }, { exportHtml }, { exportFrames }] = await Promise.all([
    import('../core/settings.js'), import('./raster.js'), import('../export/txt.js'), import('../export/ansi.js'), import('../export/html.js'), import('../export/json.js')
  ]);
  let settings = { ...defaults };
  if (options.preset) settings = validateSettings(JSON.parse(await fs.readFile(options.preset, 'utf8')));
  const keys = { customCharset: 'custom-charset' };
  for (const key of Object.keys(settings)) {
    const cliKey = keys[key] || key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    if (options[cliKey] !== undefined) settings[key] = options[cliKey];
  }
  for (const key of ['width', 'ratio', 'threshold', 'contrast', 'brightness', 'gamma', 'light']) {
    if (options[key] !== undefined) settings[key] = Number(options[key]);
  }
  settings = validateSettings(settings);
  const files = await expandInputs(options.inputs);
  const format = options.format || ({ ans: 'ans', ansi: 'ans', html: 'html', json: 'json' }[path.extname(options.output || '').slice(1).toLowerCase()] || 'txt');
  if (!['txt', 'ans', 'html', 'json'].includes(format)) throw new Error(`Format inconnu : ${format}`);
  const count = options.frames === undefined ? 1 : Number(options.frames);
  if (!Number.isInteger(count) || count < 1 || count > 360) throw new Error('--frames doit être un entier compris entre 1 et 360');
  for (const [index, file] of files.entries()) {
    if (path.extname(file).toLowerCase() === '.fbx') throw new Error(`FBX non pris en charge par le rasteriseur CLI sans interface : ${file}`);
    const frames = [];
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      const angle = count === 1 ? 0 : frameIndex * 360 / count;
      frames.push({ ...await renderFile(file, settings, angle), angle });
    }
    const first = frames[0];
    const output = options.frames !== undefined || format === 'json'
      ? exportFrames(frames)
      : format === 'txt' ? exportTxt(first)
        : format === 'ans' ? exportAnsi(first) : exportHtml(first);
    const extension = format === 'ans' ? 'ans' : format;
    const dest = options.output && files.length === 1
      ? options.output
      : path.join(options['out-dir'] || '.', `${path.basename(file, path.extname(file))}${count > 1 ? '-frames' : ''}.${extension}`);
    await fs.mkdir(path.dirname(path.resolve(dest)), { recursive: true });
    await fs.writeFile(dest, output);
    console.log(`${file} → ${dest}`);
  }
  return 0;
}

export { help };
