import * as THREE from "../../node_modules/three/build/three.module.js";
import {glyphAspect, imageHeight} from "../core/ascii.js";

export {THREE};

export function createExportCamera(mode, sourceCamera, model, width, height, characterAspect = glyphAspect) {
  const aspect = width * characterAspect / height;
  if (mode === 'preview') {
    sourceCamera.updateMatrixWorld(true);
    const camera = sourceCamera.clone();
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    return camera;
  }
  model?.updateMatrixWorld(true);
  const bounds = model ? new THREE.Box3().setFromObject(model) : new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.01);
  const direction = new THREE.Vector3(1, 1, 1).normalize();
  const distance = Math.max(radius * 4, 3);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, distance + radius * 8);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const margin = 1.12;
  const halfHeight = Math.max(radius, radius / aspect) * margin;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.near = Math.max(0.01, distance - radius * 2);
  camera.far = distance + radius * 2;
  camera.updateProjectionMatrix();
  return camera;
}

export class SceneView {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
    this.camera.position.set(0, 0.35, 4.3);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    host.append(this.renderer.domElement);
    this.target = new THREE.WebGLRenderTarget(120, 60, {type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.SRGBColorSpace, depthBuffer: true, stencilBuffer: false});
    this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x17212a, 1.8);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.keyLight.position.set(3, 4, 5);
    this.scene.add(this.ambientLight, this.keyLight);
    this.transparentBackground = false;
    this.backgroundRgb = [8, 11, 8];
    this.renderer.setClearColor(0x080b08, 1);
    this.model = null;
    this.wire = false;
    this.drag = null;
    this.onChange = null;
    this.bind();
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.onChange?.();
    });
    this.resizeObserver.observe(host);
    this.resize();
  }

  setModel(object) {
    if (this.model) this.scene.remove(this.model);
    this.model = object;
    this.scene.add(object);
    this.setWire(this.wire);
    const bounds = new THREE.Box3().setFromObject(object);
    if (!bounds.isEmpty()) {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const distance = Math.max(3.8, sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.15);
      this.camera.position.set(0, sphere.center.y + sphere.radius * 0.18, distance);
      this.camera.lookAt(sphere.center);
      this.camera.near = Math.max(0.001, distance / 1000);
      this.camera.far = Math.max(100, distance * 10);
      this.camera.updateProjectionMatrix();
    }
    this.onChange?.();
  }

  setWire(enabled) {
    this.wire = enabled;
    this.model?.traverse(object => {
      if (!object.material) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ('wireframe' in material) material.wireframe = enabled;
      }
    });
  }

  setLight(value) {
    this.ambientLight.intensity = 1.8 * value;
    this.keyLight.intensity = 2.2 * value;
  }

  setBackground(mode) {
    this.transparentBackground = mode === 'transparent';
    this.backgroundRgb = mode === 'white' ? [255, 255, 255] : [8, 11, 8];
    this.renderer.setClearColor(mode === 'white' ? 0xffffff : 0x080b08, this.transparentBackground ? 0 : 1);
  }

  resize() {
    const bounds = this.host.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = Math.max(0.1, width / height);
    this.camera.updateProjectionMatrix();
  }

  captureCamera(mode, width, height, characterAspect = glyphAspect) {
    return createExportCamera(mode, this.camera, this.model, width, height, characterAspect);
  }

  renderToGrid(width, ratio, camera = this.camera) {
    const height = imageHeight(width, ratio);
    const savedAspect = camera.aspect;
    const savedProjection = camera.projectionMatrix.clone();
    if (camera.isPerspectiveCamera) {
      camera.aspect = width * glyphAspect / height;
      camera.updateProjectionMatrix();
    }
    this.target.setSize(width, height);
    try {
      this.renderer.setRenderTarget(this.target);
      this.renderer.setClearColor(this.transparentBackground ? 0x000000 : this.backgroundRgb[0] << 16 | this.backgroundRgb[1] << 8 | this.backgroundRgb[2], this.transparentBackground ? 0 : 1);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, camera);
      const pixels = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(this.target, 0, 0, width, height, pixels);
      if (this.transparentBackground) {
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] / 255;
          pixels[index] = Math.round(pixels[index] * alpha + this.backgroundRgb[0] * (1 - alpha));
          pixels[index + 1] = Math.round(pixels[index + 1] * alpha + this.backgroundRgb[1] * (1 - alpha));
          pixels[index + 2] = Math.round(pixels[index + 2] * alpha + this.backgroundRgb[2] * (1 - alpha));
          pixels[index + 3] = 255;
        }
      }
      const flipped = new Uint8Array(pixels.length);
      for (let y = 0; y < height; y++) flipped.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), (height - y - 1) * width * 4);
      return {pixels: flipped, width, height};
    } finally {
      this.renderer.setRenderTarget(null);
      if (camera.isPerspectiveCamera && camera.aspect !== savedAspect) {
        camera.aspect = savedAspect;
        camera.projectionMatrix.copy(savedProjection);
        camera.projectionMatrixInverse.copy(savedProjection).invert();
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  bind() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    canvas.addEventListener("pointerdown", event => {
      this.drag = {x: event.clientX, y: event.clientY, button: event.button};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      if (this.drag.button === 0 && this.model) {
        this.model.rotation.y += dx * 0.008;
        this.model.rotation.x += dy * 0.008;
      } else {
        this.camera.position.x -= dx * 0.007;
        this.camera.position.y += dy * 0.007;
      }
      this.onChange?.();
    });
    canvas.addEventListener("pointerup", () => { this.drag = null; });
    canvas.addEventListener("pointercancel", () => { this.drag = null; });
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      this.camera.position.multiplyScalar(event.deltaY > 0 ? 1.08 : 0.92);
      this.onChange?.();
    }, {passive: false});
  }
}
