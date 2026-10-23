import { GS } from '../core/state.js?v=34';
import { $, V3, _v1, _v2, _v3, clamp, lerp } from '../core/utils.js?v=34';
import { W, maxReserve, utilOn } from '../data/data.js?v=34';
import { writeSave } from '../core/save.js?v=34';
import { SFX } from '../core/audio.js?v=34';
import { BASE_FOV, camera, controls } from '../core/renderer.js?v=34';
import { groundAt, moveWithCollision } from '../world/world.js?v=34';
import { UPY, spawnSpark } from '../fx/effects.js?v=34';
import { GUNS, HIP_POS } from './viewmodel.js?v=34';
import { EYE, GRAV, P_HEIGHT, P_RADIUS, STEP, curW, curWeapon, player, recoil } from './playerState.js?v=34';
import { kd } from './input.js?v=34';
import { applyLook, finishReload, shootOnce, startReload, tryFire, updateCharge } from '../combat/shooting.js?v=34';
import { coopDown, coopOn } from '../modes/coop.js?v=34';
import { HARD_MUL } from '../modes/difficulty.js?v=34';
import { achEvent } from '../meta/achievements.js?v=34';
import { inExtraction, loadMult, nearestCrate, nearestLoot } from '../game/loot.js?v=34';
import { addFeed } from '../ui/hud.js?v=34';
import { endMission } from '../game/result.js?v=34';

// =====================================================================
//  플레이어 피해
// =====================================================================
GS.godMode = false; // 테스트 전용
GS.dmgLog = {};
function damagePlayer(dmg, from, src = 'etc') {
  if (GS.state !== 'mission' || GS.godMode || player.downed) return;
  if (GS.run.iframeT > 0) { achEvent('iframe', { src }); return; }
  let d = dmg * (1 - player.dr) * (GS.HARD && src !== 'self' ? HARD_MUL.dmg : 1);
  if (GS.run.shield > 0) { const ab = Math.min(GS.run.shield, d); GS.run.shield -= ab; d -= ab; if (d <= 0) { SFX.hit('armor'); return; } }
  GS.dmgLog[src] = (GS.dmgLog[src] || 0) + d;
  achEvent('hurt', { d, src });
  player.hp -= d; player.lastHurt = GS.time;
  GS.vigT = Math.min(1, GS.vigT + 0.35 + d / 40); GS.shake = Math.max(GS.shake, 0.01); SFX.hurt();
  // 피격 방향 표시
  const fwd = camera.getWorldDirection(_v1); const a = Math.atan2(from.x - player.pos.x, from.z - player.pos.z) - Math.atan2(fwd.x, fwd.z);
  $('dmgdir').style.transform = `rotate(${-a}rad)`; GS.dmgDirT = 1;
  if (GS.run.mission.tut && player.hp < 1) player.hp = 1;
  if (player.hp <= 0) { player.hp = 0; if (coopOn()) coopDown(); else endMission('dead'); }
}

// =====================================================================
//  메인 업데이트
// =====================================================================
function updatePlayer(dt) {
  const w = curW();
  if (player.downed) { GS.ads = 0; GS.mouseDown = false; player.vel.set(0, 0, 0); player.eye = lerp(player.eye, 0.5, clamp(dt * 4, 0, 1)); camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z); return; }
  // 정조준
  const wantAds = GS.rightDown && GS.run.switchT <= 0;
  GS.ads = clamp(GS.ads + (wantAds ? 1 : -1) * dt * (w.scope ? 6 : 9), 0, 1);
  const fov = lerp(BASE_FOV, w.adsFov, GS.ads);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  controls.pointerSpeed = GS.save.sens * (fov / BASE_FOV);
  // 이동
  const f = (kd('fwd') ? 1 : 0) - (kd('back') ? 1 : 0), s = (kd('right') ? 1 : 0) - (kd('left') ? 1 : 0);
  const fwd = camera.getWorldDirection(_v1); fwd.y = 0; fwd.normalize();
  const right = _v2.set(-fwd.z, 0, fwd.x);
  const wish = _v3.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);
  if (wish.lengthSq() > 0) wish.normalize();
  const wantCrouch = kd('crouch');
  player.crouch = clamp(player.crouch + (wantCrouch ? 1 : -1) * dt * 7, 0, 1);
  player.eye = lerp(EYE, 1.02, player.crouch); player.height = lerp(P_HEIGHT, 1.22, player.crouch);
  const lm = loadMult();
  const sprint = kd('sprint') && player.crouch < 0.3 && lm > 0.5;
  const spd = 5.2 * (sprint && f > 0 && GS.ads < 0.2 ? 1.55 : 1) * (1 - 0.45 * GS.ads) * (1 - 0.5 * player.crouch) * w.moveMult * lm;
  const acc = player.onGround ? 14 : 3;
  if (GS.run.dashT > 0) { GS.run.dashT -= dt; if (Math.random() < 0.5) spawnSpark(camera.position.clone().add(V3(0, -1, 0)), UPY, 0x8ad8ff, 2, 0.2); }
  else {
    player.vel.x = lerp(player.vel.x, wish.x * spd, clamp(acc * dt, 0, 1));
    player.vel.z = lerp(player.vel.z, wish.z * spd, clamp(acc * dt, 0, 1));
  }
  moveWithCollision(player.pos, player.vel.x * dt, player.vel.z * dt, P_RADIUS, player.pos.y, player.height, STEP);
  player.hspeed = Math.hypot(player.vel.x, player.vel.z);
  for (const e of GS.enemies) if (e.boss && !e.dragon && !e.noPush && !e.dead) {
    const bx = player.pos.x - e.root.position.x, bz = player.pos.z - e.root.position.z, bd = Math.hypot(bx, bz), mn = e.cfg.radius + P_RADIUS;
    if (bd < mn && bd > 0.001) moveWithCollision(player.pos, bx / bd * (mn - bd), bz / bd * (mn - bd), P_RADIUS, player.pos.y, player.height, STEP);
  }
  // 수직
  const prevFeet = player.pos.y;
  player.vy -= GRAV * dt; player.pos.y += player.vy * dt;
  const g = groundAt(player.pos.x, player.pos.z, P_RADIUS * 0.8, prevFeet, STEP);
  if (player.pos.y <= g) { player.pos.y = g; player.vy = 0; player.onGround = true; } else player.onGround = false;
  // 체력 재생
  const rg = utilOn('regen');
  if (GS.time - player.lastHurt > (rg ? 3 : 5) && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + (rg ? 10 : 5) * (GS.HARD ? 0.5 : 1) * dt);
  for (let i = 0; i < 2; i++) GS.run.skillCd[i] = Math.max(0, GS.run.skillCd[i] - dt);
  GS.run.iframeT = Math.max(0, GS.run.iframeT - dt); GS.run.ocT = Math.max(0, GS.run.ocT - dt); GS.run.focusT = Math.max(0, GS.run.focusT - dt); GS.run.throwCd = Math.max(0, GS.run.throwCd - dt);
  if (GS.run.shieldT > 0) { GS.run.shieldT -= dt; if (GS.run.shieldT <= 0) GS.run.shield = 0; }
  if (GS.run.nanoT > 0) { GS.run.nanoT -= dt; player.hp = Math.min(player.maxHp, player.hp + 15 * dt); }
  { const pw = GS.run.ws.find(x => x.reserve === 0) || GS.run.ws[0]; if (pw.reserve === 0 && GS.save.inv.ammo > 0) { GS.save.inv.ammo--; writeSave(); pw.reserve = maxReserve(pw.id); SFX.reload(); addFeed(`탄약 보급 팩 자동 사용 · 남은 ${GS.save.inv.ammo}개`, 'p'); } }
  if (GS.run.burstLeft > 0) {
    GS.run.burstT -= dt;
    if (GS.run.burstT <= 0) { if (curWeapon().mag > 0 && GS.run.reloadT <= 0 && GS.run.switchT <= 0) { shootOnce(); GS.run.burstLeft--; GS.run.burstT = w.burstGap; } else GS.run.burstLeft = 0; }
  }
  // 카메라
  if (player.onGround && player.hspeed > 0.5) GS.bobT += dt * player.hspeed * 1.7;
  const bob = Math.sin(GS.bobT * 2) * 0.03 * clamp(player.hspeed / 5, 0, 1) * (1 - GS.ads);
  camera.position.set(player.pos.x, player.pos.y + player.eye + bob, player.pos.z);
  // 반동 복구
  const prev = recoil.cur;
  recoil.cur = lerp(recoil.cur, recoil.target, clamp(dt * 28, 0, 1));
  applyLook(recoil.cur - prev, 0);
  recoil.target *= Math.exp(-dt * (GS.mouseDown && w.auto ? 2.5 : 7));
  if (GS.shake > 0) { applyLook((Math.random() - 0.5) * GS.shake, (Math.random() - 0.5) * GS.shake); GS.shake = Math.max(0, GS.shake - dt * 0.08); }
  // 사격
  GS.fireCd = Math.max(0, GS.fireCd - dt);
  GS.bloom = Math.max(0, GS.bloom - dt * (GS.mouseDown && w.auto ? 0.02 : 0.1));
  if (GS.run.switchT > 0) GS.run.switchT -= dt;
  if (GS.run.reloadT > 0) { GS.run.reloadT -= dt; if (GS.run.reloadT <= 0) { GS.run.reloadT = 0; finishReload(); } }
  { const cw = curWeapon(); if (cw.mag === 0 && cw.reserve > 0 && GS.run.reloadT <= 0 && GS.run.switchT <= 0 && GS.fireCd <= 0) startReload(); }
  if (w.charge) updateCharge(dt, w);
  else if (GS.mouseDown) {
    if (w.auto) tryFire();
    else if (!GS.firedThisPress && GS.fireCd <= 0) { if (tryFire() || curWeapon().mag <= 0) GS.firedThisPress = true; }
  }
  // 조기 탈출: 목표 미완료 시 E를 1.5초 누르고 있어야 함 (출발 지점에서의 실수 방지)
  if (kd('use') && !GS.run.objDone && !GS.run.tut && !coopOn() && inExtraction() && !nearestCrate() && !nearestLoot()) {
    GS.run.exHold = (GS.run.exHold || 0) + dt;
    if (GS.run.exHold >= 1.5) { GS.run.exHold = 0; endMission('extract'); return; }
  } else GS.run.exHold = 0;
}
function updateViewmodel(dt) {
  const ws = curWeapon(), g = GUNS[ws.id], w = W(ws.id);
  const scoped = w.scope && GS.ads > 0.85;
  g.visible = !scoped;
  GS.vmKick = Math.max(0, GS.vmKick - dt * 7);
  GS.swayX = lerp(GS.swayX, clamp(-GS.mouseDX * 0.0006, -0.04, 0.04), 0.2); GS.swayY = lerp(GS.swayY, clamp(GS.mouseDY * 0.0006, -0.04, 0.04), 0.2);
  GS.mouseDX = GS.mouseDY = 0;
  const target = _v1.copy(HIP_POS).lerp(g.userData.adsPos, GS.ads);
  const bobA = (1 - GS.ads * 0.85) * clamp(player.hspeed / 5, 0, 1.5);
  target.x += Math.cos(GS.bobT) * 0.012 * bobA + GS.swayX * (1 - GS.ads * 0.7);
  target.y += Math.abs(Math.sin(GS.bobT)) * 0.012 * bobA + GS.swayY * (1 - GS.ads * 0.7);
  target.z += GS.vmKick * 0.045;
  if (GS.run.reloadT > 0) { const k = Math.sin(clamp(1 - GS.run.reloadT / w.reload, 0, 1) * Math.PI); target.y -= 0.12 * k; g.rotation.z = 0.5 * k; }
  else g.rotation.z = lerp(g.rotation.z, 0, 0.2);
  if (GS.run.switchT > 0) target.y -= GS.run.switchT * 0.6;
  if (GS.run.charging) { const k = GS.run.chargeT / w.charge; target.x += (Math.random() - 0.5) * 0.006 * k; target.y += (Math.random() - 0.5) * 0.006 * k; target.z += 0.02 * k; }
  g.position.lerp(target, clamp(dt * 22, 0, 1));
  g.rotation.x = GS.vmKick * 0.12 * (1 - 0.7 * GS.ads);
  const fl = g.userData.flash;
  if (fl.visible) { fl.userData.t -= dt; if (fl.userData.t <= 0) fl.visible = false; }
}
function updateLootVisuals() {
  for (const c of GS.crates) if (c.used && c.refill && GS.time >= c.readyAt) { c.used = false; c.stripe.material.emissive.setHex(0xd9a441); }
  for (const l of GS.loots) {
    const k = 0.6 + 0.4 * Math.sin(GS.time * 4 + l.x);
    l.ring.material.opacity = 0.55 + 0.4 * k; l.ring.scale.setScalar(l.rs * (1 + 0.08 * k));
    l.beam.material.opacity = 0.25 + 0.2 * k;
  }
  if (GS.extraction) {
    GS.extraction.ring.material.opacity = GS.run.objDone ? 0.7 + 0.3 * Math.sin(GS.time * 5) : 0.6;
    GS.extraction.col.material.opacity = GS.run.objDone ? 0.1 + 0.05 * Math.sin(GS.time * 5) : 0.05;
  }
}

export { damagePlayer, updateLootVisuals, updatePlayer, updateViewmodel };
