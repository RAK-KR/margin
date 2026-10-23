import * as THREE from 'three';
import { GS } from '../core/state.js?v=35';
import { _v4 } from '../core/utils.js?v=35';

// =====================================================================
//  월드 / 충돌
// =====================================================================
GS.boxes = [];       // 충돌용 AABB
GS.hittables = [];   // 레이캐스트 대상 메시
GS.enemies = [], GS.loots = [], GS.fallers = [], GS.crates = [];
GS.extraction = null;
const matCache = new Map();
function wallMat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return matCache.get(color);
}
function addBox(x, z, w, d, h, color, y0 = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat(color));
  m.position.set(x, y0 + h / 2, z); m.userData = { world: true };
  GS.world.add(m); GS.hittables.push(m);
  GS.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y0, maxY: y0 + h });
  return m;
}
function crate(x, z, color = 0x7a6646, s = 1.2, y0 = 0) { return addBox(x, z, s, s, s, color, y0); }
function removeHittables(list) { const set = new Set(list); GS.hittables = GS.hittables.filter(m => !set.has(m)); }

function hitsBoxXZ(b, x, z, r) { return x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ; }
// 축 분리 이동 + 충돌
function moveWithCollision(pos, dx, dz, r, feet, h, step) {
  if (dx) {
    pos.x += dx;
    for (const b of GS.boxes) {
      if (b.maxY <= feet + step || b.minY >= feet + h) continue;
      if (hitsBoxXZ(b, pos.x, pos.z, r)) pos.x = dx > 0 ? b.minX - r - 1e-4 : b.maxX + r + 1e-4;
    }
  }
  if (dz) {
    pos.z += dz;
    for (const b of GS.boxes) {
      if (b.maxY <= feet + step || b.minY >= feet + h) continue;
      if (hitsBoxXZ(b, pos.x, pos.z, r)) pos.z = dz > 0 ? b.minZ - r - 1e-4 : b.maxZ + r + 1e-4;
    }
  }
}
function groundAt(x, z, r, feet, step) {
  let g = 0;
  for (const b of GS.boxes) if (b.maxY <= feet + step + 1e-3 && hitsBoxXZ(b, x, z, r)) g = Math.max(g, b.maxY);
  return g;
}
// 선분-AABB 교차 (거리 반환, 없으면 -1)
function segBox(o, d, len, b) {
  let tmin = 0, tmax = len;
  const mins = [b.minX, b.minY, b.minZ], maxs = [b.maxX, b.maxY, b.maxZ], os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-9) { if (os[i] < mins[i] || os[i] > maxs[i]) return -1; }
    else {
      let t1 = (mins[i] - os[i]) / ds[i], t2 = (maxs[i] - os[i]) / ds[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
function segBlocked(a, b) {
  _v4.subVectors(b, a); const len = _v4.length(); if (len < 1e-4) return false; _v4.divideScalar(len);
  for (const bx of GS.boxes) if (segBox(a, _v4, len, bx) >= 0) return true;
  return false;
}
function segFirstHit(a, dir, len) {
  let best = -1;
  for (const bx of GS.boxes) { const t = segBox(a, dir, len, bx); if (t >= 0 && (best < 0 || t < best)) best = t; }
  return best;
}

export { addBox, crate, groundAt, hitsBoxXZ, moveWithCollision, removeHittables, segBlocked, segFirstHit };
