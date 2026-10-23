import * as THREE from 'three';
import { GS } from '../core/state.js?v=35';
import { V3, _v1, _v2, _v3, angDiff, clamp, lerp, rand } from '../core/utils.js?v=35';
import { SFX } from '../core/audio.js?v=35';
import { scene } from '../core/renderer.js?v=35';
import { moveWithCollision, segBlocked, segFirstHit } from '../world/world.js?v=35';
import { FX, UPY, burstSparks, poolGet, projGeo, spawnFlash } from '../fx/effects.js?v=35';
import { updatePartVisual } from './robot.js?v=35';
import { updateCore } from '../bosses/core.js?v=35';
import { tutPassiveTick } from '../modes/tutorial.js?v=35';
import { legFactor, partAlive, sensorMult } from '../combat/damage.js?v=35';
import { updateBoss } from '../bosses/rex.js?v=35';
import { updateDragon } from '../bosses/dragon.js?v=35';
import { sniperAttack, updateDrone, updateRelay } from './extra.js?v=35';
import { updateMite, updateSpider } from '../bosses/spider.js?v=35';
import { coopEv, dmgTargets, hurtTarget, isGuest, pickTarget, puppetUpdate, v3a } from '../modes/coop.js?v=35';
import { applyHard } from '../modes/difficulty.js?v=35';

// =====================================================================
//  적 AI
// =====================================================================
function alertEnemy(e) {
  if (e.alert || e.dead) return;
  e.alert = true; e.fireCd = Math.max(e.fireCd, e.cfg.reaction * rand(0.8, 1.3));
  for (const o of GS.enemies) if (o !== e && !o.dead && !o.alert && o.root.position.distanceTo(e.root.position) < 8) o.pendingAlert = o.pendingAlert || rand(1.0, 1.8);
}
function enemySees(e, dx, dz, dist) {
  const sensorBroken = sensorMult(e) > 2;
  const range = sensorBroken ? 12 : e.cfg.detect;
  if (dist > range) return false;
  if (!e.alert && dist > 4) {
    const ang = Math.abs(angDiff(Math.atan2(dx, dz), e.yaw));
    if (ang > (sensorBroken ? 0.6 : 1.05)) return false;
  }
  _v1.set(e.root.position.x, e.root.position.y + e.eyeY, e.root.position.z);
  _v2.set(GS.tg.pos.x, GS.tg.pos.y + GS.tg.eye - 0.1, GS.tg.pos.z);
  return !segBlocked(_v1, _v2);
}
function enemyFire(e, dist, aimAt = null, spMul = 1) {
  const cfg = e.cfg;
  e.root.updateMatrixWorld(true);
  const m = e.muzzle.getWorldPosition(V3());
  const target = aimAt || V3(GS.tg.pos.x, GS.tg.pos.y + lerp(1.15, 0.75, GS.tg.crouch), GS.tg.pos.z);
  const dir = target.sub(m).normalize();
  const sp = cfg.spread * spMul * (aimAt ? 1 : sensorMult(e) * (GS.tg.hspeed > 3.5 ? 1.35 : 1));
  dir.add(V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(sp)).normalize();
  const pr = poolGet(FX.projs, 80, () => {
    const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scene.add(mesh); return { mesh, vel: V3(), prev: V3() };
  });
  pr.alive = true; pr.life = 3; pr.dmg = cfg.projDmg; pr.src = e;
  pr.mesh.visible = true; pr.mesh.material.color.setHex(cfg.projColor);
  pr.mesh.position.copy(m); pr.vel.copy(dir).multiplyScalar(cfg.projSpeed);
  pr.mesh.scale.set(cfg.projSize, cfg.projSize, cfg.projSize * 3.5);
  pr.mesh.lookAt(_v1.copy(m).add(dir));
  spawnFlash(m, e.type === 'heavy' || e.type === 'sniper' ? 0.7 : 0.4, 0.06, cfg.projColor);
  coopEv({ t: 'eshot', f: v3a(m), d: v3a(dir), s: cfg.projSpeed, c: cfg.projColor, z: cfg.projSize, k: e.type });
  SFX.eshot(e.type, dist);
}
function updateProjectiles(dt) {
  for (const pr of FX.projs) {
    if (!pr.alive) continue;
    pr.life -= dt; if (pr.life <= 0) { pr.alive = false; pr.mesh.visible = false; continue; }
    pr.prev.copy(pr.mesh.position);
    pr.mesh.position.addScaledVector(pr.vel, dt);
    const p = pr.mesh.position;
    // 플레이어 판정 (구간 샘플링)
    let hitP = null;
    const ns = Math.max(4, Math.ceil(pr.prev.distanceTo(p) / 0.25)), tl = isGuest() ? [] : dmgTargets();
    for (let k = 1; k <= ns && !hitP; k++) {
      _v1.lerpVectors(pr.prev, p, k / ns);
      for (const T of tl) { const dx = _v1.x - T.pos.x, dz = _v1.z - T.pos.z;
        if (dx * dx + dz * dz < 0.42 * 0.42 && _v1.y > T.pos.y + 0.05 && _v1.y < T.pos.y + T.height + 0.05) { hitP = T; break; } }
    }
    // 벽 판정
    _v2.subVectors(p, pr.prev); const len = _v2.length(); _v2.divideScalar(len || 1);
    const t = segFirstHit(pr.prev, _v2, len);
    if (t >= 0 && !hitP) {
      _v3.copy(pr.prev).addScaledVector(_v2, t);
      burstSparks(_v3, _v2.clone().negate(), 4, pr.mesh.material.color.getHex(), 3); spawnFlash(_v3, 0.3, 0.05, pr.mesh.material.color.getHex());
      pr.alive = false; pr.mesh.visible = false; continue;
    }
    if (hitP) { hurtTarget(hitP, pr.dmg, pr.prev, 'gun'); pr.alive = false; pr.mesh.visible = false; continue; }
    if (p.y < 0) { pr.alive = false; pr.mesh.visible = false; }
  }
}

function updateEnemy(e, dt) {
  if (e.dead) return;
  if (!e.hardDone) applyHard(e);
  if (GS.HARD && e.boss && e.bs && e.bs.cd && !isGuest()) for (const k in e.bs.cd) e.bs.cd[k] -= dt * 0.25;
  if (GS.run && GS.run.mission.extreme && e.boss && e.bs && e.bs.cd && !isGuest()) for (const k in e.bs.cd) e.bs.cd[k] += dt * 0.25;
  if (isGuest()) { puppetUpdate(e, dt); return; }
  if (e.tutPassive) { tutPassiveTick(e, dt); return; }
  GS.tg = pickTarget(e, dt);
  if (e.fcore) { updateCore(e, dt); return; }
  if (e.dragon) { updateDragon(e, dt); return; }
  if (e.spider) { updateSpider(e, dt); return; }
  if (e.boss) { updateBoss(e, dt); return; }
  if (e.mite) { updateMite(e, dt); return; }
  if (e.drone) { updateDrone(e, dt); return; }
  if (e.relay) { updateRelay(e, dt); return; }
  const cfg = e.cfg, pos = e.root.position;
  for (const id in e.parts) { const p = e.parts[id]; if (p.flash > 0) { p.flash -= dt; if (p.flash <= 0 && p.attached) updatePartVisual(p); } }
  // 손상 부위 스파크
  e.sparkT -= dt;
  if (e.sparkT <= 0) {
    e.sparkT = rand(0.25, 0.6);
    for (const id in e.parts) {
      const p = e.parts[id];
      if (p.attached && (p.state === 'disabled' || (p.state === 'damaged' && p.hp < p.maxHp * 0.4)) && Math.random() < 0.6) {
        p.meshes[0].getWorldPosition(_v1); burstSparks(_v1, UPY, 3, 0xffa040, 2.5);
      }
    }
  }
  if (e.pendingAlert > 0) { e.pendingAlert -= dt; if (e.pendingAlert <= 0) { e.pendingAlert = 0; alertEnemy(e); e.lastSeen.copy(GS.tg.pos); } }
  const dx = GS.tg.pos.x - pos.x, dz = GS.tg.pos.z - pos.z, dist = Math.hypot(dx, dz) || 0.001;
  e.losT -= dt;
  if (e.losT <= 0) {
    e.losT = rand(0.09, 0.16);
    const was = e.canSee;
    e.canSee = enemySees(e, dx, dz, dist);
    if (e.canSee) { if (!e.alert) alertEnemy(e); e.lastSeen.copy(GS.tg.pos); e.lostT = 0; if (!was) e.fireCd = Math.max(e.fireCd, 0.35); }
  }
  if (e.alert && !e.canSee) { e.lostT += dt; if (e.lostT > 7) { e.alert = false; e.lostT = 0; e.patrolT = 0; e.burstLeft = 0; } }
  e.hitKick = Math.max(0, e.hitKick - dt * 1.2);
  const lf = legFactor(e);
  // 기절 (센서 무력화 직후)
  if (e.stunT > 0) {
    e.stunT -= dt; e.glow.material.opacity = 0; if (e.laser) { e.laser.visible = false; e.aimT = 0; e.beeped = false; }
    if (e.empT > 0) { e.empT -= dt; if (Math.random() < 0.25) { e.parts.core.meshes[0].getWorldPosition(_v1); burstSparks(_v1, UPY, 2, 0x6ac8ff, 3); } }
    e.body.rotation.z = Math.sin(GS.time * 28) * 0.05; e.body.rotation.x = -e.hitKick;
    animateLegs(e, 0, dt); return;
  }
  // 이동 결정
  let mx = 0, mz = 0, spd = cfg.speed * lf;
  if (e.perch || (cfg.sniper && e.aimT > 0)) spd = 0;
  if (e.alert) {
    if (!e.canShoot) { if (dist < 22) { mx = -dx / dist; mz = -dz / dist; } }
    else if (!e.canSee) {
      // 마지막 목격 지점이 담당 구역 안일 때만 추적
      const lx = e.lastSeen.x - pos.x, lz = e.lastSeen.z - pos.z, ld = Math.hypot(lx, lz);
      const lh = Math.hypot(e.lastSeen.x - e.home.x, e.lastSeen.z - e.home.z);
      if (ld > 1.5 && (e.mayAdvance || lh < cfg.leash) && e.lostT < 5) { mx = lx / ld; mz = lz / ld; }
    } else {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = rand(1.5, 3.5); e.strafeDir = Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? 1 : -1); }
      let f = 0;
      if (dist > cfg.prefDist + 4 && e.mayAdvance) f = 1; else if (dist < cfg.prefDist - 3) f = -1;
      const nx = dx / dist, nz = dz / dist, sa = e.mayAdvance ? 0.7 : 0.45;
      mx = nx * f - nz * e.strafeDir * sa; mz = nz * f + nx * e.strafeDir * sa;
    }
    // 담당 구역을 벗어나는 이동은 막고 구역 쪽으로 되돌림 (전진 권한이 있으면 1.6배까지 허용)
    const hx = pos.x - e.home.x, hz = pos.z - e.home.z, hd = Math.hypot(hx, hz);
    const lim = cfg.leash * (e.mayAdvance ? 1.6 : 1);
    if (hd > lim && (mx * hx + mz * hz) > 0) { mx = -hx / hd * 0.6; mz = -hz / hd * 0.6; }
    if (!e.canSee && !mx && !mz && hd > 1.5) { mx = -hx / hd; mz = -hz / hd; spd *= 0.6; }
  } else if (!e.guard) {
    e.patrolT -= dt; spd *= 0.4;
    const tx = e.patrolTarget.x - pos.x, tz = e.patrolTarget.z - pos.z, td = Math.hypot(tx, tz);
    if (td < 0.6 || e.patrolT <= 0) { e.patrolTarget.set(e.home.x + rand(-6, 6), 0, e.home.z + rand(-6, 6)); e.patrolT = rand(3, 6); }
    else if (e.patrolT < 4.5) { mx = tx / td; mz = tz / td; }
  }
  if (e.detourT > 0) { e.detourT -= dt; mx = e.detour.x; mz = e.detour.z; }
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01 && spd > 0) {
    mx /= ml; mz /= ml;
    const ox = pos.x, oz = pos.z, step = spd * dt;
    moveWithCollision(pos, mx * step, mz * step, cfg.radius, 0, 2, 0.3);
    const moved = Math.hypot(pos.x - ox, pos.z - oz);
    e.moveSpeed = moved / dt;
    if (moved < step * 0.3) {
      e.stuckT += dt;
      if (e.stuckT > 0.5) { e.stuckT = 0; e.strafeDir = -e.strafeDir || 1; const s = Math.random() < 0.5 ? 1 : -1; e.detour.set(-mz * s, 0, mx * s); e.detourT = rand(0.6, 1.2); e.patrolT = 0; }
    } else e.stuckT = 0;
  } else e.moveSpeed = 0;
  // 적끼리 겹침 방지
  for (const o of GS.enemies) {
    if (o === e || o.dead) continue;
    const ox = pos.x - o.root.position.x, oz = pos.z - o.root.position.z, od = Math.hypot(ox, oz), min = cfg.radius + o.cfg.radius;
    if (od < min && od > 0.001) { const push = (min - od) * 0.5; moveWithCollision(pos, ox / od * push, oz / od * push, cfg.radius, 0, 2, 0.3); }
  }
  // 방향 전환
  let ty = e.yaw;
  if (e.alert && e.canShoot) ty = e.canSee ? Math.atan2(dx, dz) : Math.atan2(e.lastSeen.x - pos.x, e.lastSeen.z - pos.z);
  else if (e.moveSpeed > 0.2) ty = Math.atan2(mx, mz);
  else if (e.guard && !e.alert) ty = e.homeYaw + Math.sin(GS.time * 0.35 + e.phase) * 0.7;
  const turn = cfg.turn * (sensorMult(e) > 2 ? 0.6 : 1) * dt;
  const da = angDiff(ty, e.yaw); e.yaw += clamp(da, -turn, turn);
  e.root.rotation.y = e.yaw;
  // 공격
  if (cfg.sniper) { sniperAttack(e, dt, dx, dz, dist); animateLegs(e, e.moveSpeed, dt); return; }
  const wp = e.parts.weapon;
  if (e.alert && e.canSee && e.canShoot) {
    const yawErr = Math.abs(angDiff(Math.atan2(dx, dz), e.yaw));
    const dy = (GS.tg.pos.y + 1.15) - (e.coreY + 0.2);
    if (wp.attached) wp.group.rotation.x = lerp(wp.group.rotation.x, -Math.atan2(dy, dist), 0.15);
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { enemyFire(e, dist); e.burstLeft--; e.burstT = cfg.burstGap; if (e.burstLeft === 0) e.fireCd = cfg.cooldown * rand(0.85, 1.25); }
      e.glow.material.opacity = cfg.windup ? 0.7 : 0;
    } else {
      e.fireCd -= dt;
      e.glow.material.opacity = cfg.windup && e.fireCd < cfg.windup ? clamp(1 - e.fireCd / cfg.windup, 0, 1) * (0.6 + 0.4 * Math.sin(GS.time * 40)) : 0;
      if (e.fireCd <= 0 && yawErr < 0.3) { e.burstLeft = cfg.burst; e.burstT = 0; }
    }
  } else {
    e.glow.material.opacity = 0; e.burstLeft = 0;
    if (wp.attached) wp.group.rotation.x = lerp(wp.group.rotation.x, 0, 0.1);
  }
  animateLegs(e, e.moveSpeed, dt);
}
function animateLegs(e, speed, dt) {
  const L = e.parts.legL, R = e.parts.legR;
  e.phase += speed * dt * 3.2;
  const amp = speed > 0.1 ? 0.5 : 0;
  if (L.attached) L.group.rotation.x = L.state === 'disabled' ? 0.35 : Math.sin(e.phase) * amp;
  if (R.attached) R.group.rotation.x = R.state === 'disabled' ? 0.35 : -Math.sin(e.phase) * amp;
  const lb = !partAlive(L) || L.state === 'disabled', rb = !partAlive(R) || R.state === 'disabled';
  const tz = (lb ? 0.14 : 0) - (rb ? 0.14 : 0);
  const ty = lb && rb ? -0.45 : (lb || rb ? -0.08 : 0);
  e.body.rotation.z = lerp(e.body.rotation.z, tz + (e.stunT > 0 ? Math.sin(GS.time * 28) * 0.05 : 0), 0.12);
  e.body.position.y = lerp(e.body.position.y, ty + (speed > 0.1 ? Math.abs(Math.sin(e.phase)) * 0.03 : 0), 0.15);
  e.body.rotation.x = -e.hitKick;
}

export { alertEnemy, animateLegs, enemyFire, updateEnemy, updateProjectiles };
