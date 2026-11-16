import {SceneView, THREE, createExportCamera} from "./scene.js";
import {compatibleAnimationClips, loadModel} from "./loaders.js";
import {makeSample} from "./sample.js";
import {defaults, validateSettings, parsePreset} from "../core/settings.js";
import {convertPixels, glyphAspect} from "../core/ascii.js";
import {canvasToPng, composeSpriteSheet, drawPng} from "../export/png.js";

const $ = id => document.getElementById(id);
const scene = new SceneView($("scene"));
const canvas = $("output");
let settings = {...defaults};
let model = null;
let clips = [];
let mixer = null;
let animationRoot = null;
let animationFileName = null;
let animationAction = null;
let animationPlaying = false;
let animationClock = null;
let animationLoop = null;
let frame = null;
let busy = false;
let last = 0;
let timer;
let queued = false;
let exporting = false;
let exportMessage = null;
let statusOverride = null;
let statusBeforeExport = "EN ATTENTE";

function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(element._timer);
  element._timer = setTimeout(() => element.classList.remove("show"), 4000);
}

function readSettings() {
  const next = {...settings};
  for (const key of ["width", "ratio", "charset", "customCharset", "invert", "color", "monoColor", "gradient", "bg", "edges", "threshold", "contrast", "brightness", "gamma", "light", "wireframe"]) {
    const element = $(key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`));
    if (element) next[key] = element.type === "checkbox" ? element.checked : element.type === "range" ? Number(element.value) : element.value;
  }
  settings = validateSettings(next);
  $("width-value").value = settings.width;
  for (const key of ["ratio", "threshold", "contrast", "brightness", "gamma", "light"]) $(`${key}-value`).value = Number(settings[key]).toFixed(2);
  $("custom-wrap").hidden = settings.charset !== "custom";
  $("mono-wrap").hidden = settings.color !== "mono";
  $("gradient-wrap").hidden = settings.color !== "gradient";
  scene.setWire(settings.wireframe);
  scene.setLight(settings.light);
  scene.setBackground(settings.bg);
}

function render() {
  if (!model || exporting) return;
  if (busy) {
    queued = true;
    return;
  }
  const delay = 90 - (performance.now() - last);
  if (delay > 0) {
    clearTimeout(timer);
    timer = setTimeout(render, delay);
    return;
  }
  last = performance.now();
  busy = true;
  requestAnimationFrame(() => {
    try {
      scene.render();
      const result = scene.renderToGrid(settings.width, settings.ratio);
      frame = convertPixels(result.pixels, result.width, result.height, settings);
      drawPng(canvas, frame, Math.min(12, Math.max(5, 700 / (settings.width * glyphAspect))));
      $("grid-size").textContent = `${frame.width} × ${frame.height}`;
      $("empty").hidden = true;
      $("status").textContent = statusOverride || `${frame.width * frame.height} CELLULES`;
    } catch (error) {
      toast(`Erreur de rendu : ${error.message}`);
      $("status").textContent = statusOverride || "ERREUR DE RENDU";
    } finally {
      busy = false;
      if (queued) {
        queued = false;
        render();
      }
    }
  });
}

function refreshAnimationControls() {
  const select = $("clip-select");
  const mode = $("animation-mode");
  const hasClips = clips.length > 0;
  for (const option of mode.options) if (option.value === "clip") option.disabled = !hasClips;
  select.replaceChildren(...clips.map((clip, index) => new Option(`${clip.name || `Animation ${index + 1}`} · ${clip.duration.toFixed(2)} s`, String(index))));
  $("clip-wrap").hidden = !hasClips || mode.value !== "clip";
  $("animation-status").textContent = hasClips ? `${clips.length} animation(s) disponible(s)` : "Aucun clip dans ce modèle";
  $("animation-file-name").textContent = animationFileName || "Importez un GLB/FBX animé";
  $("import-animation").disabled = !model;
  $("play-animation").disabled = !mixer || !hasClips;
  $("play-animation").textContent = animationPlaying ? "[ PAUSE ]" : "[ LIRE ]";
  if (!hasClips && mode.value === "clip") mode.value = "turntable";
  $("export").disabled = !model;
  $("turntable").disabled = !model;
}

function stopAnimationPlayback() {
  if (animationLoop !== null) cancelAnimationFrame(animationLoop);
  animationLoop = null;
  animationClock?.stop();
  animationClock = null;
  animationPlaying = false;
}

function installAnimationClips(target, sourceClips, fileName) {
  const compatible = compatibleAnimationClips(target, sourceClips);
  stopAnimationPlayback();
  mixer?.stopAllAction();
  animationRoot = target;
  clips = compatible;
  mixer = new THREE.AnimationMixer(target);
  animationAction = mixer.clipAction(clips[0]);
  animationFileName = fileName;
  $("animation-mode").value = "clip";
  refreshAnimationControls();
  render();
  toast(`${clips.length} animation(s) importée(s) : ${fileName}`);
}

function setModel(loaded, name) {
  stopAnimationPlayback();
  model = loaded.root;
  clips = loaded.animations;
  animationRoot = loaded.animatedRoot;
  model.userData.animationRoot = animationRoot;
  animationFileName = clips.length ? name : null;
  mixer = clips.length ? new THREE.AnimationMixer(animationRoot) : null;
  animationAction = mixer?.clipAction(clips[0]) || null;
  scene.setModel(model);
  $("model-name").textContent = name;
  $("empty").hidden = true;
  refreshAnimationControls();
  render();
}

async function openPath(filePath) {
  try {
    $("status").textContent = "CHARGEMENT…";
    const bytes = await window.asciiAPI.readModel(filePath);
    const file = new File([bytes], filePath.split(/[\\/]/).pop());
    setModel(await loadModel(file), file.name);
    toast(`Modèle chargé : ${file.name}${clips.length ? ` · ${clips.length} animation(s)` : ""}`);
  } catch (error) {
    $("status").textContent = "ERREUR DE CHARGEMENT";
    toast(`Impossible de charger le modèle : ${error.message}`);
  }
}

async function openFileDialog() {
  try {
    const filePath = await window.asciiAPI.open();
    if (filePath) await openPath(filePath);
  } catch (error) {
    toast(`Ouverture impossible : ${error.message}`);
  }
}

function useSample() {
  setModel({root: makeSample(), animatedRoot: null, animations: []}, "specimen_01 · exemple intégré");
}

function animationSequenceOptions() {
  const framesPerSecond = Math.max(1, Math.min(60, Number($("animation-fps").value) || 12));
  const mode = $("animation-mode").value;
  if (mode === "clip") {
    if (!mixer || !clips.length) throw new Error("Importez une animation compatible avec le modèle.");
    const clip = clips[Number($("clip-select").value) || 0];
    if (!clip || clip.duration <= 0) throw new Error("Durée d’animation invalide.");
    const count = Math.ceil(clip.duration * framesPerSecond);
    if (count > 120) throw new Error(`Cette animation produirait ${count} images. Réduisez les images/s (maximum 120 images par feuille).`);
    return {mode, framesPerSecond, count: Math.max(1, count), duration: clip.duration, clip};
  }
  const count = Math.max(2, Math.min(120, Number($("turntable-frames").value) || 12));
  return {mode, framesPerSecond, count, duration: count / framesPerSecond};
}

async function exportSpriteSheet() {
  if (!frame || !model) return toast("Chargez un modèle avant l’export.");
  let options;
  try {
    options = animationSequenceOptions();
  } catch (error) {
    return toast(error.message);
  }
  const button = $("turntable");
  const cameraMode = $("export-camera").value;
  const exportSettings = {...settings};
  const modelName = $("model-name").textContent;
  const originalRotation = model.rotation.clone();
  const originalPosition = model.position.clone();
  const originalTime = mixer?.time ?? 0;
  const wasAnimationPlaying = animationPlaying;
  if (animationPlaying) stopAnimationPlayback();
  button.disabled = true;
  $("export").disabled = true;
  $("open").disabled = true;
  $("sample").disabled = true;
  exporting = true;
  statusBeforeExport = $("status").textContent;
  statusOverride = "GÉNÉRATION DE LA SPRITE SHEET…";
  exportMessage = message => { statusOverride = message; $("status").textContent = message; };
  exportMessage("GÉNÉRATION DE LA SPRITE SHEET…");
  const captures = [];
  let captureCamera;
  try {
    const captureHeight = Math.max(1, Math.round(exportSettings.width * exportSettings.ratio));
    captureCamera = createExportCamera(cameraMode, scene.camera, model, exportSettings.width, captureHeight, glyphAspect);
    if (options.mode === "clip") {
      mixer.stopAllAction();
      mixer.clipAction(options.clip).reset().play();
    }
    for (let index = 0; index < options.count; index++) {
      const time = options.mode === "clip" ? index / options.framesPerSecond : index * 360 / options.count;
      if (options.mode === "clip") mixer.setTime(time);
      else model.rotation.y = originalRotation.y + time * Math.PI / 180;
      scene.renderer.setClearColor(exportSettings.bg === "white" ? 0xffffff : 0x080b08, exportSettings.bg === "transparent" ? 0 : 1);
      scene.render();
      const result = scene.renderToGrid(exportSettings.width, exportSettings.ratio, captureCamera);
      const asciiFrame = convertPixels(result.pixels, result.width, result.height, exportSettings);
      const image = drawPng(document.createElement("canvas"), asciiFrame, Math.min(12, Math.max(5, 700 / (exportSettings.width * glyphAspect))));
      captures.push({canvas: image, time: options.mode === "clip" ? time : index / options.framesPerSecond, angle: options.mode === "turntable" ? Math.round(index * 360 / options.count) : undefined});
      exportMessage(`IMAGE ${index + 1} / ${options.count}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    exportMessage("ASSEMBLAGE DE LA SPRITE SHEET…");
    const sheet = composeSpriteSheet(captures);
    exportMessage("ENCODAGE PNG…");
    const blob = await canvasToPng(sheet.canvas);
    exportMessage("PRÉPARATION DES DONNÉES…");
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const metadata = {
      version: 1,
      format: "ascii3d-spritesheet",
      source: modelName,
      camera: {
        mode: cameraMode,
        projection: captureCamera.isOrthographicCamera ? "orthographic" : "perspective",
        position: captureCamera.position.toArray(),
        quaternion: captureCamera.quaternion.toArray(),
        aspect: exportSettings.width * glyphAspect / captureHeight,
        ...(captureCamera.isPerspectiveCamera ? {fov: captureCamera.fov} : {left: captureCamera.left, right: captureCamera.right, top: captureCamera.top, bottom: captureCamera.bottom})
      },
      animation: options.mode,
      clip: options.clip?.name || null,
      fps: options.framesPerSecond,
      duration: options.duration,
      frameCount: captures.length,
      columns: sheet.columns,
      rows: sheet.rows,
      frameSize: {width: sheet.cellWidth, height: sheet.cellHeight},
      frames: captures.map(({time, angle, rect}) => ({time, ...(angle === undefined ? {} : {angle}), ...rect})),
      settings: exportSettings
    };
    exportMessage("OUVERTURE DU DIALOGUE D’ENREGISTREMENT…");
    const saved = await window.asciiAPI.saveSpriteSheet(pngBytes, metadata);
    if (!saved) {
      exportMessage("EXPORT ANNULÉ");
      return;
    }
    exportMessage(`${captures.length} IMAGES EXPORTÉES`);
    toast(`Sprite sheet enregistrée : ${saved.pngPath}`);
    statusBeforeExport = `${captures.length} IMAGES EXPORTÉES`;
  } catch (error) {
    toast(`Export sprite sheet impossible : ${error.message}`);
    exportMessage("ERREUR D’EXPORT");
  } finally {
    if (model) {
      model.rotation.copy(originalRotation);
      model.position.copy(originalPosition);
    }
    if (mixer) {
      mixer.stopAllAction();
      mixer.setTime(originalTime);
      if (wasAnimationPlaying) {
        animationAction = mixer.clipAction(clips[Number($("clip-select").value) || 0]).play();
        animationClock = new THREE.Clock();
        animationClock.start();
        animationPlaying = true;
        animationLoop = requestAnimationFrame(function tick() {
          if (!animationPlaying) return;
          mixer.update(Math.min(animationClock.getDelta(), 0.1));
          render();
          animationLoop = requestAnimationFrame(tick);
        });
      } else if (options.mode === "clip") {
        animationAction = mixer.clipAction(options.clip).play();
      }
    }
    scene.setBackground(settings.bg);
    exporting = false;
    queued = false;
    exportMessage = null;
    statusOverride = null;
    button.disabled = false;
    $("export").disabled = false;
    $("open").disabled = false;
    $("sample").disabled = false;
    $("status").textContent = statusBeforeExport;
    render();
  }
}

$("open").addEventListener("click", openFileDialog);
$("sample").addEventListener("click", useSample);
$("empty-sample").addEventListener("click", useSample);
$("import-animation").addEventListener("click", async () => {
  if (!model) return toast("Chargez d’abord le modèle 3D auquel associer l’animation.");
  try {
    const filePath = await window.asciiAPI.openAnimation();
    if (!filePath) return;
    const bytes = await window.asciiAPI.readModel(filePath);
    const file = new File([bytes], filePath.split(/[\\/]/).pop());
    const loaded = await loadModel(file, {animationsOnly: true});
    const targetRoot = model.userData.animationRoot || animationRoot;
    installAnimationClips(targetRoot, loaded.animations, file.name);
  } catch (error) {
    toast(`Import d’animation impossible : ${error.message}`);
  }
});
$("play-animation").addEventListener("click", () => {
  if (!mixer || !clips.length) return;
  if (animationPlaying) {
    stopAnimationPlayback();
    refreshAnimationControls();
    return;
  }
  const selectedClip = clips[Number($("clip-select").value) || 0];
  animationAction = mixer.clipAction(selectedClip);
  animationAction.reset().play();
  animationClock = new THREE.Clock();
  animationClock.start();
  animationPlaying = true;
  const tick = () => {
    if (!animationPlaying) return;
    mixer.update(Math.min(animationClock.getDelta(), 0.1));
    render();
    animationLoop = requestAnimationFrame(tick);
  };
  refreshAnimationControls();
  animationLoop = requestAnimationFrame(tick);
});
$("clip-select").addEventListener("change", () => {
  if (!mixer) return;
  const selectedClip = clips[Number($("clip-select").value) || 0];
  mixer.stopAllAction();
  animationAction = mixer.clipAction(selectedClip).reset();
  if (animationPlaying) animationAction.play();
  render();
});
$("export").addEventListener("click", exportSpriteSheet);
$("turntable").addEventListener("click", exportSpriteSheet);
$("animation-mode").addEventListener("change", refreshAnimationControls);

for (const element of document.querySelectorAll(".control-section input, .control-section select")) {
  const update = () => {
    try {
      readSettings();
      render();
    } catch (error) {
      toast(`Réglage invalide : ${error.message}`);
    }
  };
  element.addEventListener("input", update);
  element.addEventListener("change", update);
}

$("preset-save").addEventListener("click", async () => {
  try {
    const filePath = await window.asciiAPI.presetSave(JSON.stringify(settings, null, 2));
    if (filePath) toast("Préréglage enregistré.");
  } catch (error) {
    toast(`Sauvegarde du préréglage impossible : ${error.message}`);
  }
});

$("preset-open").addEventListener("click", async () => {
  try {
    const text = await window.asciiAPI.presetOpen();
    if (!text) return;
    settings = parsePreset(text);
    for (const [key, value] of Object.entries(settings)) {
      const element = $(key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`));
      if (element) element.type === "checkbox" ? element.checked = value : element.value = value;
    }
    readSettings();
    render();
    toast("Préréglage chargé.");
  } catch (error) {
    toast(`Chargement du préréglage impossible : ${error.message}`);
  }
});

scene.onChange = render;
if (!window.asciiAPI) {
  toast("Interface Electron indisponible : le preload n’a pas été chargé.");
  throw new Error("window.asciiAPI is not available");
}
window.asciiAPI.onOpen(openPath);
window.asciiAPI.ready();
window.asciiAPI.onMenu(action => {
  if (action === "open") openFileDialog();
  if (action === "export") exportSpriteSheet();
});

window.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
    event.preventDefault();
    openFileDialog();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    exportSpriteSheet();
  }
  if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "e") useSample();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && frame) {
    navigator.clipboard.writeText(frame.text).then(() => toast("ASCII copié."), error => toast(`Copie impossible : ${error.message}`));
  }
});

const dropzone = $("dropzone");
window.addEventListener("dragenter", event => {
  event.preventDefault();
  dropzone.hidden = false;
});
window.addEventListener("dragover", event => event.preventDefault());
window.addEventListener("dragleave", event => {
  if (event.target === document.documentElement) dropzone.hidden = true;
});
window.addEventListener("drop", async event => {
  event.preventDefault();
  dropzone.hidden = true;
  const file = event.dataTransfer.files[0];
  if (!file) return;
  try {
    $("status").textContent = "CHARGEMENT…";
    const loaded = await loadModel(file);
    setModel(loaded, file.name);
  } catch (error) {
    $("status").textContent = "ERREUR DE CHARGEMENT";
    toast(`Impossible de charger le modèle : ${error.message}`);
  }
});

try {
  readSettings();
  refreshAnimationControls();
  scene.render();
} catch (error) {
  toast(`Initialisation impossible : ${error.message}`);
}
