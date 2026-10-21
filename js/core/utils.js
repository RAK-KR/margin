import * as THREE from 'three';

// =====================================================================
//  유틸
// =====================================================================
const TEST = new URLSearchParams(location.search).has('test');
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = n => (n === Infinity ? '∞' : Math.round(n).toLocaleString('en-US'));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v1 = V3(), _v2 = V3(), _v3 = V3(), _v4 = V3();
const _box = new THREE.Box3();
const textCache = new Map();
function setText(el, s) { if (textCache.get(el) !== s) { textCache.set(el, s); el.textContent = s; } }
function setHTML(el, s) { if (textCache.get(el) !== s) { textCache.set(el, s); el.innerHTML = s; } }

export { $, TEST, V3, _box, _v1, _v2, _v3, _v4, angDiff, clamp, fmt, lerp, rand, setHTML, setText };
