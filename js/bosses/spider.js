import * as THREE from 'three';
import { GS } from '../core/state.js?v=36';
import { V3, _v1, _v2, angDiff, clamp, lerp, rand } from '../core/utils.js?v=36';
import { ETYPES } from '../data/data.js?v=36';
import { SFX } from '../core/audio.js?v=36';
import { addBox, crate, groundAt, hitsBoxXZ, moveWithCollision, segBlocked } from '../world/world.js?v=36';
import { UPY, blastLight, burstSparks, projGeo, spawnDebris, spawnFlash } from '../fx/effects.js?v=36';
import { player } from '../player/playerState.js?v=36';
import { addAmmoCrate, addExtraction, setEnv } from '../world/missions.js?v=36';
import { sensorMult } from '../combat/damage.js?v=36';
import { markerGeo, partTick, spawnShock } from './rex.js?v=36';
import { _box3, dummyGlow, partKit, spawnDrone } from '../enemies/extra.js?v=36';
import { coopEv, dmgTargets, hurtTarget, isHost, knockTarget, spiderPose, v3a } from '../modes/coop.js?v=36';
import { killEnemy } from '../meta/achievements.js?v=36';
import { addFeed, popup } from '../ui/hud.js?v=36';

// =====================================================================
//  최종 보스 III: ARACHNE 거미 전차
// =====================================================================
const SPI = { L1: 2.6, L2: 3.4, standH: 3.3, hips: [[1.3, 1.1, 0.75], [1.4, 0.2, 0.08], [1.3, -0.7, -0.6]] };
function legIK(L, R, h) {
  const d = clamp(Math.hypot(R, h), 0.6, L.L1 + L.L2 - 0.05), a = Math.atan2(-h, R);
  const c1 = clamp((L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d), -1, 1);
  const c2 = clamp((L.L1 * L.L1 + L.L2 * L.L2 - d * d) / (2 * L.L1 * L.L2), -1, 1);
  L.fp.rotation.z = a + Math.acos(c1);
  L.kp.rotation.z = -(Math.PI - Math.acos(c2));
}
function buildSpider() {
  const cfg = ETYPES.spider, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = {}, { P, M } = partKit(cfg, parts, { core: '복부 장갑', reactor: '동력로', head: '센서 머리' });
  const C = { main: 0x5c5a52, dark: 0x2a2a28, acc: 0xc77a2c, plate: 0x77746a };
  // 복부 (몸체 코어)
  const core = P('core', body);
  M(core, _box3(2.6, 1.1, 2.4), C.main, 0, 0, 0.6);
  M(core, _box3(2.2, 0.3, 2.0), C.plate, 0, 0.66, 0.6);
  const ab = M(core, new THREE.SphereGeometry(1, 14, 10), C.main, 0, 0.35, -2.2); ab.scale.set(1.9, 1.35, 2.4);
  for (const z of [-1.2, -2.2, -3.2]) M(core, _box3(2.6 - Math.abs(z + 2.2) * 0.5, 0.18, 0.5), C.acc, 0, 1.55 - Math.abs(z + 2.2) * 0.25, z);
  // 동력로 (복부 아래 뒤쪽 · 냉각구)
  const rc = P('reactor', body);
  M(rc, new THREE.SphereGeometry(0.62, 12, 10), 0x331100, 0, 0.1, -4.75, { emissive: 0xff7a1a, sub: '동력로 냉각구' });
  for (const s of [-1, 1]) M(rc, _box3(0.12, 0.9, 1.0), C.dark, s * 0.68, 0.1, -4.6);
  M(rc, _box3(1.2, 0.12, 1.0), C.dark, 0, 0.72, -4.6);
  // 센서 머리
  const hd = P('head', body);
  M(hd, _box3(1.3, 0.7, 0.8), C.dark, 0, 0.1, 2.1);
  const eyes = [];
  for (const [x, y, r] of [[-0.3, 0.25, 0.12], [0.3, 0.25, 0.12], [-0.45, 0.0, 0.08], [0.45, 0.0, 0.08]]) eyes.push(M(hd, new THREE.SphereGeometry(r, 8, 6), 0x220000, x, y, 2.5, { emissive: 0xff3020, sub: '광학 센서' }));
  for (const s of [-1, 1]) M(hd, _box3(0.16, 0.5, 0.5), C.acc, s * 0.32, -0.4, 2.55, { rx: 0.4 });
  // 박격포 포탑
  const tu = P('turret', body); tu.group.position.set(0, 0.95, -0.4);
  M(tu, new THREE.CylinderGeometry(0.8, 0.9, 0.5, 12), C.plate, 0, 0, 0);
  const tubes = new THREE.Group(); tubes.position.set(0, 0.35, 0); tu.group.add(tubes);
  for (const s of [-1, 1]) M(tu, new THREE.CylinderGeometry(0.2, 0.22, 1.4, 10), C.dark, s * 0.3, 0.55, 0.15, { rx: -0.6, parent: tubes });
  M(tu, _box3(0.5, 0.3, 0.4), C.acc, 0, 0.1, -0.5, { parent: tubes });
  // 드론 격납고
  const bay = P('bay', body);
  M(bay, _box3(1.3, 0.35, 1.2), C.dark, 0, 1.75, -2.4);
  M(bay, _box3(1.0, 0.06, 0.9), 0x113344, 0, 1.95, -2.4, { emissive: 0x3f8fd0, sub: '사출구' });
  // 다리 6개
  const legs = [];
  SPI.hips.forEach(([hx, hz, fan], i) => {
    for (const side of [1, -1]) {
      const id = side > 0 ? 'sl' + (i + 1) : 'sl' + (i + 4);
      const p = P(id, body); p.group.position.set(side * hx, -0.1, hz);
      const base = side > 0 ? -fan : Math.PI + fan; p.group.rotation.y = base;
      const fp = new THREE.Group(); p.group.add(fp);
      M(p, new THREE.SphereGeometry(0.42, 10, 8), C.dark, 0, 0, 0, { parent: fp });
      M(p, _box3(SPI.L1, 0.46, 0.46), C.main, SPI.L1 / 2, 0, 0, { parent: fp });
      M(p, _box3(SPI.L1 * 0.7, 0.12, 0.5), C.acc, SPI.L1 / 2, 0.29, 0, { parent: fp });
      const kp = new THREE.Group(); kp.position.set(SPI.L1, 0, 0); fp.add(kp);
      M(p, new THREE.SphereGeometry(0.36, 10, 8), 0x8a5a2a, 0, 0, 0, { parent: kp, hitMult: 1.15, exposed: true, sub: '무릎 관절' });
      M(p, _box3(SPI.L2, 0.34, 0.34), C.main, SPI.L2 / 2, 0, 0, { parent: kp });
      M(p, _box3(0.5, 0.2, 0.2), C.dark, SPI.L2, 0, 0, { parent: kp, rz: -0.6 });
      legs.push({ p, side, base, fan, idx: i, fp, kp, L1: SPI.L1, L2: SPI.L2, group: i % 2 === (side > 0 ? 0 : 1) ? 0 : 1 });
    }
  });
  for (const L of legs) legIK(L, 3.6, 3.2);
  body.position.y = SPI.standH;
  return { root, body, parts, legs, eyes, tubes, eyeY: 3.6, coreY: 3.3 };
}
function spawnSpider(x, z, yaw) {
  const r = buildSpider(), cfg = ETYPES.spider;
  const e = { type: 'spider', boss: true, spider: true, noPush: true, cfg, root: r.root, body: r.body, parts: r.parts, legs: r.legs, eyes: r.eyes, tubes: r.tubes,
    glow: dummyGlow(), eyeY: r.eyeY, coreY: r.coreY, yaw, homeYaw: yaw, home: V3(x, 0, z), alert: false, canSee: true, canShoot: true, lastSeen: V3(x, 0, z), lostT: 0, fireCd: 0,
    dead: false, stunT: 0, stunned: false, pendingAlert: 0, hitKick: 0, phase: 0, sparkT: 0, moveSpeed: 0, gait: 0, H: SPI.standH,
    bs: { state: 'idle', t: 0, cd: { stomp: 2, lunge: 5, mortar: 3, bay: 14, brood: 9 }, started: false, phase2: false, broken: 0, collapses: 0, empImmune: 0 } };
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  r.root.position.set(x, 0, z); r.root.rotation.y = yaw;
  const ring = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; GS.world.add(ring); e.bs.marker = ring;
  const lm = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  lm.rotation.x = -Math.PI / 2; lm.position.y = 0.05; GS.world.add(lm); e.bs.marker2 = lm;
  GS.world.add(r.root); GS.enemies.push(e);
  return e;
}
function spiderWorking(e, id) { const p = e.parts[id]; return p && p.attached && p.state !== 'destroyed' && p.state !== 'disabled'; }
function spiderExposed(e) { return ['collapse', 'stunned', 'land'].includes(e.bs.state); }
function spiderLegLost(e, p) {
  if (p.counted) return; p.counted = true;
  const B = e.bs; B.broken++;
  addFeed(`ARACHNE 다리 손실 · ${B.broken} / 6`, 'd');
  if ((B.broken === 3 || B.broken >= 6) && B.state !== 'collapse') {
    B.state = 'collapse'; B.t = B.broken >= 6 ? Infinity : 5.5; B.collapses++;
    SFX.explode(e.root.position.distanceTo(player.pos)); GS.shake = Math.max(GS.shake, 0.03);
    addFeed(B.broken >= 6 ? 'ARACHNE 완전 주저앉음 · 동력로 상시 노출' : 'ARACHNE 주저앉음 · 동력로 노출', 'x'); popup('주저앉음 · 동력로 노출', 'weak');
  }
}
function spiderShell(e, fixedTo) {
  const tu = e.parts.turret; tu.group.updateMatrixWorld(true);
  const from = e.tubes.getWorldPosition(V3()); from.y += 0.6;
  const sp = sensorMult(e) > 2 ? 6 : 1.8 + (e.bs.volley || 0) * 0.45;
  const to = fixedTo || V3(GS.tg.pos.x + GS.tg.vel.x * 0.8 + rand(-sp, sp), GS.tg.onGround ? GS.tg.pos.y + 0.03 : 0.03, GS.tg.pos.z + GS.tg.vel.z * 0.8 + rand(-sp, sp));
  const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffb04a }));
  mesh.scale.set(0.2, 0.2, 0.32); mesh.position.copy(from); GS.world.add(mesh);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.position.copy(to); GS.world.add(marker);
  GS.missiles.push({ mesh, marker, from, to, t: 0, T: 1.4 + from.distanceTo(to) / 40, h: 9 + from.distanceTo(to) * 0.15 });
  { const mm = GS.missiles[GS.missiles.length - 1]; coopEv({ t: 'mis', f: v3a(from), to: v3a(to), T: mm.T, h: mm.h, c: 0xffb04a, s: [0.2, 0.2, 0.32] }); }
  spawnFlash(from, 1, 0.08, 0xffb060); SFX.missile();
}
// ---------------- 자폭 거미 (ARACHNE가 방출) ----------------
function spiderBrood(e) {
  const pos = e.root.position, n = (e.bs.phase2 ? 4 : 3) + (GS.HARD ? 1 : 0);
  const bx = pos.x - Math.sin(e.yaw) * 2.2, bz = pos.z - Math.cos(e.yaw) * 2.2;
  for (let i = 0; i < n; i++) {
    const a = e.yaw + Math.PI + (i - (n - 1) / 2) * 0.55;
    spawnMite(bx + Math.sin(a) * 0.6, bz + Math.cos(a) * 0.6, { vx: Math.sin(a) * 4.5, vz: Math.cos(a) * 4.5, y: 1.6 });
  }
  spawnFlash(V3(bx, 1.4, bz), 2, 0.2, 0xff5a3a); SFX.shock(); addFeed(`ARACHNE 자폭 거미 ${n}기 방출 · 다가오기 전에 쏴서 부숴라`, 'k'); popup('자폭 거미 접근', 'bad');
}
function buildMite() {
  const cfg = ETYPES.mite, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = {}, { P, M } = partKit(cfg, parts, { core: '몸체' });
  const core = P('core', body);
  M(core, _box3(0.46, 0.22, 0.56), 0x3a3834, 0, 0.36, 0);
  M(core, _box3(0.3, 0.12, 0.2), 0x24221f, 0, 0.36, 0.34);
  const sac = M(core, new THREE.SphereGeometry(0.2, 10, 8), 0x330a06, 0, 0.55, -0.08, { emissive: 0xff3a1a, hitMult: 1.6, sub: '폭약 탱크' });
  const eye = M(core, _box3(0.16, 0.05, 0.03), 0x220000, 0, 0.4, 0.45, { emissive: 0xff5a2a, sub: '광학 센서' });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2826, flatShading: true }), legs = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.22, 0.36, sz * 0.18); body.add(piv);
    const l = new THREE.Mesh(_box3(0.42, 0.05, 0.05), legMat); l.position.set(sx * 0.2, -0.12, 0); l.rotation.z = -sx * 0.6; piv.add(l);
    legs.push(piv);
  }
  return { root, body, parts, sac, eye, legs };
}
function spawnMite(x, z, o = {}) {
  const r = buildMite(), cfg = ETYPES.mite;
  const e = { type: 'mite', mite: true, cfg, root: r.root, body: r.body, parts: r.parts, sac: r.sac, legs: r.legs, glow: dummyGlow(), eyeY: 0.4, coreY: 0.4,
    yaw: Math.atan2(o.vx || 0, o.vz || 1), home: V3(x, 0, z), alert: true, dead: false, stunT: 0, empT: 0, hitKick: 0, sparkT: 0, canShoot: false, canSee: true,
    lastSeen: V3(), pendingAlert: 0, fireCd: 0, burstLeft: 0, moveSpeed: 0, noReward: true, guard: false, life: 14, armT: 0, gait: rand(0, 6),
    vel: V3(o.vx || 0, 0, o.vz || 0), vy: o.y ? 3 : 0, hop: !!o.y };
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  r.root.position.set(x, o.y || 0, z); r.root.rotation.y = e.yaw; GS.world.add(r.root); GS.enemies.push(e);
  if (isHost() && GS.state === 'mission') coopEv({ t: 'spawnm', i: GS.enemies.length - 1, x, z });
  return e;
}
function animateMite(e, ms, dt) {
  e.gait += dt * (2 + ms * 3.2);
  e.legs.forEach((l, i) => { l.rotation.x = Math.sin(e.gait + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.55 * Math.min(1, ms / 2 + 0.15); });
  const blink = e.armT > 0 || e.armed ? (Math.sin(GS.time * 45) > 0 ? 1 : 0.15) : 0.55 + 0.25 * Math.sin(GS.time * 6 + e.gait);
  if (e.sac.userData.part.flash <= 0) e.sac.material.emissive.setHex(0xff3a1a).multiplyScalar(blink);
}
function miteBlast(e) {
  if (e.dead) return;
  const p = e.root.position.clone(); p.y += 0.4;
  const R = 3.4, dmg = 36;
  coopEv({ t: 'boom', p: v3a(p), R });
  SFX.explode(p.distanceTo(player.pos)); spawnFlash(p, R, 0.22, 0xff6a3a); burstSparks(p, UPY, 22, 0xff7a3a, 8); spawnDebris(p, 0x2a2826, 4, 4);
  blastLight.position.copy(p); blastLight.intensity = 60;
  for (const T of dmgTargets()) {
    const d = Math.hypot(T.pos.x - p.x, T.pos.z - p.z);
    if (d < R && Math.abs(T.pos.y + 0.8 - p.y) < 2.2) { hurtTarget(T, dmg * (1 - 0.6 * d / R), p, 'mite'); knockTarget(T, T.pos.x - p.x, T.pos.z - p.z, 6); }
  }
  if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 8) GS.shake = Math.max(GS.shake, 0.02);
  killEnemy(e, 'blast');
}
function updateMite(e, dt) {
  partTick(e, dt);
  const pos = e.root.position;
  e.life -= dt;
  if (e.hop) {
    e.vy -= 18 * dt; pos.y += e.vy * dt;
    moveWithCollision(pos, e.vel.x * dt, e.vel.z * dt, 0.3, Math.max(0, pos.y), 0.6, 0.3);
    if (pos.y <= 0) { pos.y = 0; e.hop = false; }
    animateMite(e, 3, dt); return;
  }
  if (e.armT > 0) { e.armT -= dt; animateMite(e, 0, dt); if (e.armT <= 0) miteBlast(e); return; }
  if (e.stunT > 0) { e.stunT -= dt; e.moveSpeed = 0; animateMite(e, 0, dt); return; }
  const dx = GS.tg.pos.x - pos.x, dz = GS.tg.pos.z - pos.z, dist = Math.hypot(dx, dz) || 0.001;
  if ((dist < 2.1 && Math.abs(GS.tg.pos.y - pos.y) < 2) || e.life <= 0) { e.armT = 0.45; SFX.armTick(); return; }
  const want = Math.atan2(dx, dz); e.yaw += clamp(angDiff(want, e.yaw), -7 * dt, 7 * dt); e.root.rotation.y = e.yaw;
  let mx = Math.sin(e.yaw), mz = Math.cos(e.yaw);
  for (const o of GS.enemies) if (o !== e && o.mite && !o.dead) {
    const ox = pos.x - o.root.position.x, oz = pos.z - o.root.position.z, od = Math.hypot(ox, oz);
    if (od < 1.1 && od > 0.01) { mx += ox / od * 0.8; mz += oz / od * 0.8; }
  }
  const ml = Math.hypot(mx, mz) || 1, sp = e.cfg.speed;
  const ox = pos.x, oz = pos.z;
  moveWithCollision(pos, mx / ml * sp * dt, mz / ml * sp * dt, 0.3, pos.y, 0.6, 0.5);
  pos.x = clamp(pos.x, -GS.MAPB.x, GS.MAPB.x); pos.z = clamp(pos.z, -GS.MAPB.z, GS.MAPB.z);
  pos.y = lerp(pos.y, groundAt(pos.x, pos.z, 0.25, pos.y + 0.5, 0.5), clamp(dt * 12, 0, 1));
  e.moveSpeed = Math.hypot(pos.x - ox, pos.z - oz) / Math.max(dt, 1e-4);
  animateMite(e, e.moveSpeed, dt);
}
function spiderLandingPoint(e, target) {
  // 착지 지점: 맵 경계 안 · 벽/기둥과 겹치지 않는 곳까지 출발점 쪽으로 당김. 경로가 막히면 도약 취소
  const from = e.root.position, R = e.cfg.radius + 0.3;
  const lim = (v, m) => clamp(v, -m + 3, m - 3);
  const t = V3(lim(target.x, GS.MAPB.x), 0, lim(target.z, GS.MAPB.z));
  const dir = t.clone().sub(from); dir.y = 0; const L = dir.length(); if (L < 1) return null; dir.divideScalar(L);
  const free = (x, z) => !GS.boxes.some(b => b.maxY > 1.2 && hitsBoxXZ(b, x, z, R));
  for (let d = L - 1.5; d >= 6; d -= 0.5) {
    const x = from.x + dir.x * d, z = from.z + dir.z * d;
    if (!free(x, z)) continue;
    _v1.set(from.x, 3, from.z); _v2.set(x, 3, z); if (segBlocked(_v1, _v2)) return null;
    _v1.y = _v2.y = 1.6; if (segBlocked(_v1, _v2)) return null;
    return V3(x, 0, z);
  }
  return null;
}
function spiderNext(e, dist, los) {
  const B = e.bs, legsOk = B.broken < 5;
  if (dist < 6.5 && B.cd.stomp <= 0) { B.state = 'stomp_wind'; B.t = B.phase2 ? 0.65 : 0.8; return; }
  if (legsOk && B.cd.lunge <= 0 && dist > 10 && dist < 28 && los) {
    const land = spiderLandingPoint(e, V3(GS.tg.pos.x + GS.tg.vel.x * 0.3, 0, GS.tg.pos.z + GS.tg.vel.z * 0.3));
    if (land) { B.state = 'lunge_wind'; B.t = B.phase2 ? 0.75 : 0.95; B.from = e.root.position.clone(); B.to = land; return; }
    B.cd.lunge = 1.5;
  }
  if (B.cd.brood <= 0 && dist > 7 && GS.enemies.filter(o => o.mite && !o.dead).length < 5) { B.state = 'brood_wind'; B.t = 0.9; return; }
  if (spiderWorking(e, 'turret') && B.cd.mortar <= 0 && dist > 7) { B.state = 'mortar_wind'; B.t = 0.8; return; }
  B.state = 'walk'; B.t = rand(1.2, 2.2);
}
function updateSpider(e, dt) {
  const B = e.bs, P = e.parts, pos = e.root.position;
  partTick(e, dt);
  for (const k in B.cd) B.cd[k] -= dt;
  const dx = GS.tg.pos.x - pos.x, dz = GS.tg.pos.z - pos.z, dist = Math.hypot(dx, dz) || 0.001;
  if (e.pendingAlert > 0) { e.pendingAlert -= dt; if (e.pendingAlert <= 0) e.alert = true; }
  if (!e.alert && dist < 34) e.alert = true;
  if (e.alert && !B.started) { B.started = true; B.engageT = GS.time; SFX.spider(); addFeed('ARACHNE 기동 · 최종 목표 교전 개시', 'k'); B.state = 'walk'; B.t = 1; }
  if (!B.phase2 && B.started && (P.reactor.hp < P.reactor.maxHp * 0.55 || B.broken >= 3)) {
    B.phase2 = true; SFX.spider(); addFeed('ARACHNE 과열 · 포격과 도약 강화', 'k');
  }
  if (e.stunT > 0 && !['collapse', 'stunned'].includes(B.state)) { B.state = 'dazed'; B.t = e.stunT; e.stunT = 0; }
  const lf = 1 - 0.1 * B.broken;
  _v1.set(pos.x, 3.2, pos.z); _v2.set(GS.tg.pos.x, GS.tg.pos.y + GS.tg.eye, GS.tg.pos.z);
  const los = !segBlocked(_v1, _v2);
  let move = 0, targetYaw = Math.atan2(dx, dz), turn = 1.5 * lf, Htarget = SPI.standH * (B.broken >= 4 ? 0.78 : 1), lift = null;
  B.t -= dt;
  const mk = B.marker, mk2 = B.marker2; mk.material.opacity = 0; mk2.material.opacity = 0;
  switch (B.state) {
    case 'idle': move = 0; break;
    case 'walk': {
      const want = dist > 16 ? 1 : dist < 11 ? -0.6 : 0;
      move = 3.6 * lf * want;
      if (Math.abs(want) < 0.1) { targetYaw += 0.9 * (Math.sin(GS.time * 0.4 + e.phase) > 0 ? 1 : -1); move = 2.2 * lf; }
      if (B.t <= 0 && B.started) spiderNext(e, dist, los);
      break;
    }
    case 'stomp_wind': {
      lift = { front: 2.4 }; move = 0; turn *= 1.5;
      mk.position.set(pos.x, 0.05, pos.z); mk.scale.setScalar(2.4); mk.material.opacity = 0.35 + 0.4 * Math.sin(GS.time * 30);
      if (B.t <= 0) {
        B.state = 'stomp'; B.t = 0.45; SFX.explode(dist); GS.shake = Math.max(GS.shake, 0.03);
        spawnFlash(V3(pos.x, 0.3, pos.z), 6, 0.25, 0xffa050); spawnDebris(V3(pos.x, 0.2, pos.z), 0x5a554e, 8, 6);
        for (const T of dmgTargets()) { const td = Math.hypot(T.pos.x - pos.x, T.pos.z - pos.z); if (td < 6 && T.pos.y < 1.2) { hurtTarget(T, 34, V3(pos.x, 1, pos.z), 'stomp'); knockTarget(T, T.pos.x - pos.x, T.pos.z - pos.z, 10); } }
        B.cd.stomp = B.phase2 ? 3.5 : 4.5;
      }
      break;
    }
    case 'stomp': if (B.t <= 0) { B.state = 'walk'; B.t = rand(0.5, 1); } break;
    case 'lunge_wind': {
      Htarget = 1.6; move = 0; targetYaw = Math.atan2(B.to.x - pos.x, B.to.z - pos.z); turn = 4;
      mk2.position.set(B.to.x, 0.05, B.to.z); mk2.scale.setScalar(1.5); mk2.material.opacity = 0.4 + 0.4 * Math.sin(GS.time * 30);
      if (B.t <= 0) { B.state = 'lunge'; B.lt = 0; B.from = pos.clone(); B.T = 0.55 + B.from.distanceTo(B.to) / 40; SFX.spider(); }
      break;
    }
    case 'lunge': {
      B.lt += dt; const u = Math.min(1, B.lt / B.T);
      pos.lerpVectors(B.from, B.to, u); pos.y = Math.sin(Math.PI * u) * 5;
      mk2.position.set(B.to.x, 0.05, B.to.z); mk2.scale.setScalar(1.5); mk2.material.opacity = 0.7;
      Htarget = SPI.standH; lift = { all: 1.4 };
      if (u >= 1) {
        pos.y = 0; B.state = 'land'; B.t = B.phase2 ? 1.0 : 1.3;
        SFX.explode(dist); GS.shake = Math.max(GS.shake, 0.035); if (B.phase2) spawnShock(pos.x, pos.z);
        spawnFlash(V3(pos.x, 0.3, pos.z), 5, 0.25, 0xffa050); spawnDebris(V3(pos.x, 0.2, pos.z), 0x5a554e, 8, 6);
        for (const T of dmgTargets()) { const d2 = Math.hypot(T.pos.x - pos.x, T.pos.z - pos.z);
          if (d2 < 3.8 && T.pos.y < 1.5) { hurtTarget(T, 40, V3(pos.x, 1, pos.z), 'lunge'); knockTarget(T, T.pos.x - pos.x, T.pos.z - pos.z, 12); } }
        B.cd.lunge = B.phase2 ? 5 : 6;
        addFeed('ARACHNE 착지 · 냉각구 개방', 'x');
      }
      break;
    }
    case 'land': Htarget = 2.0; move = 0; turn = 0.5; if (B.t <= 0) { B.state = 'walk'; B.t = rand(0.6, 1.2); } break;
    case 'brood_wind': {
      move = 0; Htarget = SPI.standH * 0.82; turn = 0.6;
      e.body.position.y = Math.sin(GS.time * 40) * 0.04;
      if (B.t <= 0) { e.body.position.y = 0; spiderBrood(e); B.state = 'walk'; B.t = rand(0.8, 1.2); B.cd.brood = B.phase2 ? 11 : 16; }
      break;
    }
    case 'mortar_wind': {
      move = 0; e.tubes.rotation.x = lerp(e.tubes.rotation.x, -0.5, 0.1);
      if (B.t <= 0) { B.state = 'mortar'; B.shots = (B.phase2 ? 7 : 5) + (B.broken >= 6 ? -1 : 0); B.fireT = 0; B.volley = 0; }
      break;
    }
    case 'mortar': {
      move = B.broken >= 6 ? 0 : 1.2 * lf; B.fireT -= dt;
      if (B.fireT <= 0 && B.shots > 0) { B.fireT = 0.26; B.shots--; B.volley++; spiderShell(e);
        if (GS.HARD && B.volley === 1) { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.random(); spiderShell(e, V3(GS.tg.pos.x + Math.cos(a) * 5, 0.03, GS.tg.pos.z + Math.sin(a) * 5)); } addFeed('ARACHNE 포위 포격', 'k'); } }
      if (B.shots <= 0 && B.fireT <= 0) { e.tubes.rotation.x = 0; B.cd.mortar = B.phase2 ? 4 : 5.5; B.state = B.broken >= 6 ? 'collapse' : 'walk'; B.t = B.broken >= 6 ? Infinity : rand(0.8, 1.4); }
      break;
    }
    case 'collapse': {
      Htarget = 0.95; move = 0; turn = B.broken >= 6 ? 0.35 : 0;
      if (B.broken >= 6 && spiderWorking(e, 'turret') && B.cd.mortar <= 0) { B.state = 'mortar_wind'; B.t = 1.0; }
      if (B.t <= 0) { B.state = 'rise'; B.t = 1.2; addFeed('ARACHNE 재기립', 'k'); }
      break;
    }
    case 'rise': move = 0; if (B.t <= 0) { B.state = 'walk'; B.t = 1; } break;
    case 'stunned': Htarget = 1.4; move = 0; turn = 0; if (B.t <= 0) { B.state = B.broken >= 6 ? 'collapse' : 'walk'; B.t = B.broken >= 6 ? Infinity : 1; } break;
    case 'dazed': move = 0; turn = 0.3; targetYaw = e.yaw + Math.sin(GS.time * 6); if (B.t <= 0) { B.state = 'walk'; B.t = 1; } break;
  }
  // 드론 격납고
  if (B.started && spiderWorking(e, 'bay') && B.cd.bay <= 0) {
    B.cd.bay = B.phase2 ? 15 : 20;
    if (GS.enemies.filter(o => o.drone && !o.dead).length < (B.phase2 ? 3 : 2)) {
      P.bay.group.updateMatrixWorld(true); const bp = P.bay.meshes[1].getWorldPosition(V3());
      for (let i = 0; i < 2; i++) { const d = spawnDrone(bp.x + (i ? 1 : -1), bp.z, bp.y + 0.5, { alert: 0.5 + i * 0.3, noReward: true }); d.home.set(pos.x, 0, pos.z); }
      spawnFlash(bp, 1.6, 0.2, 0x3f8fd0); SFX.shock(); addFeed('ARACHNE 드론 사출', 'k');
    }
  }
  // 회전 · 이동
  const da = angDiff(targetYaw, e.yaw); e.yaw += clamp(da, -turn * dt, turn * dt); e.root.rotation.y = e.yaw;
  if (move !== 0 && B.state !== 'lunge') {
    const ox = pos.x, oz = pos.z;
    moveWithCollision(pos, Math.sin(e.yaw) * move * dt, Math.cos(e.yaw) * move * dt, e.cfg.radius, 0, 6, 1.2);
    pos.x = clamp(pos.x, -GS.MAPB.x + 3, GS.MAPB.x - 3); pos.z = clamp(pos.z, -GS.MAPB.z + 3, GS.MAPB.z - 3);
    e.moveSpeed = Math.hypot(pos.x - ox, pos.z - oz) / dt;
  } else e.moveSpeed = B.state === 'lunge' ? 0 : Math.abs(da) > 0.05 ? 1.2 : 0;
  // 몸체 높이 · 기울기 · 다리
  e.H = lerp(e.H, Htarget, clamp(dt * (B.state === 'collapse' ? 5 : 3), 0, 1));
  e.gait += e.moveSpeed * 1.6 * dt;
  spiderPose(e, dt);
}
function buildQuarry() {
  setEnv({ sky: 0x6f7880, fog: [30, 140], hemi: [0xdfe6ee, 0x3a3630, 1.4], sun: [0xfff0d8, 1.9, [30, 45, -20]],
    ground: '#77736b', groundLine: 'rgba(40,36,30,.28)', size: [80, 80] });
  const W = 0x5e5a53;
  addBox(0, -41, 84, 2, 9, W); addBox(0, 41, 84, 2, 9, W); addBox(-41, 0, 2, 84, 9, W); addBox(41, 0, 2, 84, 9, W);
  // 암석 기둥 (시야 · 도약 차단)
  for (const [x, z, w, d, h, c] of [[-14, -14, 4, 5, 10, 0x6f6a61], [16, -8, 5, 4, 8, 0x67635b], [-18, 12, 4.5, 4, 11, 0x726d64], [12, 16, 4, 4.5, 9, 0x6a665e],
    [0, -28, 6, 3.5, 12, 0x6f6a61], [28, -24, 4, 5, 9, 0x67635b], [-28, 24, 5, 4, 10, 0x726d64], [-30, -10, 3.5, 5, 7, 0x6a665e], [30, 10, 4, 3.5, 8, 0x6f6a61]]) {
    addBox(x, z, w, d, h, c); addBox(x + 0.6, z - 0.4, w * 0.7, d * 0.7, 1.6, 0x5c5850, h);
  }
  const LC = 0x8a857c;
  for (const [x, z, w, d] of [[-8, 26, 4, 0.8], [8, 26, 4, 0.8], [-24, 2, 0.8, 4], [24, -2, 0.8, 4], [-6, 4, 3, 0.8], [7, 0, 3, 0.8],
    [0, 14, 4, 0.8], [-20, -26, 3, 0.8], [20, 26, 3, 0.8], [-34, 30, 3, 0.8], [34, -30, 3, 0.8]]) addBox(x, z, w, d, 1.1, LC);
  for (const [x, z, st] of [[-12, 30, 1], [13, 31, 0], [-33, -2, 1], [33, 4, 0], [-4, -18, 1], [22, 18, 0]]) { crate(x, z, 0x6d6656); if (st) crate(x, z, 0x625c4e, 1.2, 1.2); }
  // 채석장 장비 (시각 요소)
  const crane = new THREE.MeshLambertMaterial({ color: 0xb08a3a });
  const mast = new THREE.Mesh(_box3(0.6, 16, 0.6), crane); mast.position.set(-36, 8, -36); GS.world.add(mast);
  const jib = new THREE.Mesh(_box3(14, 0.5, 0.5), crane); jib.position.set(-30, 16, -36); GS.world.add(jib);
  addExtraction(0, 34);
  addAmmoCrate(-5, 35, true); addAmmoCrate(5, 35, true); addAmmoCrate(-37, 14, true); addAmmoCrate(37, -14, true);
  spawnSpider(0, -12, 0);
  return { spawn: V3(0, 0, 33), yaw: 0, bounds: { x: 39, z: 39 } };
}

export { SPI, animateMite, buildQuarry, buildSpider, legIK, spawnMite, spawnSpider, spiderBrood, spiderExposed, spiderLegLost, updateMite, updateSpider };
