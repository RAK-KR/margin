import * as THREE from 'three';
import { V3, _v1, rand } from '../core/utils.js?v=37';
import { GLOW, scene } from '../core/renderer.js?v=37';

// =====================================================================
//  이펙트
// =====================================================================
const FX = { sparks: [], flashes: [], debris: [], tracers: [], projs: [], beams: [] };
const sparkGeo = new THREE.BoxGeometry(0.022, 0.022, 0.13);
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
const tracerGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 4, 1, true); tracerGeo.translate(0, 0.5, 0);
const projGeo = new THREE.SphereGeometry(1, 8, 6);
const UPY = V3(0, 1, 0);
function poolGet(pool, max, make) {
  for (const o of pool) if (!o.alive) return o;
  if (pool.length < max) { const o = make(); pool.push(o); return o; }
  pool.cursor = ((pool.cursor || 0) + 1) % pool.length; return pool[pool.cursor];
}
function spawnSpark(pos, dir, color = 0xffb050, speed = 6, life = 0.35) {
  const s = poolGet(FX.sparks, 220, () => {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(m); return { mesh: m, vel: V3() };
  });
  s.alive = true; s.life = s.max = life * rand(0.6, 1.2); s.mesh.visible = true;
  s.mesh.material.color.setHex(color); s.mesh.position.copy(pos);
  s.vel.copy(dir).multiplyScalar(speed * rand(0.4, 1.2));
}
function spawnFlash(pos, size = 0.35, life = 0.06, color = 0xffd9a0) {
  const f = poolGet(FX.flashes, 40, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(sp); return { mesh: sp };
  });
  f.alive = true; f.life = f.max = life; f.size = size; f.mesh.visible = true; f.mesh.position.copy(pos);
  f.mesh.material.color.setHex(color); f.mesh.scale.setScalar(size);
}
const _dbo = V3();
function spawnDebris(pos, color, n = 3, power = 3) {
  for (let i = 0; i < n; i++) {
    const d = poolGet(FX.debris, 140, () => {
      const m = new THREE.Mesh(debrisGeo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
      scene.add(m); return { mesh: m, vel: V3(), ang: V3() };
    });
    d.alive = true; d.life = d.max = rand(2.2, 3.4); d.mesh.visible = true;
    d.mesh.material.color.setHex(color); d.s = rand(0.04, 0.12); d.mesh.scale.set(d.s, d.s * rand(0.5, 1.2), d.s * rand(0.6, 1.4));
    d.mesh.position.copy(pos).add(_dbo.set(rand(-.1, .1), rand(-.1, .1), rand(-.1, .1)));
    d.vel.set(rand(-1, 1), rand(0.4, 1.4), rand(-1, 1)).multiplyScalar(power);
    d.ang.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
  }
}
function spawnTracer(from, to, color = 0xffd28a, life = 0.07) {
  const t = poolGet(FX.tracers, 40, () => {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(m); return { mesh: m };
  });
  _v1.subVectors(to, from); const len = _v1.length(); if (len < 0.01) return;
  t.alive = true; t.life = t.max = life; t.mesh.visible = true; t.mesh.material.color.setHex(color);
  t.mesh.position.copy(from); t.mesh.scale.set(1, len, 1);
  t.mesh.quaternion.setFromUnitVectors(UPY, _v1.normalize());
}
const muzzleLight = new THREE.PointLight(0xffc070, 0, 9, 2); scene.add(muzzleLight);
const blastLight = new THREE.PointLight(0xff9040, 0, 22, 1.6); scene.add(blastLight);
const _bsA = V3(), _bsB = V3(), _bsP = V3(), _bsN = V3();
const beamGeo = new THREE.CylinderGeometry(1, 0.12, 1, 12, 1, true), _bd = V3(), _bf = V3();
function spawnBeam(from, to, r, full) {
  _bd.copy(to).sub(from).normalize(); from = _bf.copy(from).addScaledVector(_bd, 0.7);
  const len = from.distanceTo(to); if (len < 0.05) return;
  const mk = (rad, col, op) => {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(from).add(to).multiplyScalar(0.5); m.scale.set(rad, len, rad); m.quaternion.setFromUnitVectors(UPY, _bd); scene.add(m); return m;
  };
  FX.beams.push({ meshes: [mk(r, 0x5ac8ff, full ? 0.6 : 0.45), mk(r * 0.38, 0xffffff, 0.95)], t: 0, life: full ? 0.55 : 0.22, r, full, op: [full ? 0.6 : 0.45, 0.95] });
}
function burstSparks(pos, normal, n, color = 0xffb050, speed = 6) {
  _bsP.copy(pos); _bsN.copy(normal);
  for (let i = 0; i < n; i++) {
    _bsA.copy(_bsN).add(_bsB.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).multiplyScalar(0.9)).normalize();
    spawnSpark(_bsP, _bsA, color, speed);
  }
}
function updateFX(dt) {
  for (const s of FX.sparks) if (s.alive) {
    s.life -= dt; if (s.life <= 0) { s.alive = false; s.mesh.visible = false; continue; }
    s.vel.y -= 9 * dt; s.mesh.position.addScaledVector(s.vel, dt);
    _v1.copy(s.mesh.position).add(s.vel); s.mesh.lookAt(_v1);
    s.mesh.material.opacity = s.life / s.max;
  }
  for (const f of FX.flashes) if (f.alive) {
    f.life -= dt; if (f.life <= 0) { f.alive = false; f.mesh.visible = false; continue; }
    const k = f.life / f.max; f.mesh.material.opacity = k; f.mesh.scale.setScalar(f.size * (1.3 - 0.3 * k));
  }
  for (const d of FX.debris) if (d.alive) {
    d.life -= dt; if (d.life <= 0) { d.alive = false; d.mesh.visible = false; continue; }
    d.vel.y -= 16 * dt; d.mesh.position.addScaledVector(d.vel, dt);
    d.mesh.rotation.x += d.ang.x * dt; d.mesh.rotation.y += d.ang.y * dt; d.mesh.rotation.z += d.ang.z * dt;
    if (d.mesh.position.y < d.s * 0.5) { d.mesh.position.y = d.s * 0.5; d.vel.y *= -0.3; d.vel.x *= 0.6; d.vel.z *= 0.6; d.ang.multiplyScalar(0.5); }
    if (d.life < 0.5) d.mesh.scale.setScalar(d.s * d.life / 0.5);
  }
  for (const t of FX.tracers) if (t.alive) {
    t.life -= dt; if (t.life <= 0) { t.alive = false; t.mesh.visible = false; continue; }
    t.mesh.material.opacity = t.life / t.max;
  }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 400);
  blastLight.intensity = Math.max(0, blastLight.intensity - dt * 260);
}
function updateBeams(dt) {
  for (let i = FX.beams.length - 1; i >= 0; i--) {
    const b = FX.beams[i]; b.t += dt; const k = b.t / b.life;
    b.meshes.forEach((m, j) => { m.material.opacity = b.op[j] * Math.max(0, 1 - k); const g = b.full ? 1 + 1.4 * k : 1 - 0.5 * k; m.scale.x = m.scale.z = b.r * (j ? 0.38 : 1) * g; });
    if (k >= 1) { for (const m of b.meshes) { scene.remove(m); m.material.dispose(); } FX.beams.splice(i, 1); }
  }
}
function clearFX() {
  for (const b of FX.beams) for (const m of b.meshes) { scene.remove(m); m.material.dispose(); } FX.beams.length = 0;
  for (const k of ['sparks', 'flashes', 'debris', 'tracers', 'projs']) for (const o of FX[k]) { o.alive = false; o.mesh.visible = false; }
  muzzleLight.intensity = 0; blastLight.intensity = 0; blastLight.color.setHex(0xff9040);
}

export { FX, UPY, blastLight, burstSparks, clearFX, muzzleLight, poolGet, projGeo, spawnBeam, spawnDebris, spawnFlash, spawnSpark, spawnTracer, updateBeams, updateFX };
