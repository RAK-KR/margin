import * as THREE from 'three';
import { GS } from '../core/state.js?v=34';
import { V3, _v1, _v2, angDiff, clamp, lerp, rand } from '../core/utils.js?v=34';
import { ETYPES, PART_MULT, PART_NAMES, PART_TYPE, PRECISE } from '../data/data.js?v=34';
import { SFX } from '../core/audio.js?v=34';
import { addBox, groundAt, moveWithCollision, segBlocked, segFirstHit } from '../world/world.js?v=34';
import { UPY, burstSparks, spawnFlash } from '../fx/effects.js?v=34';
import { player } from '../player/playerState.js?v=34';
import { partAlive, sensorMult } from '../combat/damage.js?v=34';
import { alertEnemy, enemyFire } from './ai.js?v=34';
import { partTick } from '../bosses/rex.js?v=34';
import { coopEv, dmgTargets, hurtTarget, isHost, knockTarget } from '../modes/coop.js?v=34';
import { killEnemy } from '../meta/achievements.js?v=34';
import { addFeed, popup } from '../ui/hud.js?v=34';

// =====================================================================
//  추가 적: 드론형 · 저격형 · 중계탑
// =====================================================================
GS.MAPB = { x: 30, z: 30 };   // 비행체 이동 한계 (맵마다 갱신)
function partKit(cfg, parts, names = {}) {
  const P = (id, parent) => {
    const def = cfg.parts[id]; const g = new THREE.Group(); g.name = id; parent.add(g);
    const type = PART_TYPE[id];
    const p = { id, type, name: names[id] || PART_NAMES[id], group: g, meshes: [], maxHp: def.hp, hp: def.hp, brkMax: def.brk || 0, brk: def.brk || 0,
      val: def.val, state: 'intact', precise: !!PRECISE[type], mult: PART_MULT[type], protectedBy: [], flash: 0, attached: true, children: [], enemy: null };
    parts[id] = p; return p;
  };
  const M = (p, geo, color, x, y, z, o = {}) => {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (o.emissive) mat.emissive.setHex(o.emissive);
    if (o.opacity) { mat.transparent = true; mat.opacity = o.opacity; mat.depthWrite = false; }
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
    m.userData = { part: p, hitMult: o.hitMult || 1, exposed: !!o.exposed, sub: o.sub || null, base: new THREE.Color(color), baseE: new THREE.Color(o.emissive || 0) };
    (o.parent || p.group).add(m); p.meshes.push(m); return m;
  };
  return { P, M };
}
const _box3 = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function dummyGlow() { return { material: { opacity: 0 } }; }

// ---------------- 드론형 ----------------
const ROTORS = ['rotorFL', 'rotorFR', 'rotorBL', 'rotorBR'];
function buildDrone() {
  const cfg = ETYPES.drone, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = {}, { P, M } = partKit(cfg, parts), C = { main: 0x9aa3a8, dark: 0x30353a, acc: 0x3f8fd0 };
  const core = P('core', body);
  M(core, _box3(0.62, 0.22, 0.7), C.main, 0, 0, 0);
  M(core, _box3(0.4, 0.12, 0.46), C.dark, 0, -0.16, 0, { hitMult: 0.7, sub: '하부 프레임' });
  M(core, _box3(0.5, 0.05, 0.5), C.acc, 0, 0.13, 0);
  const hd = P('head', body);
  M(hd, new THREE.SphereGeometry(0.12, 10, 8), C.dark, 0, -0.1, 0.36);
  M(hd, _box3(0.13, 0.07, 0.04), 0x220000, 0, -0.1, 0.47, { emissive: 0xff5a2a, sub: '광학 센서' });
  const pw = P('power', body);
  M(pw, _box3(0.3, 0.12, 0.26), C.dark, 0, 0.19, -0.12);
  M(pw, _box3(0.2, 0.05, 0.16), 0x002211, 0, 0.27, -0.12, { emissive: 0x3dff9a, sub: '배터리 셀' });
  const wp = P('weapon', body);
  M(wp, _box3(0.12, 0.1, 0.3), C.dark, 0, -0.24, 0.12);
  M(wp, new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), 0x1e1e1e, 0, -0.24, 0.42, { rx: Math.PI / 2 });
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.24, 0.62); wp.group.add(muzzle);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.copy(muzzle.position); wp.group.add(glow);
  const discs = [];
  for (const [id, sx, sz] of [['rotorFL', 1, 1], ['rotorFR', -1, 1], ['rotorBL', 1, -1], ['rotorBR', -1, -1]]) {
    const r = P(id, body); r.group.position.set(sx * 0.5, 0.06, sz * 0.5);
    M(r, _box3(0.5, 0.05, 0.07), C.dark, -sx * 0.18, 0, -sz * 0.18, { ry: Math.atan2(sz, -sx) });
    M(r, new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), C.dark, 0, 0.03, 0, { hitMult: 1.5, sub: '모터' });
    const d = M(r, new THREE.CylinderGeometry(0.27, 0.27, 0.02, 14), 0xc8d2d8, 0, 0.1, 0, { opacity: 0.55 });
    discs.push(d);
  }
  return { root, body, parts, muzzle, glow, discs, eyeY: 0, coreY: 0 };
}
function spawnDrone(x, z, alt, opts = {}) {
  const r = buildDrone(), cfg = ETYPES.drone;
  const e = { type: 'drone', drone: true, cfg, root: r.root, body: r.body, parts: r.parts, muzzle: r.muzzle, glow: r.glow, discs: r.discs, eyeY: 0, coreY: 0,
    yaw: opts.yaw ?? rand(0, 6.28), homeYaw: 0, vel: V3(), home: V3(x, 0, z), alert: false, canSee: false, losT: rand(0, 0.2), lastSeen: V3(x, 0, z), lostT: 0,
    fireCd: 1.2, burstLeft: 0, burstT: 0, stunT: 0, empT: 0, stunned: false, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0, phase: Math.random() * 6,
    hitKick: 0, dead: false, sparkT: 0, canShoot: true, pendingAlert: opts.alert || 0, moveSpeed: 0, falling: false, vy: 0, patrolA: rand(0, 6.28),
    noReward: !!opts.noReward, guard: false };
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  r.root.position.set(x, alt ?? cfg.hover, z); r.root.rotation.y = e.yaw;
  GS.world.add(r.root); GS.enemies.push(e);
  if (isHost() && GS.state === 'mission') coopEv({ t: 'spawnd', i: GS.enemies.length - 1, x, z, a: alt ?? cfg.hover });
  return e;
}
function rotorsWorking(e) { return ROTORS.filter(id => { const p = e.parts[id]; return p.attached && p.state !== 'disabled' && p.state !== 'destroyed'; }).length; }
function updateDrone(e, dt) {
  partTick(e, dt);
  const pos = e.root.position, cfg = e.cfg, rw = rotorsWorking(e);
  for (const d of e.discs) if (d.userData.part.attached) d.rotation.y += dt * (e.falling ? 6 : e.stunT > 0 ? 10 : 42);
  if (!e.falling && rw <= 2) {
    e.falling = true; e.vy = 0.5; e.glow.material.opacity = 0;
    addFeed(`${cfg.name} 로터 손실 · 추락`, 'd'); popup('드론 추락', 'ok');
  }
  if (e.falling) {
    e.vy -= 12 * dt; pos.y += e.vy * dt; e.yaw += dt * 7; e.root.rotation.y = e.yaw;
    e.body.rotation.z += dt * 2.2; e.body.rotation.x += dt * 1.3;
    moveWithCollision(pos, e.vel.x * dt, e.vel.z * dt, 0.4, pos.y - 0.3, 0.6, 0); e.vel.multiplyScalar(0.985);
    const g = groundAt(pos.x, pos.z, 0.4, pos.y, 0.05);
    if (pos.y <= g + 0.3) {
      const d = Math.hypot(GS.tg.pos.x - pos.x, GS.tg.pos.z - pos.z);
      for (const T of dmgTargets()) { const td = Math.hypot(T.pos.x - pos.x, T.pos.z - pos.z); if (td < 2.2 && Math.abs(T.pos.y - g) < 2) { hurtTarget(T, 12, pos.clone(), 'crash'); knockTarget(T, T.pos.x - pos.x, T.pos.z - pos.z, 4); } }
      killEnemy(e, 'crash');
    }
    return;
  }
  if (e.pendingAlert > 0) { e.pendingAlert -= dt; if (e.pendingAlert <= 0) { e.pendingAlert = 0; alertEnemy(e); e.lastSeen.copy(GS.tg.pos); } }
  let targetAlt = cfg.hover + Math.sin(GS.time * 1.3 + e.phase) * 0.35 - (rw === 3 ? 1.1 : 0);
  if (e.stunT > 0) {
    e.stunT -= dt; targetAlt = 1.1; e.glow.material.opacity = 0; e.burstLeft = 0;
    if (Math.random() < 0.2) { _v1.copy(pos); burstSparks(_v1, UPY, 2, 0x6ac8ff, 3); }
  }
  const dx = GS.tg.pos.x - pos.x, dz = GS.tg.pos.z - pos.z, dist = Math.hypot(dx, dz) || 0.001;
  e.losT -= dt;
  if (e.losT <= 0 && e.stunT <= 0) {
    e.losT = rand(0.1, 0.16);
    const range = sensorMult(e) > 2 ? 14 : cfg.detect, d3 = Math.hypot(dx, dz, GS.tg.pos.y + 1.4 - pos.y);
    _v1.set(pos.x, pos.y - 0.1, pos.z); _v2.set(GS.tg.pos.x, GS.tg.pos.y + GS.tg.eye - 0.1, GS.tg.pos.z);
    const was = e.canSee;
    e.canSee = d3 < range && !segBlocked(_v1, _v2);
    if (e.canSee) { if (!e.alert) alertEnemy(e); e.lastSeen.copy(GS.tg.pos); e.lostT = 0; if (!was) e.fireCd = Math.max(e.fireCd, 0.45); }
  }
  if (e.alert && !e.canSee) { e.lostT += dt; if (e.lostT > 8) { e.alert = false; e.lostT = 0; } }
  // 이동
  let mx = 0, mz = 0, spd = cfg.speed * (rw === 3 ? 0.7 : 1);
  if (e.stunT > 0) spd = 0;
  else if (e.alert) {
    if (!e.canShoot) { mx = -dx / dist; mz = -dz / dist; }
    else if (e.canSee) {
      e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = rand(2, 4); e.strafeDir = Math.random() < 0.5 ? 1 : -1; }
      const nx = dx / dist, nz = dz / dist, f = clamp((dist - cfg.prefDist) / 6, -1, 1);
      mx = nx * f - nz * e.strafeDir * 0.8; mz = nz * f + nx * e.strafeDir * 0.8;
    } else { const lx = e.lastSeen.x - pos.x, lz = e.lastSeen.z - pos.z, ld = Math.hypot(lx, lz); if (ld > 2) { mx = lx / ld; mz = lz / ld; } }
  } else {
    e.patrolA += dt * 0.35; spd *= 0.35;
    const tx = e.home.x + Math.cos(e.patrolA) * 5 - pos.x, tz = e.home.z + Math.sin(e.patrolA) * 5 - pos.z, td = Math.hypot(tx, tz);
    if (td > 0.3) { mx = tx / td; mz = tz / td; }
  }
  const ml = Math.hypot(mx, mz); if (ml > 0.01) { mx /= ml; mz /= ml; }
  const k = clamp(dt * 2.5, 0, 1);
  e.vel.x = lerp(e.vel.x, mx * spd, k); e.vel.z = lerp(e.vel.z, mz * spd, k);
  for (const o of GS.enemies) if (o !== e && !o.dead && o.drone) {
    const ox = pos.x - o.root.position.x, oz = pos.z - o.root.position.z, od = Math.hypot(ox, oz);
    if (od < 1.8 && od > 0.01) { e.vel.x += ox / od * 4 * dt; e.vel.z += oz / od * 4 * dt; }
  }
  moveWithCollision(pos, e.vel.x * dt, e.vel.z * dt, 0.5, pos.y - 0.35, 0.7, 0);
  pos.x = clamp(pos.x, -GS.MAPB.x, GS.MAPB.x); pos.z = clamp(pos.z, -GS.MAPB.z, GS.MAPB.z);
  targetAlt = Math.max(targetAlt, groundAt(pos.x, pos.z, 0.6, pos.y, 0.2) + 1.4);
  pos.y = lerp(pos.y, targetAlt, clamp(dt * 1.8, 0, 1));
  e.moveSpeed = Math.hypot(e.vel.x, e.vel.z);
  // 방향 · 기울기
  const ty = e.alert && e.canSee ? Math.atan2(dx, dz) : (e.moveSpeed > 0.3 ? Math.atan2(e.vel.x, e.vel.z) : e.yaw);
  e.yaw += clamp(angDiff(ty, e.yaw), -cfg.turn * dt, cfg.turn * dt); e.root.rotation.y = e.yaw;
  const fwd = e.vel.x * Math.sin(e.yaw) + e.vel.z * Math.cos(e.yaw), side = e.vel.x * Math.cos(e.yaw) - e.vel.z * Math.sin(e.yaw);
  e.hitKick = Math.max(0, e.hitKick - dt * 1.2);
  e.body.rotation.x = lerp(e.body.rotation.x, clamp(fwd * 0.04, -0.3, 0.3) - e.hitKick, 0.1);
  e.body.rotation.z = lerp(e.body.rotation.z, clamp(side * 0.04, -0.3, 0.3) + (rw === 3 ? Math.sin(GS.time * 9) * 0.15 : 0) + (e.stunT > 0 ? Math.sin(GS.time * 25) * 0.1 : 0), 0.1);
  // 사격
  if (e.alert && e.canSee && e.canShoot && e.stunT <= 0) {
    const yawErr = Math.abs(angDiff(Math.atan2(dx, dz), e.yaw));
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { enemyFire(e, dist); e.burstLeft--; e.burstT = cfg.burstGap; if (!e.burstLeft) e.fireCd = cfg.cooldown * rand(0.85, 1.25); }
    } else {
      e.fireCd -= dt; e.glow.material.opacity = e.fireCd < 0.4 ? 0.6 : 0;
      if (e.fireCd <= 0 && yawErr < 0.35) { e.burstLeft = cfg.burst; e.burstT = 0; }
    }
  } else { e.burstLeft = 0; e.glow.material.opacity = 0; }
}

// ---------------- 저격형 (조준선) ----------------
const laserGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); laserGeo.translate(0, 0.5, 0);
function addSniperLaser(e) {
  const m = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; GS.world.add(m); e.laser = m; e.aimT = 0; e.aimPt = V3();
}
function sniperAttack(e, dt, dx, dz, dist) {
  const cfg = e.cfg, wp = e.parts.weapon, L = e.laser, blind = sensorMult(e) > 2;
  const chest = V3(player.pos.x, player.pos.y + lerp(1.2, 0.8, player.crouch), player.pos.z);
  let show = false;
  if (e.alert && e.canSee && e.canShoot && e.stunT <= 0 && wp.attached) {
    const dy = chest.y - (e.root.position.y + e.coreY + 0.2);
    wp.group.rotation.x = lerp(wp.group.rotation.x, -Math.atan2(dy, dist), 0.2);
    e.fireCd -= dt;
    const yawErr = Math.abs(angDiff(Math.atan2(dx, dz), e.yaw));
    if (e.fireCd <= 0 && yawErr < 0.25) {
      if (e.aimT <= 0) e.aimPt.copy(chest).add(V3(rand(-1.2, 1.2), rand(-0.3, 0.6), rand(-1.2, 1.2)));
      e.aimT += dt;
      // 조준점은 플레이어를 늦게 따라온다 → 계속 움직이면 빗나감
      e.aimPt.lerp(chest, clamp(dt * 4.5, 0, 1));
      const need = cfg.aimTime * (blind ? 0.7 : 1), k = e.aimT / need;
      show = !blind;
      if (L && show) {
        e.root.updateMatrixWorld(true); const m = e.muzzle.getWorldPosition(_v1);
        const dir = _v2.copy(e.aimPt).sub(m); let len = dir.length(); dir.divideScalar(len || 1);
        const hit = segFirstHit(m, dir, len); if (hit >= 0) len = hit; else len = Math.max(0.5, len - 0.9);
        L.position.copy(m); L.quaternion.setFromUnitVectors(UPY, dir);
        const w = 0.007 + 0.014 * k; L.scale.set(w, len, w);
        L.material.opacity = clamp(0.25 + 0.65 * k, 0, 0.95) * (k > 0.8 ? 0.6 + 0.4 * Math.sin(GS.time * 50) : 1);
      }
      if (k > 0.72 && !e.beeped) { e.beeped = true; SFX.lock(); }
      if (k >= 1) {
        enemyFire(e, dist, blind ? null : e.aimPt.clone(), blind ? 18 : 1);
        e.aimT = 0; e.beeped = false; e.fireCd = cfg.cooldown * rand(0.9, 1.2); show = false;
      }
    } else e.aimT = Math.max(0, e.aimT - dt * 3);
  } else { e.aimT = 0; e.beeped = false; if (wp.attached) wp.group.rotation.x = lerp(wp.group.rotation.x, 0, 0.1); }
  if (L) L.visible = show && e.aimT > 0;
}

// ---------------- 중계탑 ----------------
function buildRelay() {
  const cfg = ETYPES.relay, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = {}, { P, M } = partKit(cfg, parts, { armor: '보호 외피', core: '중계기 본체', power: '송신 코일' });
  const core = P('core', body);
  M(core, _box3(1.0, 1.5, 1.0), 0x5d6168, 0, 1.95, 0);
  M(core, _box3(0.6, 0.3, 0.6), 0x3a3d42, 0, 2.85, 0);
  const ar = P('armor', body);
  for (const [x, z, w, d] of [[0, 0.55, 1.12, 0.08], [0, -0.55, 1.12, 0.08], [0.55, 0, 0.08, 1.12], [-0.55, 0, 0.08, 1.12]]) M(ar, _box3(w, 1.15, d), 0xb08a3a, x, 1.95, z);
  core.protectedBy.push('armor');
  const pw = P('power', body);
  M(pw, new THREE.CylinderGeometry(0.08, 0.1, 1.4, 8), 0x2f3236, 0, 3.6, 0);
  const coils = [];
  for (const y of [3.25, 3.65, 4.05]) coils.push(M(pw, new THREE.TorusGeometry(0.32, 0.07, 6, 16), 0x113344, 0, y, 0, { emissive: 0x5ff6ff, rx: Math.PI / 2, sub: '송신 코일' }));
  M(pw, new THREE.SphereGeometry(0.16, 10, 8), 0x113344, 0, 4.45, 0, { emissive: 0x5ff6ff, sub: '송신 코일' });
  return { root, body, parts, coils };
}
function spawnRelay(x, z) {
  addBox(x, z, 1.7, 1.7, 1.2, 0x44484e);
  const r = buildRelay(), cfg = ETYPES.relay;
  const e = { type: 'relay', relay: true, cfg, root: r.root, body: r.body, parts: r.parts, coils: r.coils, glow: dummyGlow(), eyeY: 3, coreY: 1.95,
    yaw: 0, home: V3(x, 0, z), alert: false, dead: false, stunT: 0, empT: 0, hitKick: 0, sparkT: 0, canShoot: false, canSee: false, lastSeen: V3(), pendingAlert: 0,
    spawnT: rand(5, 9), spawnLeft: 4, kids: [], fireCd: 0, burstLeft: 0, moveSpeed: 0 };
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  r.root.position.set(x, 0, z); GS.world.add(r.root); GS.enemies.push(e);
  return e;
}
function updateRelay(e, dt) {
  partTick(e, dt);
  const on = partAlive(e.parts.power) && e.parts.power.state !== 'disabled' && e.stunT <= 0;
  e.coils.forEach((m, i) => { if (e.parts.power.flash <= 0 && e.parts.power.attached) m.material.emissive.setHex(0x5ff6ff).multiplyScalar(on ? 0.5 + 0.5 * Math.max(0, Math.sin(GS.time * 6 - i * 1.2)) : 0.05); });
  if (e.pendingAlert > 0) { e.pendingAlert -= dt; if (e.pendingAlert <= 0) { e.pendingAlert = 0; e.alert = true; } }
  if (!e.alert && Math.hypot(player.pos.x - e.home.x, player.pos.z - e.home.z) < 30) e.alert = true;
  if (e.stunT > 0) { e.stunT -= dt; return; }
  if (!on) return;
  e.spawnT -= dt * (e.alert ? 1 : 0.4);
  if (e.spawnT <= 0) {
    e.spawnT = e.alert ? 12 : 18;
    const kids = e.kids.filter(k => !k.dead).length, drones = GS.enemies.filter(o => o.drone && !o.dead).length;
    if (e.spawnLeft > 0 && kids < 2 && drones < 7) {
      e.spawnLeft--;
      const d = spawnDrone(e.home.x, e.home.z, 4.6, { alert: e.alert ? 0.6 : 0, noReward: true });
      d.home.set(e.home.x + rand(-4, 4), 0, e.home.z + rand(-4, 4));
      e.kids.push(d); spawnFlash(V3(e.home.x, 4.5, e.home.z), 1.6, 0.2, 0x5ff6ff); SFX.shock();
      addFeed(`${e.cfg.name} 드론 사출 · 남은 사출 ${e.spawnLeft}회`, 'k');
    }
  }
}

export { ROTORS, _box3, addSniperLaser, buildDrone, dummyGlow, partKit, rotorsWorking, sniperAttack, spawnDrone, spawnRelay, updateDrone, updateRelay };
