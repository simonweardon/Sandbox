// Renderer, camera, lighting and sky.

import * as THREE from '../../vendor/three.module.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createScene(mapSize) {
  const scene = new THREE.Scene();
  const haze = new THREE.Color(0x8e9aa4);
  scene.background = haze;
  // Far enough out that it reads as distance rather than as a filter over the
  // whole battlefield.
  scene.fog = new THREE.Fog(haze, mapSize * 0.9, mapSize * 2.4);

  // A low autumn sun: long shadows, warm key, cool fill from the sky.
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
  sun.position.set(-0.5, 1, 0.35).normalize().multiplyScalar(mapSize);
  sun.castShadow = true;
  const s = mapSize * 0.32;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = mapSize * 0.4;
  sun.shadow.camera.far = mapSize * 2.2;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(new THREE.HemisphereLight(0xbcd0e0, 0x4a4632, 1.15));

  return { scene, sun };
}

/** Keep the shadow frustum around the camera rather than the whole map. */
export function focusShadow(sun, x, z, mapSize) {
  sun.target.position.set(x, 0, z);
  sun.position.set(x - mapSize * 0.5, mapSize * 1.0, z + mapSize * 0.35);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

export function createCamera(aspect) {
  const cam = new THREE.PerspectiveCamera(48, aspect, 0.6, 3000);
  cam.position.set(0, 90, 90);
  return cam;
}
