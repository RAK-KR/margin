import * as THREE from 'three';
import { GS } from '../core/state.js?v=32';
import { V3, _v1, _v2, _v3, _v4, angDiff, clamp, lerp, rand } from '../core/utils.js?v=32';
import { ETYPES, PART_MULT, PART_NAMES, PART_TYPE, PRECISE } from '../data/data.js?v=32';
import { SFX } from '../core/audio.js?v=32';
import { camera } from '../core/renderer.js?v=32';
import { addBox, hitsBoxXZ, moveWithCollision, segBlocked, segFirstHit } from '../world/world.js?v=32';
import { UPY, burstSparks, projGeo, spawnDebris, spawnFlash, spawnSpark } from '../fx/effects.js?v=32';
import { updatePartVisual } from '../enemies/robot.js?v=32';
import { player } from '../player/playerState.js?v=32';
import { addAmmoCrate, addExtraction, setEnv, spawnEnemy } from '../world/missions.js?v=32';
import { legFactor, sensorMult } from '../combat/damage.js?v=32';
import { coopEv, dmgTargets, hurtTarget, hurtTg, isGuest, knockTarget, knockTg, v3a } from '../modes/coop.js?v=32';
import { achEvent } from '../meta/achievements.js?v=32';
import { addFeed, popup } from '../ui/hud.js?v=32';

// =====================================================================
//  최종 보스: REX-09 기계 티라노
// =====================================================================
GS.missiles = [], GS.shocks = [];
const markerGeo = new THREE.RingGeometry(2.2, 2.6, 32);
const shockGeo = new THREE.RingGeometry(0.93, 1.0, 72);
function buildRex() {
  const cfg = ETYPES.rex;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = {};
  const C = { main: 0x5f625a, dark: 0x2a2c2a, plate: 0x9a6a38, eye: 0xff3020, teeth: 0xd8d2c0, joint: 0x8a5a2a };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function P(id, parent = body) {
    const def = cfg.parts[id]; const g = new THREE.Group(); g.name = id; parent.add(g);
    const type = PART_TYPE[id];
    const p = { id, type, name: PART_NAMES[id], group: g, meshes: [], maxHp: def.hp, hp: def.hp, brkMax: def.brk || 0, brk: def.brk || 0,
      val: def.val, state: 'intact', precise: !!PRECISE[type], mult: PART_MULT[type], protectedBy: [], flash: 0, attached: true, children: [], enemy: null };
    parts[id] = p; return p;
  }
  function M(p, geo, color, x, y, z, o = {}) {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (o.emissive) mat.emissive.setHex(o.emissive);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
    m.userData = { part: p, hitMult: o.hitMult || 1, exposed: !!o.exposed, sub: o.sub || null, base: new THREE.Color(color), baseE: new THREE.Color(o.emissive || 0) };
    p.group.add(m); p.meshes.push(m); return m;
  }
  // 다리 (역관절)
  for (const side of [-1, 1]) {
    const p = P(side < 0 ? 'legR' : 'legL'); p.group.position.set(side * 1.05, 3.2, -0.7);
    M(p, box(0.85, 1.7, 1.15), C.main, 0, -0.75, 0.25, { rx: -0.35 });
    M(p, new THREE.SphereGeometry(0.44, 12, 10), C.joint, 0, -1.55, 0.66, { hitMult: 1.6, exposed: true, sub: '무릎 관절' });
    M(p, box(0.6, 1.5, 0.6), C.main, 0, -2.2, 0.25, { rx: 0.45 });
    M(p, box(1.0, 0.35, 1.7), C.dark, 0, -3.02, 0.55);
    for (const cx of [-0.32, 0, 0.32]) M(p, box(0.14, 0.18, 0.4), C.teeth, cx, -3.1, 1.55);
  }
  // 몸체 코어
  const core = P('core');
  M(core, box(2.3, 2.0, 3.6), C.main, 0, 3.75, 0.3);
  M(core, box(1.9, 1.3, 1.6), C.dark, 0, 3.25, -1.1, { hitMult: 0.6, sub: '하부 프레임' });
  M(core, box(0.9, 0.8, 0.1), 0x331100, 0, 3.55, 2.15, { emissive: 0xff7a1a, hitMult: 1.5, sub: '코어 노출부' });
  for (const z of [-0.8, 0.2, 1.2]) M(core, box(0.35, 0.35, 0.6), C.plate, 0, 4.85, z);
  // 흉부 장갑
  const ch = P('chest'); M(ch, box(2.5, 1.75, 0.3), C.plate, 0, 3.6, 2.3);
  core.protectedBy.push('chest');
  // 앞발
  const ar = P('arms'); ar.group.position.set(0, 3.15, 2.5);
  for (const sx of [-0.75, 0.75]) { M(ar, box(0.24, 0.7, 0.24), C.main, sx, -0.1, 0.25, { rx: 0.7 }); M(ar, box(0.3, 0.16, 0.35), C.teeth, sx, -0.45, 0.6); }
  // 머리 (목 피벗) + 턱
  const hd = P('head'); hd.group.position.set(0, 4.4, 2.0);
  M(hd, box(1.1, 1.1, 1.7), C.dark, 0, 0.25, 0.55, { rx: -0.35 });
  M(hd, box(1.5, 1.3, 2.2), C.main, 0, 0.75, 1.9);
  M(hd, box(1.2, 0.8, 1.3), C.main, 0, 0.55, 3.45);
  for (const sx of [-0.86, 0.86]) M(hd, box(0.24, 0.3, 0.55), 0x220000, sx, 0.98, 2.3, { emissive: C.eye, hitMult: 1.6, exposed: true, sub: '광학 센서' });
  for (let i = 0; i < 6; i++) for (const sx of [-0.5, 0.5]) M(hd, box(0.1, 0.22, 0.12), C.teeth, sx, 0.08, 2.5 + i * 0.25);
  const jw = P('jaw', hd.group); jw.group.position.set(0, 0.15, 1.3);
  M(jw, box(1.25, 0.42, 2.7), C.main, 0, -0.18, 1.35);
  for (let i = 0; i < 6; i++) for (const sx of [-0.45, 0.45]) M(jw, box(0.1, 0.2, 0.12), C.teeth, sx, 0.1, 1.2 + i * 0.25);
  hd.children.push(jw);
  // 미사일 포드
  for (const side of [1, -1]) {
    const p = P(side > 0 ? 'podL' : 'podR'); p.group.position.set(side * 1.2, 5.05, 0.9);
    M(p, box(0.85, 0.75, 1.35), C.dark, 0, 0, 0);
    for (const tx of [-0.18, 0.18]) for (const ty of [-0.16, 0.16]) M(p, box(0.17, 0.17, 0.06), 0x220000, tx, ty, 0.69, { emissive: 0xff3a20 });
    M(p, box(0.2, 0.5, 0.2), C.dark, -side * 0.35, -0.45, 0);
  }
  // 동력로 + 해치
  const rc = P('reactor');
  M(rc, box(0.9, 0.6, 0.9), C.dark, 0, 4.95, -1.15);
  M(rc, box(0.62, 0.08, 0.62), 0x002211, 0, 5.28, -1.15, { emissive: 0x3dff9a, sub: '동력 셀' });
  M(rc, box(0.62, 0.4, 0.06), 0x002211, 0, 4.95, -1.62, { emissive: 0x3dff9a, sub: '동력 셀' });
  const ht = P('hatch'); ht.group.position.set(0, 5.36, -0.6);
  M(ht, box(1.2, 0.12, 1.2), C.plate, 0, 0, -0.58);
  M(ht, box(1.2, 0.8, 0.1), C.plate, 0, -0.4, -1.15);
  M(ht, box(1.2, 0.62, 0.1), C.plate, 0, -0.31, 0.0);
  for (const sx of [-0.62, 0.62]) M(ht, box(0.1, 0.8, 1.2), C.plate, sx, -0.4, -0.58);
  // 꼬리
  const tl = P('tail'); tl.group.position.set(0, 3.5, -1.7);
  M(tl, box(1.3, 1.1, 2.2), C.main, 0, -0.1, -1.1);
  M(tl, new THREE.SphereGeometry(0.46, 12, 10), C.joint, 0, -0.15, -2.35, { hitMult: 1.5, exposed: true, sub: '꼬리 관절' });
  M(tl, box(0.95, 0.8, 2.2), C.main, 0, -0.25, -3.45);
  M(tl, box(0.6, 0.5, 2.3), C.main, 0, -0.35, -5.6);
  for (let i = 0; i < 5; i++) M(tl, box(0.18, 0.32, 0.35), C.plate, 0, 0.5 - i * 0.12, -0.6 - i * 1.15);
  root.scale.setScalar(cfg.scale);
  return { root, body, parts, eyeY: 5.3 * cfg.scale, coreY: 3.75 * cfg.scale, glow: { material: { opacity: 0 } } };
}
function spawnBoss(x, z, yaw) {
  const r = buildRex();
  const e = { type: 'rex', boss: true, cfg: ETYPES.rex, root: r.root, body: r.body, parts: r.parts, glow: r.glow, eyeY: r.eyeY, coreY: r.coreY,
    yaw, homeYaw: yaw, home: V3(x, 0, z), alert: false, canSee: true, canShoot: true, lastSeen: V3(x, 0, z), lostT: 0, fireCd: 0,
    dead: false, stunT: 0, stunned: false, pendingAlert: 0, hitKick: 0, phase: 0, sparkT: 0, moveSpeed: 0,
    bs: { state: 'idle', t: 0, cd: { charge: 6, missile: 3, tail: 0, slam: 2 }, hatchO: 0, started: false, phase2: false, knocked: false, crawl: false, moveSpeed: 0 } };
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  r.root.position.set(x, 0, z); r.root.rotation.y = yaw;
  // 돌진 경로 표시
  const mk = new THREE.Group();
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 30), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
  pl.rotation.x = -Math.PI / 2; pl.position.set(0, 0.04, 15); mk.add(pl); GS.world.add(mk);
  e.bs.marker = mk; e.bs.markerMat = pl.material;
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); beamGeo.translate(0, 0.5, 0);
  const beam = new THREE.Group();
  const outer = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff4a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  const inner = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.add(outer, inner); beam.visible = false; GS.world.add(beam);
  e.bs.beam = beam; e.bs.beamOuter = outer; e.bs.beamInner = inner; e.bs.laserDir = V3(0, 0, 1); e.bs.cd.laser = 0.5;
  GS.world.add(r.root); GS.enemies.push(e);
  return e;
}
function partTick(e, dt) {
  for (const id in e.parts) { const p = e.parts[id]; if (p.flash > 0) { p.flash -= dt; if (p.flash <= 0 && p.attached) updatePartVisual(p); } }
  e.sparkT -= dt;
  if (e.sparkT <= 0) {
    e.sparkT = rand(0.25, 0.6);
    for (const id in e.parts) {
      const p = e.parts[id];
      if (p.attached && (p.state === 'disabled' || (p.state === 'damaged' && p.hp < p.maxHp * 0.4)) && Math.random() < 0.6) {
        p.meshes[0].getWorldPosition(_v1); burstSparks(_v1, UPY, e.boss ? 6 : 3, 0xffa040, e.boss ? 4 : 2.5);
      }
    }
  }
}
function bossWorking(e, id) { const p = e.parts[id]; return p && p.attached && p.state !== 'destroyed' && p.state !== 'disabled'; }
function knockPlayer(dx, dz, power) {
  const l = Math.hypot(dx, dz) || 1;
  player.vel.x += dx / l * power; player.vel.z += dz / l * power; player.vy = 4.5; player.onGround = false;
}
function bossNext(e, dist, yawErr) {
  const B = e.bs, front = Math.abs(yawErr) < 0.6, S = e.cfg.scale;
  const pods = ['podL', 'podR'].filter(id => bossWorking(e, id)).length;
  const canCharge = !B.crawl && legFactor(e) > 0;
  _v1.set(e.root.position.x, 4.5 * S, e.root.position.z); _v2.set(GS.tg.pos.x, GS.tg.pos.y + GS.tg.eye, GS.tg.pos.z);
  const los = !segBlocked(_v1, _v2);
  if (dist < 6.5 * S && front && bossWorking(e, 'jaw')) { B.state = 'bite'; B.t = B.phase2 ? 0.55 : 0.7; return; }
  if (dist < 8.5 * S && !front && bossWorking(e, 'tail') && B.cd.tail <= 0) { B.state = 'tail'; B.t = 0.8; B.cd.tail = 4; B.spinDir = yawErr > 0 ? -1 : 1; return; }
  if (canCharge && B.cd.charge <= 0 && dist > 9 * S && los) { B.state = 'charge_wind'; B.t = B.phase2 ? 0.85 : 1.15; B.cd.charge = B.phase2 ? 7 : 10; B.secondCharge = false; return; }
  if (bossWorking(e, 'head') && B.cd.laser <= 0 && dist > 9 && dist < 55 && los) {
    B.state = 'laser_wind'; B.t = B.phase2 ? 1.25 : 1.6; B.windT = B.t; B.cd.laser = B.phase2 ? 7 : 9; B.laserAcc = 0;
    SFX.laserCharge(B.t); popup('열선 경고 · 붉은 조준선을 피해 옆으로', 'bad'); addFeed('REX-09 열선 충전', 'k'); return;
  }
  if (pods > 0 && B.cd.missile <= 0 && dist > 7 * S) { B.state = 'missile'; B.shots = pods * 3 + (B.phase2 ? 2 : 0); B.fireT = 0.5; B.t = 1.2; B.cd.missile = B.phase2 ? 7 : 9.5; return; }
  if (B.phase2 && B.cd.slam <= 0 && dist < 18 * S) { B.state = 'slam_wind'; B.t = 0.9; B.cd.slam = 8; return; }
  B.state = 'walk'; B.t = rand(1.2, 2.2);
}
function bossFireMissile(e) {
  const B = e.bs;
  const ids = ['podL', 'podR'].filter(id => bossWorking(e, id)); if (!ids.length) return;
  B.podTurn = ((B.podTurn || 0) + 1) % ids.length;
  const pod = e.parts[ids[B.podTurn]];
  pod.group.updateMatrixWorld(true);
  const from = pod.group.getWorldPosition(V3()); from.y += 0.4;
  const sp = sensorMult(e) > 2 ? 5 : 2.4;
  const to = V3(GS.tg.pos.x + GS.tg.vel.x * 0.7 + rand(-sp, sp), GS.tg.onGround ? GS.tg.pos.y + 0.03 : 0.03, GS.tg.pos.z + GS.tg.vel.z * 0.7 + rand(-sp, sp));
  const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
  mesh.scale.set(0.16, 0.16, 0.45); mesh.position.copy(from); GS.world.add(mesh);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.position.copy(to); GS.world.add(marker);
  GS.missiles.push({ mesh, marker, from, to, t: 0, T: 1.1 + from.distanceTo(to) / 32, h: 5 + from.distanceTo(to) * 0.12 });
  { const mm = GS.missiles[GS.missiles.length - 1]; coopEv({ t: 'mis', f: v3a(from), to: v3a(to), T: mm.T, h: mm.h, c: 0xff6a2a, s: [0.16, 0.16, 0.45] }); }
  spawnFlash(from, 0.8, 0.08, 0xff9a50); SFX.missile();
}
function updateMissiles(dt) {
  for (let i = GS.missiles.length - 1; i >= 0; i--) {
    const m = GS.missiles[i]; m.t += dt;
    const u = Math.min(1, m.t / m.T);
    _v1.copy(m.mesh.position);
    m.mesh.position.lerpVectors(m.from, m.to, u); m.mesh.position.y += Math.sin(Math.PI * u) * m.h;
    m.mesh.lookAt(_v2.copy(m.mesh.position).multiplyScalar(2).sub(_v1));
    m.marker.material.opacity = 0.3 + 0.5 * u; m.marker.scale.setScalar(1.1 - 0.15 * u);
    if (Math.random() < 0.6) spawnSpark(m.mesh.position, _v3.copy(_v1).sub(m.mesh.position).normalize(), 0xffa050, 3, 0.25);
    if (u >= 1) {
      const d = Math.hypot(player.pos.x - m.to.x, player.pos.z - m.to.z);
      spawnFlash(m.to, 3, 0.2, 0xffa050); burstSparks(m.to, UPY, 14, 0xffa040, 7); spawnDebris(m.to, 0x4a4540, 3, 3);
      SFX.explode(m.to.distanceTo(player.pos)); GS.shake = Math.max(GS.shake, d < 8 ? 0.012 : 0.004);
      if (!m.vis && !isGuest()) for (const T of dmgTargets()) { const dd = Math.hypot(T.pos.x - m.to.x, T.pos.z - m.to.z); if (dd < 2.7 && Math.abs(T.pos.y - m.to.y) < 2.2) { hurtTarget(T, 18, m.to, 'missile'); knockTarget(T, T.pos.x - m.to.x, T.pos.z - m.to.z, 4); } }
      GS.world.remove(m.mesh, m.marker); GS.missiles.splice(i, 1);
    }
  }
  for (let i = GS.shocks.length - 1; i >= 0; i--) {
    const s = GS.shocks[i]; s.r += 13 * dt;
    s.mesh.scale.set(s.r, s.r, 1); s.mesh.material.opacity = Math.max(0, 0.85 * (1 - s.r / 24));
    const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
    if (!isGuest()) for (const T of dmgTargets()) { const dd = Math.hypot(T.pos.x - s.x, T.pos.z - s.z);
      if (!s.hits.has(T) && Math.abs(dd - s.r) < 0.9 && T.pos.y < 0.3) { s.hits.add(T); hurtTarget(T, 22, V3(s.x, 0, s.z), 'shock'); if (T === player) { player.vy = 5; player.onGround = false; } } }
    if (s.r > 24) { GS.world.remove(s.mesh); GS.shocks.splice(i, 1); }
  }
}
function spawnShock(x, z) {
  const mesh = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.15, z); GS.world.add(mesh);
  GS.shocks.push({ mesh, r: 2, x, z, hit: false, hits: new Set() });
  coopEv({ t: 'shock', x, z });
}
function rexMouth(e, out) { e.parts.head.group.updateMatrixWorld(true); return e.parts.head.group.localToWorld(out.set(0, 0.35, 4.15)); }
function distPointSeg(p, a, b) {
  _v4.subVectors(b, a); const l2 = _v4.lengthSq(); let t = l2 > 0 ? _v3.subVectors(p, a).dot(_v4) / l2 : 0; t = clamp(t, 0, 1);
  return _v3.copy(a).addScaledVector(_v4, t).distanceTo(p);
}
function updateBoss(e, dt) {
  const REC = e.bs.phase2 ? 0.7 : 0.85; // 공격 사이 빈틈 단축
  const B = e.bs, pos = e.root.position, cfg = e.cfg, S = cfg.scale;
  partTick(e, dt);
  for (const k in B.cd) B.cd[k] -= dt;
  const dx = GS.tg.pos.x - pos.x, dz = GS.tg.pos.z - pos.z, dist = Math.hypot(dx, dz) || 0.001;
  const toYaw = Math.atan2(dx, dz), yawErr = angDiff(toYaw, e.yaw);
  if (e.pendingAlert > 0) { e.pendingAlert -= dt; if (e.pendingAlert <= 0) { e.pendingAlert = 0; e.alert = true; } }
  if (!e.alert && dist < 28) e.alert = true;
  if (!e.alert) { animateRex(e, dt); return; }
  if (!B.started) {
    B.started = true; B.engageT = GS.time; B.state = 'roar'; B.t = 2.2; SFX.roar(); GS.shake = Math.max(GS.shake, 0.02);
    addFeed('REX-09 기동 · 최종 목표 교전 개시', 'k');
  }
  const core = e.parts.core;
  const rct = e.parts.reactor;
  if (!B.phase2 && (core.hp < core.maxHp * 0.55 || rct.hp < rct.maxHp * 0.55)) {
    B.phase2 = true; B.state = 'roar'; B.t = 1.8; SFX.roar(); GS.shake = Math.max(GS.shake, 0.02);
    addFeed('REX-09 과부하 · 공격 패턴 강화 · 정찰형 증원', 'k');
    for (const [x, z] of [[-28, -28], [28, -28]]) { const s = spawnEnemy('scout', x, z, 0); s.pendingAlert = 0.8; s.home.set(x * 0.6, 0, z * 0.6); }
  }
  if (e.stunT > 0) { B.state = 'dazed'; B.t = e.stunT; e.stunT = 0; }
  const lf = legFactor(e);
  if (lf === 0 && !B.crawl && B.state !== 'knockdown') {
    B.knocks = (B.knocks || 0) + 1;
    B.state = 'knockdown'; B.t = Math.max(5, 8 - B.knocks); SFX.explode(dist); GS.shake = Math.max(GS.shake, 0.02);
    addFeed('REX-09 전도 · 동력로 해치 개방', 'd'); popup('다운 · 동력로 노출', 'weak');
  }
  B.t -= dt;
  let move = 0, turnTo = null, turnRate = cfg.turn * (sensorMult(e) > 2 ? 0.6 : 1) * (B.phase2 ? 1.2 : 1) * (B.crawl ? 0.4 : 1);
  B.markerA = 0;
  switch (B.state) {
    case 'idle': case 'roar': case 'dazed':
      if (B.t <= 0) bossNext(e, dist, yawErr); break;
    case 'walk':
      turnTo = toYaw;
      move = cfg.speed * (B.crawl ? 0.3 : Math.max(lf, 0.35)) * (B.phase2 ? 1.25 : 1) * (Math.abs(yawErr) < 1.2 ? 1 : 0.3);
      if (B.t <= 0 || (dist < 7 * S && Math.abs(yawErr) < 0.6)) bossNext(e, dist, yawErr);
      break;
    case 'bite':
      turnTo = toYaw; turnRate *= 1.6;
      if (B.t <= 0) {
        SFX.brk();
        if (dist < 6.8 * S && Math.abs(yawErr) < 0.75 && GS.tg.pos.y < 6) { hurtTg(44, pos, 'bite'); knockTg(dx, dz, 7); }
        B.state = 'recover'; B.t = 0.7 * REC; B.bit = 0.35;
      }
      break;
    case 'tail':
      if (B.t <= 0) { B.state = 'spin'; B.t = 0.75; B.spinHit = false; SFX.missile(); }
      break;
    case 'spin': {
      e.yaw += (Math.PI * 2 / 0.75) * dt * B.spinDir;
      const tailDir = e.yaw + Math.PI;
      if (!B.spinHit && dist < 9.5 * S && Math.abs(angDiff(toYaw, tailDir)) < 0.5 && GS.tg.pos.y < 3.5) { B.spinHit = true; hurtTg(33, pos, 'tail'); knockTg(dx, dz, 11); }
      if (B.t <= 0) { B.state = 'recover'; B.t = 0.6 * REC; }
      break;
    }
    case 'charge_wind':
      if (B.t > 0.4) { turnTo = toYaw; turnRate *= 2.2; B.markerA = 0.2; } else B.markerA = 0.55;
      if (B.t <= 0) {
        B.state = 'charge'; B.t = 1.9; B.chargeHit = false;
        B.dir = e.yaw + (sensorMult(e) > 2 ? rand(-0.35, 0.35) : 0); e.yaw = B.dir; SFX.roar();
      }
      break;
    case 'charge': {
      const sx = Math.sin(B.dir), sz = Math.cos(B.dir), step = 15 * dt * (B.phase2 ? 1.15 : 1);
      const nx = pos.x + sx * step, nz = pos.z + sz * step;
      const ox = pos.x, oz = pos.z;
      moveWithCollision(pos, sx * step, sz * step, cfg.radius, 0, 8, 1.2);
      const moved = Math.hypot(pos.x - ox, pos.z - oz);
      const wall = moved < step * 0.45 || GS.boxes.some(b => b.maxY > 1.5 && hitsBoxXZ(b, nx + sx * 2.2 * S, nz + sz * 2.2 * S, 1.3 * S));
      if (wall) {
        B.state = 'stunned'; B.t = 3.8; GS.shake = Math.max(GS.shake, 0.03);
        _v3.set(pos.x + sx * 3.4 * S, 3.5 * S, pos.z + sz * 3.4 * S); spawnFlash(_v3, 3, 0.2, 0xffc080); burstSparks(_v3, UPY, 24, 0xffb050, 9); SFX.explode(dist);
        addFeed('REX-09 충돌 · 기절 · 동력로 노출', 'd'); achEvent('rexWall'); popup('기절 · 동력로 노출', 'weak');
      }
      if (!B.chargeHit && dist < 3.0 * S) { B.chargeHit = true; hurtTg(38, pos, 'charge'); knockTg(sx * 2 + dx / dist, sz * 2 + dz / dist, 13); }
      B.moveSpeed = 15;
      if (B.state === 'charge' && B.t <= 0) { if (GS.HARD && !B.secondCharge) { B.secondCharge = true; B.state = 'charge_wind'; B.t = 0.6; addFeed('REX-09 연속 돌진', 'k'); } else { B.state = 'recover'; B.t = 0.9 * REC; } }
      break;
    }
    case 'laser_wind': {
      turnTo = toYaw; turnRate *= 1.6;
      const m = rexMouth(e, V3());
      const want = V3(GS.tg.pos.x, GS.tg.pos.y + 1.1, GS.tg.pos.z).sub(m).normalize();
      if (!B.laserAimed) { B.laserDir.copy(want); B.laserAimed = true; }
      const ang = B.laserDir.angleTo(want), maxA = (B.t > 0.5 ? 0.9 : 0) * dt;
      B.laserLocked = B.t <= 0.5;
      if (ang > 1e-4 && maxA > 0) B.laserDir.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(B.laserDir, want).slerp(new THREE.Quaternion(), 1 - Math.min(1, maxA / ang))).normalize();
      if (!bossWorking(e, 'head')) { B.state = 'recover'; B.t = 0.6 * REC; B.laserAimed = false; break; }
      if (B.t <= 0) { B.state = 'laser'; B.laserAimed = false; B.t = B.phase2 ? 2.8 : 2.2; B.laserAcc = 0; SFX.laser(); addFeed('REX-09 열선 발사', 'k'); }
      break;
    }
    case 'laser': {
      turnTo = toYaw; turnRate = 0.3 * (B.phase2 ? 1.4 : 1);
      if (!bossWorking(e, 'head')) { B.state = 'recover'; B.t = 0.6 * REC; break; }
      const m = rexMouth(e, V3());
      const want = V3(GS.tg.pos.x, GS.tg.pos.y + 1.1, GS.tg.pos.z).sub(m).normalize();
      const ang = B.laserDir.angleTo(want), maxA = (B.phase2 ? 0.22 : 0.16) * dt;
      if (ang > 1e-4) B.laserDir.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(B.laserDir, want).slerp(new THREE.Quaternion(), 1 - Math.min(1, maxA / ang))).normalize();
      // 사거리: 장애물 또는 바닥까지
      let len = segFirstHit(m, B.laserDir, 80); if (len < 0) len = 80;
      if (B.laserDir.y < -1e-3) len = Math.min(len, -m.y / B.laserDir.y);
      const end = m.clone().addScaledVector(B.laserDir, len);
      B.laserEnd = end;
      let near = 1e9;
      for (const h of [0.3, 0.8, 1.3, GS.tg.height - 0.1]) near = Math.min(near, distPointSeg(_v1.set(GS.tg.pos.x, GS.tg.pos.y + h, GS.tg.pos.z), m, end));
      if (near < 0.75) { B.laserAcc += 45 * dt; if (B.laserAcc >= 6) { B.laserAcc -= 6; hurtTg(6, m, 'laser'); } }
      if (Math.random() < 0.8) { burstSparks(end, UPY, 3, 0xff8a40, 6); }
      if (Math.random() < 0.3 && end.distanceTo(camera.position) > 4) spawnFlash(end, 2.2, 0.08, 0xff7a30);
      if (B.t <= 0) { B.state = 'recover'; B.t = 0.8 * REC; }
      break;
    }
    case 'missile':
      turnTo = toYaw; B.fireT -= dt;
      if (B.shots > 0 && B.fireT <= 0) { bossFireMissile(e); B.shots--; B.fireT = 0.26; }
      if (B.shots <= 0 && B.t <= 0) { B.state = 'recover'; B.t = 0.6 * REC; }
      break;
    case 'slam_wind':
      if (B.t <= 0) {
        spawnShock(pos.x, pos.z); SFX.shock(); GS.shake = Math.max(GS.shake, 0.025);
        burstSparks(_v3.set(pos.x, 0.3, pos.z), UPY, 20, 0xc8b8a0, 6);
        B.state = 'recover'; B.t = 1.0 * REC;
      }
      break;
    case 'stunned':
      if (B.t <= 0) { B.state = 'recover'; B.t = 0.6 * REC; }
      break;
    case 'knockdown':
      if (B.t <= 0) {
        for (const id of ['legL', 'legR']) {
          const p = e.parts[id];
          if (p.attached && p.state === 'disabled') { p.hp = p.maxHp * 0.7; p.state = 'damaged'; updatePartVisual(p); }
        }
        if (legFactor(e) === 0) { B.crawl = true; achEvent('rexCrawl'); addFeed('REX-09 하체 붕괴 · 동력로 해치 고정 개방', 'd'); popup('하체 붕괴 · 동력로 상시 노출', 'weak'); }
        else { addFeed('REX-09 기립 · 다리 응급 수리', 'k'); SFX.roar(); }
        B.state = 'recover'; B.t = 1.2 * REC;
      }
      break;
    case 'recover':
      if (B.t <= 0) bossNext(e, dist, yawErr); break;
  }
  if (turnTo !== null) { const da = angDiff(turnTo, e.yaw); e.yaw += clamp(da, -turnRate * dt, turnRate * dt); }
  if (move > 0) {
    const ox = pos.x, oz = pos.z;
    moveWithCollision(pos, Math.sin(e.yaw) * move * dt, Math.cos(e.yaw) * move * dt, cfg.radius, 0, 8, 1.2);
    B.moveSpeed = Math.hypot(pos.x - ox, pos.z - oz) / dt;
  } else if (B.state !== 'charge') B.moveSpeed = 0;
  e.root.rotation.y = e.yaw;
  animateRex(e, dt);
}
function bossHatchOpen(e) { return e.bs.crawl || ['missile', 'stunned', 'knockdown'].includes(e.bs.state); }
function animateRex(e, dt) {
  const B = e.bs, P = e.parts, k = clamp(dt * 7, 0, 1);
  e.phase += (B.moveSpeed || 0) * dt * 1.0;
  const amp = (B.moveSpeed || 0) > 0.2 ? 0.42 : 0;
  const down = B.state === 'knockdown';
  for (const [id, sgn] of [['legL', 1], ['legR', -1]]) {
    const p = P[id]; if (!p.attached) continue;
    const tgt = down ? -0.9 : (p.state === 'disabled' ? 0.3 : Math.sin(e.phase) * amp * sgn);
    p.group.rotation.x = lerp(p.group.rotation.x, tgt, k);
  }
  let bx = 0, by = 0, bz = 0;
  if (down) { by = -1.5; bx = 0.22; bz = 0.1; }
  else if (B.state === 'stunned' || B.state === 'dazed') { bx = 0.1; bz = Math.sin(GS.time * 24) * 0.04; }
  else if (B.state === 'slam_wind') bx = -0.35;
  else if (B.state === 'charge') bx = 0.12;
  else if (B.state === 'charge_wind') bx = 0.06;
  if (B.crawl && !down) { by = -1.1; bx = 0.15; }
  const lb = !bossWorking(e, 'legL'), rb = !bossWorking(e, 'legR');
  if (!down && (lb !== rb)) bz += lb ? 0.08 : -0.08;
  e.body.position.y = lerp(e.body.position.y, by + (amp ? Math.abs(Math.sin(e.phase)) * 0.08 : 0), k);
  e.body.rotation.x = lerp(e.body.rotation.x, bx, k);
  e.body.rotation.z = lerp(e.body.rotation.z, bz, k);
  // 머리 / 턱
  const hd = P.head;
  if (hd.attached) {
    let hx = Math.sin(GS.time * 1.4) * 0.04;
    if (B.state === 'roar') hx = -0.5; else if (B.state === 'bite') hx = -0.35; else if (B.bit > 0) hx = 0.3; else if (down) hx = 0.35;
    hd.group.rotation.x = lerp(hd.group.rotation.x, hx, clamp(dt * (B.bit > 0 ? 18 : 8), 0, 1));
  }
  if (B.bit > 0) B.bit -= dt;
  const jw = P.jaw;
  if (jw.attached) {
    const open = B.state === 'roar' || B.state === 'bite' ? 0.55 : (B.state === 'charge_wind' ? 0.4 : (B.state === 'laser' || B.state === 'laser_wind') ? 0.45 : 0.05);
    jw.group.rotation.x = lerp(jw.group.rotation.x, open, clamp(dt * 12, 0, 1));
  }
  const tl = P.tail;
  if (tl.attached) { tl.group.rotation.y = lerp(tl.group.rotation.y, B.state === 'spin' ? 0 : Math.sin(GS.time * 1.6) * 0.25, k); tl.group.rotation.x = down ? -0.15 : 0.05; }
  // 해치
  B.hatchO = lerp(B.hatchO, bossHatchOpen(e) ? 1 : 0, clamp(dt * 6, 0, 1));
  const ht = P.hatch;
  if (ht.attached) { ht.group.position.y = 5.36 + 1.3 * B.hatchO; ht.group.rotation.x = -0.5 * B.hatchO; }
  // 열선 충전: 입에 붉은 빛이 커지며 모임
  if (!B.chargeGlow) {
    B.chargeGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    GS.world.add(B.chargeGlow);
  }
  if (B.state === 'laser_wind' && P.head.attached) {
    const k = clamp(1 - B.t / (B.windT || 1.6), 0, 1);
    rexMouth(e, B.chargeGlow.position); B.chargeGlow.visible = true;
    B.chargeGlow.scale.setScalar(0.25 + 1.1 * k * (0.9 + 0.1 * Math.sin(GS.time * 50)));
    B.chargeGlow.material.opacity = 0.35 + 0.5 * k;
    if (Math.random() < 0.5) burstSparks(B.chargeGlow.position, UPY, 2, 0xff7a30, 2 + 3 * k);
  } else B.chargeGlow.visible = false;
  // 레이저
  if (B.beam) {
    const on = B.state === 'laser' || B.state === 'laser_wind';
    B.beam.visible = on && P.head.attached;
    if (B.beam.visible) {
      const m = rexMouth(e, V3());
      const len = B.state === 'laser' && B.laserEnd ? m.distanceTo(B.laserEnd) : 70;
      B.beam.position.copy(m); B.beam.quaternion.setFromUnitVectors(UPY, B.laserDir);
      if (B.state === 'laser') {
        const w = 0.45 + 0.07 * Math.sin(GS.time * 60);
        B.beamOuter.scale.set(w, len, w); B.beamInner.scale.set(0.15, len, 0.15); B.beamOuter.material.opacity = 0.5;
        if (Math.random() < 0.5) spawnFlash(m, 2.0, 0.06, 0xff6a2a);
      } else {
        const lk = B.laserLocked ? 2.6 : 1.3;
        B.beamOuter.scale.set(0.06 * lk, len, 0.06 * lk); B.beamInner.scale.set(0.02 * lk, len, 0.02 * lk);
        B.beamOuter.material.opacity = B.laserLocked ? 0.85 : 0.35 + 0.35 * Math.sin(GS.time * 40);
        if (Math.random() < 0.4) spawnFlash(m, 0.6 + (1.1 - Math.max(0, B.t)) * 1.2, 0.06, 0xff5a20);
      }
    }
  }
  // 돌진 경로 표시
  if (B.marker) {
    B.marker.position.set(e.root.position.x, 0, e.root.position.z); B.marker.rotation.y = e.yaw;
    B.markerMat.opacity = B.markerA * (0.7 + 0.3 * Math.sin(GS.time * 30));
  }
}
function buildArena() {
  setEnv({ sky: 0x7b6b5d, fog: [34, 140], hemi: [0xf2dcc0, 0x3e342c, 1.5], sun: [0xffc98a, 2.1, [-40, 30, -30]],
    ground: '#5e554b', groundLine: 'rgba(30,24,20,.3)', size: [76, 76] });
  const W = 0x4f4b46;
  addBox(0, -39, 80, 2, 9, W); addBox(0, 39, 80, 2, 9, W); addBox(-39, 0, 2, 80, 9, W); addBox(39, 0, 2, 80, 9, W);
  // 돌진을 유도할 굵은 기둥
  for (const [x, z] of [[0, -25], [-19, -12], [19, -12], [-19, 10], [19, 10], [0, 19]]) addBox(x, z, 3, 3, 13, 0x6d675e);
  // 낮은 엄폐물
  const LC = 0x8a857c;
  for (const [x, z, w, d] of [[-8, 26, 4, 0.6], [8, 26, 4, 0.6], [-26, 18, 0.6, 4], [26, 18, 0.6, 4], [-9, 2, 3, 0.6], [9, 2, 3, 0.6],
    [-26, -18, 0.6, 4], [26, -18, 0.6, 4], [-8, -30, 4, 0.6], [8, -30, 4, 0.6]]) addBox(x, z, w, d, 1.1, LC);
  // 계단식 고지대 (등 뒤 동력로를 내려다보는 자리)
  for (const side of [-1, 1]) {
    addBox(side * 33, 0, 8, 8, 2.6, 0x5a554e);
    for (let i = 0; i < 6; i++) addBox(side * (28.5 - i), 0, 1, 2.6, 0.42 * (6 - i), 0x66605a);
    addAmmoCrate(side * 34.5, 2.6, true, 2.6);
  }
  addExtraction(0, 32);
  addAmmoCrate(-5, 33, true); addAmmoCrate(5, 33, true);
  spawnBoss(0, -10, 0);
  return { spawn: V3(0, 0, 31), yaw: 0, bounds: { x: 37, z: 37 } };
}

export { animateRex, bossHatchOpen, buildArena, buildRex, knockPlayer, markerGeo, partTick, shockGeo, spawnBoss, spawnShock, updateBoss, updateMissiles };
