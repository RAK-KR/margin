import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GS } from './state.js?v=32';
import { $ } from './utils.js?v=32';

// =====================================================================
//  렌더러 / 씬
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
$('game').appendChild(renderer.domElement);

const BASE_FOV = 72;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 260);
camera.rotation.order = 'YXZ';
scene.add(camera);
const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = GS.save.sens;
GS.world = new THREE.Group(); scene.add(GS.world);

// 1인칭 무기 전용 씬
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3630, 2.0));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.8); vmSun.position.set(1, 2, 1.5); vmScene.add(vmSun);
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
});

// 공용 텍스처
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,230,180,.85)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();
function groundTexture(base, line) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = Math.random(); g.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.08})` : `rgba(0,0,0,${v * 0.14})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}

export { BASE_FOV, GLOW, camera, controls, groundTexture, renderer, scene, vmCam, vmRoot, vmScene };
