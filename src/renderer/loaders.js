import * as THREE from "../../node_modules/three/build/three.module.js";
import {GLTFLoader} from "../../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import {OBJLoader} from "../../node_modules/three/examples/jsm/loaders/OBJLoader.js";
import {STLLoader} from "../../node_modules/three/examples/jsm/loaders/STLLoader.js";
import {FBXLoader} from "../../node_modules/three/examples/jsm/loaders/FBXLoader.js";

export async function loadModel(file, options = {}) {
  const extension = file.name.split(".").pop().toLowerCase();
  const url = URL.createObjectURL(file);
  try {
    let animatedRoot;
    let animations = [];
    if (extension === "glb" || extension === "gltf") {
      const gltf = await new GLTFLoader().loadAsync(url);
      animatedRoot = gltf.scene;
      animations = gltf.animations;
      if (options.animationsOnly) return {animatedRoot, animations};
    } else if (extension === "obj") {
      animatedRoot = new OBJLoader().parse(await file.text());
    } else if (extension === "stl") {
      const geometry = await new STLLoader().loadAsync(url);
      animatedRoot = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: 0xb8c7c1, roughness: 0.7}));
    } else if (extension === "fbx") {
      animatedRoot = await new FBXLoader().loadAsync(url);
      animations = animatedRoot.animations || [];
      if (options.animationsOnly) return {animatedRoot, animations};
    } else {
      throw new Error(`Format .${extension} non pris en charge. Formats : glb, gltf, obj, stl, fbx.`);
    }
    const root = normalizeModel(animatedRoot);
    return {root, animatedRoot, animations};
  } catch (error) {
    throw new Error(`Impossible de charger ${file.name} : ${error.message}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function compatibleAnimationClips(target, sourceClips) {
  const compatible = sourceClips.filter(clip => clip.tracks.length && clip.tracks.every(track => {
    try {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      return Boolean(THREE.PropertyBinding.findNode(target, parsed.nodeName));
    } catch {
      return false;
    }
  }));
  if (!compatible.length) throw new Error("Les animations importées ne correspondent pas aux os ou aux noms de nœuds du modèle. Utilisez une animation exportée pour ce même rig.");
  return compatible;
}

export function normalizeModel(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) throw new Error("Le modèle ne contient aucune géométrie");
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z, 1e-6);
  const root = new THREE.Group();
  root.position.copy(center).multiplyScalar(-scale);
  root.scale.setScalar(scale);
  root.add(object);
  root.updateMatrixWorld(true);
  return root;
}
