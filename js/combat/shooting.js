import * as THREE from 'three';
import { GS } from '../core/state.js?v=39';
import { V3, clamp, lerp, rand } from '../core/utils.js?v=39';
import { CONSUMABLES, GRENADES, SKILLS, W } from '../data/data.js?v=39';
import { writeSave } from '../core/save.js?v=39';
import { SFX } from '../core/audio.js?v=39';
import { camera } from '../core/renderer.js?v=39';
import { groundAt, segFirstHit } from '../world/world.js?v=39';
import { UPY, blastLight, burstSparks, muzzleLight, spawnBeam, spawnDebris, spawnFlash, spawnSpark, spawnTracer } from '../fx/effects.js?v=39';
import { GUNS } from '../player/viewmodel.js?v=39';
import { curW, curWeapon, player, raycaster, recoil } from '../player/playerState.js?v=39';
import { damagePlayer } from '../player/player.js?v=39';
import { showGun } from '../world/missions.js?v=39';
import { coreExposed } from '../bosses/core.js?v=39';
import { kd } from '../player/input.js?v=39';
import { damagePart, handlePartEvent, hitPart, partAlive } from './damage.js?v=39';
import { alertEnemy } from '../enemies/ai.js?v=39';
import { bossHatchOpen, shockGeo } from '../bosses/rex.js?v=39';
import { spiderExposed } from '../bosses/spider.js?v=39';
import { NET, coopEv, coopHostShotFx, coopOut, guestRay, hurtTarget, isGuest, isHost, v3a } from '../modes/coop.js?v=39';
import { achEvent } from '../meta/achievements.js?v=39';
import { addFeed, popup, showHitmarker } from '../ui/hud.js?v=39';

// =====================================================================
//  사격
// =====================================================================
function useMedkit() {
  if (!GS.run || player.downed || player.hp >= player.maxHp) return;
  if (GS.run.medkits > 0) {
    GS.run.medkits--; player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.6);
    SFX.pickup(); addFeed(`응급 키트 사용 · 남은 ${GS.run.medkits}회`, 'p');
  } else if (GS.save.inv.stim > 0 && !GS.run.chaos) {
    GS.save.inv.stim--; writeSave(); player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
    SFX.pickup(); addFeed(`회복 주사기 사용 · 남은 ${GS.save.inv.stim}개`, 'p');
  }
}
// ---------- 투척물 ----------
GS.throwables = [], GS.fadeRings = [];
const nadeGeo = new THREE.SphereGeometry(0.09, 10, 8), _tv = V3(), _ex = V3();
function launchThrowable(type, from, vel, impact, ex) {
  const col = { emp: 0x3a7ac8, frag: 0x55603a, gl: 0x4a4a32 }[type];
  const m = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({ color: col, emissive: type === 'emp' ? 0x1a4a8a : 0 }));
  if (type === 'gl') m.scale.set(0.8, 0.8, 1.6);
  m.position.copy(from); GS.world.add(m);
  GS.throwables.push({ type, mesh: m, vel: vel.clone(), fuse: impact ? 5 : 1.5, impact, prev: from.clone(), ex });
  if (!NET.remoteShot) { const ne = { t: 'nade', k: type, f: v3a(from), v: v3a(vel), imp: impact ? 1 : 0, ex }; if (isHost()) coopEv(ne); else if (isGuest()) coopOut(ne); }
}
function throwGrenade() {
  if (GS.run && GS.run.chaos) { popup('카오스 · 투척물 사용 불가', 'dim'); return; }
  if (player.downed) return;
  if (GS.run.throwCd > 0) return;
  let type = GS.save.grenadeSel;
  if (!(GS.save.inv[type] > 0)) { type = GRENADES.find(g => GS.save.inv[g] > 0); if (!type) { SFX.empty(); popup('투척물 없음', 'dim'); return; } GS.save.grenadeSel = type; }
  GS.save.inv[type]--; writeSave(); GS.run.throwCd = 0.7; GS.run.used[type] = true;
  camera.updateMatrixWorld();
  const dir = camera.getWorldDirection(V3());
  const from = camera.getWorldPosition(V3()).addScaledVector(dir, 0.5); from.y -= 0.1;
  const vel = dir.clone().multiplyScalar(17); vel.y += 3.5; vel.x += player.vel.x * 0.5; vel.z += player.vel.z * 0.5;
  launchThrowable(type, from, vel, false); SFX.toss();
  addFeed(`${CONSUMABLES[type].name} 투척 · 남은 ${GS.save.inv[type]}개`, 'p');
  if (!(GS.save.inv[type] > 0)) { const nx = GRENADES.find(g => GS.save.inv[g] > 0); if (nx) GS.save.grenadeSel = nx; }
}
function cycleGrenade() {
  const avail = GRENADES.filter(g => GS.save.inv[g] > 0); if (!avail.length) return;
  GS.save.grenadeSel = avail[(avail.indexOf(GS.save.grenadeSel) + 1) % avail.length]; writeSave(); SFX.ui();
}
function updateThrowables(dt) {
  for (let i = GS.throwables.length - 1; i >= 0; i--) {
    const t = GS.throwables[i], p = t.mesh.position;
    t.prev.copy(p); t.vel.y -= (t.impact ? 6 : 14) * dt; p.addScaledVector(t.vel, dt); t.fuse -= dt;
    let boom = t.fuse <= 0;
    _tv.subVectors(p, t.prev); const len = _tv.length();
    if (len > 1e-5) {
      _tv.divideScalar(len);
      if (t.impact) {
        raycaster.set(t.prev, _tv); raycaster.near = 0; raycaster.far = len;
        const hh = raycaster.intersectObjects(GS.hittables, false)[0];
        if (hh) { p.copy(hh.point).addScaledVector(_tv, -0.15); boom = true; }
      } else {
        const wt = segFirstHit(t.prev, _tv, len);
        if (wt >= 0) { p.copy(t.prev).addScaledVector(_tv, Math.max(0, wt - 0.06)); t.vel.x *= -0.35; t.vel.z *= -0.35; }
      }
    }
    if (!boom && !t.impact) {
      const g = groundAt(p.x, p.z, 0.05, t.prev.y - 0.09, 0.25);
      if (p.y < g + 0.09) { p.y = g + 0.09; t.vel.y = Math.abs(t.vel.y) > 1.5 ? -t.vel.y * 0.35 : 0; t.vel.x *= 0.6; t.vel.z *= 0.6; }
    } else if (t.impact && p.y < 0.05) boom = true;
    t.mesh.rotation.x += dt * 8;
    if (t.type === 'emp' && Math.random() < 0.35) spawnSpark(p, UPY, 0x6ac8ff, 1.5, 0.2);
    if (t.type === 'gl' && Math.random() < 0.7) spawnSpark(p, _tv.clone().negate(), 0xffa050, 2, 0.15);
    if (boom) { GS.world.remove(t.mesh); GS.throwables.splice(i, 1); if (!isGuest()) detonate(t, p.clone()); }
  }
}
function detonate(t, pos) {
  if (t.type === 'frag') explodeAt(pos, 5, 150, 'frag');
  else if (t.type === 'gl') explodeAt(pos, t.ex.r, t.ex.dmg, 'launcher');
  else if (t.type === 'emp') empAt(pos, 7);
}
function explodeAt(pos, R, dmg, src = 'frag') {
  coopEv({ t: 'boom', p: v3a(pos), R });
  if (isHost() && NET.rp && !NET.rp.dn && !NET.rp.out) { const rd = Math.hypot(NET.rp.pos.x - pos.x, NET.rp.pos.z - pos.z); if (rd < R) hurtTarget(NET.rp, dmg * 0.3 * (1 - rd / R), pos, 'self'); }
  const dpl = pos.distanceTo(_ex.set(player.pos.x, player.pos.y + 1, player.pos.z));
  SFX.explode(dpl); spawnFlash(pos, R * 1.1, 0.22, 0xffa050); burstSparks(pos, UPY, 26, 0xffa040, 9); spawnDebris(pos, 0x3a3630, 5, 5);
  blastLight.position.copy(pos); blastLight.intensity = 80; GS.shake = Math.max(GS.shake, dpl < 12 ? 0.02 : 0.006);
  const mult = GS.run.ocT > 0 ? 1.4 : 1;
  for (const e of [...GS.enemies]) {
    if (e.dead) continue;
    const rr = R * (e.boss ? 1.3 : 1); let touched = false;
    for (const p of Object.values(e.parts)) {
      if (e.dead || !p.attached || p.state === 'destroyed') continue;
      p.meshes[0].getWorldPosition(_ex); const d = _ex.distanceTo(pos); if (d > rr) continue;
      let dd = dmg * (1 - 0.6 * d / rr) * mult;
      e.lastHit = src;
      if (p.protectedBy.some(id => partAlive(e.parts[id]))) dd *= 0.5;
      if (e.boss && p.id === 'reactor' && !(e.spider ? spiderExposed(e) : e.fcore ? coreExposed(e) : bossHatchOpen(e))) dd *= e.fcore ? 0.1 : 0.15;
      const ev = damagePart(p, dd); touched = true;
      if (ev !== 'destroyed') { p.flash = 0.07; for (const m of p.meshes) m.material.emissive.setRGB(0.55, 0.38, 0.2); }
      handlePartEvent(p, ev);
    }
    if (touched) { showHitmarker('hit'); if (!e.alert) { alertEnemy(e); e.lastSeen.copy(player.pos); } }
  }
  const pd = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  if (pd < R && Math.abs(player.pos.y + 0.8 - pos.y) < R) damagePlayer(dmg * 0.3 * (1 - pd / R), pos, 'self');
}
function empAt(pos, R) {
  coopEv({ t: 'empfx', p: v3a(pos), R });
  SFX.emp(); spawnFlash(pos, R * 1.3, 0.3, 0x6ac8ff); burstSparks(pos, UPY, 30, 0x6ac8ff, 8);
  const ring = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: 0x6ac8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, Math.max(0.15, pos.y), pos.z); GS.world.add(ring);
  GS.fadeRings.push({ mesh: ring, t: 0, R });
  let n = 0;
  for (const e of GS.enemies) {
    if (e.dead) continue;
    if (e.dragon) {
      let dm = e.headPos.distanceTo(pos); for (const sp of e.segPts) dm = Math.min(dm, sp.distanceTo(pos));
      if (dm > R + 1) continue;
      const B = e.bs;
      if (B.state === 'crash') continue;
      if (GS.time >= (B.empImmune || 0)) { B.state = 'downed'; B.t = 3.6; B.empImmune = GS.time + 15; e.alert = true; e.mglow.material.opacity = 0; addFeed('청룡 EMP 추락 · 3.6초 지상 경직', 'd'); popup('EMP · 청룡 추락', 'weak'); }
      else addFeed(`청룡 EMP 내성 · ${Math.ceil(B.empImmune - GS.time)}초 남음`, 'k');
      continue;
    }
    const d = Math.hypot(e.root.position.x - pos.x, e.root.position.z - pos.z) - e.cfg.radius * 0.5;
    if (d > R) continue;
    if (e.spider) {
      const B = e.bs;
      if (B.state === 'collapse') { addFeed('ARACHNE 이미 주저앉음 · EMP 효과 없음', 'k'); continue; }
      if (GS.time >= (B.empImmune || 0)) { B.state = 'stunned'; B.t = 2.6; B.empImmune = GS.time + 15; e.alert = true; addFeed('ARACHNE EMP 경직 · 동력로 노출', 'd'); popup('EMP · 보스 경직', 'weak'); }
      else addFeed(`ARACHNE EMP 내성 · ${Math.ceil(B.empImmune - GS.time)}초 남음`, 'k');
      continue;
    }
    if (e.fcore) {
      const B = e.bs;
      if (GS.time >= (B.empImmune || 0)) { B.state = 'stunned'; B.t = 3; B.empImmune = GS.time + 15; e.alert = true; addFeed('생산 코어 EMP 정지 · 3초간 동력로 노출', 'd'); popup('EMP · 코어 정지', 'weak'); }
      else addFeed(`생산 코어 EMP 내성 · ${Math.ceil(B.empImmune - GS.time)}초 남음`, 'k');
      continue;
    }
    if (e.boss) {
      const B = e.bs;
      if (B.state === 'knockdown') { addFeed('REX-09 이미 다운 상태 · EMP 효과 없음', 'k'); continue; }
      if (GS.time >= (B.empImmune || 0)) {
        B.state = 'stunned'; B.t = 2.0; B.empImmune = GS.time + 15; B.laserAimed = false; e.alert = true; B.started = true; B.engageT = B.engageT || GS.time;
        addFeed('REX-09 EMP 경직 · 동력로 노출', 'd'); popup('EMP · 보스 경직', 'weak');
      } else addFeed(`REX-09 EMP 내성 · ${Math.ceil(B.empImmune - GS.time)}초 남음`, 'k');
    } else { e.stunT = 3; e.empT = 3; e.burstLeft = 0; if (!e.alert) { alertEnemy(e); e.lastSeen.copy(player.pos); } n++; }
  }
  if (n) addFeed(`EMP · 로봇 ${n}기 3초 정지`, 'd');
  achEvent('emp', { n });
}
function updateFadeRings(dt) {
  for (let i = GS.fadeRings.length - 1; i >= 0; i--) {
    const f = GS.fadeRings[i]; f.t += dt; const r = 1 + f.R * Math.min(1, f.t / 0.35);
    f.mesh.scale.set(r, r, 1); f.mesh.material.opacity = Math.max(0, 0.9 - f.t * 1.6);
    if (f.t > 0.6) { GS.world.remove(f.mesh); GS.fadeRings.splice(i, 1); }
  }
}
// ---------- 스킬 ----------
function useSkill(slot) {
  if (GS.run && GS.run.chaos) { popup('카오스 · 스킬 사용 불가', 'dim'); return; }
  if (player.downed) return;
  const id = GS.save.slots[slot]; if (!id || !GS.save.skills[id]) return;
  if (GS.run.skillCd[slot] > 0) { SFX.empty(); return; }
  const sk = SKILLS[id];
  if (id === 'dash') {
    const f = (kd('fwd') ? 1 : 0) - (kd('back') ? 1 : 0), s = (kd('right') ? 1 : 0) - (kd('left') ? 1 : 0);
    const fwd = camera.getWorldDirection(V3()); fwd.y = 0; fwd.normalize();
    const d = V3().addScaledVector(fwd, f || (s ? 0 : 1)).addScaledVector(V3(-fwd.z, 0, fwd.x), s).normalize();
    player.vel.set(d.x * 24, 0, d.z * 24); GS.run.dashT = 0.2; GS.run.iframeT = 0.28;
  } else if (id === 'nano') GS.run.nanoT = 3;
  else if (id === 'shield') { GS.run.shield = 80; GS.run.shieldT = 6; }
  else if (id === 'overclock') GS.run.ocT = 8;
  else if (id === 'focus') { GS.run.focusT = 4; achEvent('focus'); coopOut({ t: 'focus' }); }
  GS.run.skillCd[slot] = sk.cd; SFX.skill(id); addFeed(`스킬 · ${sk.name}`, 'p');
}

function startReload() {
  const ws = curWeapon(), w = W(ws.id);
  if (GS.run.reloadT > 0 || GS.run.switchT > 0 || ws.mag >= w.mag || ws.reserve <= 0) return;
  GS.run.reloadT = w.reload; SFX.reload();
}
function finishReload() {
  const ws = curWeapon(), w = W(ws.id);
  const take = Math.min(w.mag - ws.mag, ws.reserve);
  ws.mag += take; if (ws.reserve !== Infinity) ws.reserve -= take;
}
function switchWeapon(i) {
  if (i >= GS.run.ws.length || i === GS.run.cur) return;
  if (GS.run.charging) { GS.run.charging = false; GS.run.chargeT = 0; SFX.chargeStop(); }
  GS.run.lastCur = GS.run.cur; GS.run.cur = i; GS.run.burstLeft = 0; GS.run.reloadT = 0; GS.run.switchT = 0.35; GS.fireCd = 0; GS.bloom = 0; showGun();
}
function currentSpread(w) {
  const mv = clamp(player.hspeed / 5, 0, 1.6);
  let s = lerp(w.hipSpread, w.adsSpread, GS.ads) + w.moveSpread * mv * (1 - 0.6 * GS.ads) + GS.bloom;
  if (!player.onGround) s += 0.02;
  return s * (1 - 0.3 * player.crouch);
}
function muzzleWorld(out) {
  const g = GUNS[curWeapon().id];
  if (curW().scope && GS.ads > 0.85) return out.set(0, -0.12, -0.6).applyMatrix4(camera.matrixWorld);
  // 1인칭 무기 씬 좌표 → 월드 좌표 (같은 시점 원점 공유)
  out.copy(g.userData.muzzle).applyMatrix4(g.matrix);
  return out.applyMatrix4(camera.matrixWorld);
}
function tryFire() {
  if (player.downed) return false;
  const ws = curWeapon(), w = W(ws.id);
  if (GS.run.switchT > 0 || GS.run.reloadT > 0 || GS.fireCd > 0 || GS.run.burstLeft > 0) return false;
  if (ws.mag <= 0) { SFX.empty(); GS.fireCd = 0.25; if (ws.reserve > 0) startReload(); return false; }
  GS.fireCd = w.interval;
  shootOnce();
  if (w.burst) { GS.run.burstLeft = w.burst - 1; GS.run.burstT = w.burstGap; }
  return true;
}
// 레일건 충전 사격: k = 0(톡) ~ 1(완전 충전)
function chargedW(w0, k) {
  const full = k >= 0.999;
  return Object.assign({}, w0, { dmg: w0.dmg * (0.45 + 1.55 * k) * (full ? 1.1 : 1), pierce: full ? 6 : 1 + Math.floor(k * 4.99),
    recoil: w0.recoil * (0.5 + k), kick: w0.kick * (0.6 + 0.8 * k), chargeK: k, full });
}
function fireCharged() {
  const w = curW(); const k = clamp(GS.run.chargeT / w.charge, 0, 1);
  GS.run.charging = false; GS.run.chargeT = 0; SFX.chargeStop();
  GS.run.chargeK = k; const ok = tryFire(); GS.run.chargeK = null;
  if (ok) achEvent('railCharge', { k });
}
function updateCharge(dt, w) {
  const cw = curWeapon();
  const can = cw.mag > 0 && GS.run.reloadT <= 0 && GS.run.switchT <= 0 && GS.fireCd <= 0 && !player.downed;
  if (GS.mouseDown && can) {
    if (!GS.run.charging) { GS.run.charging = true; GS.run.chargeT = 0; SFX.chargeStart(); }
    GS.run.chargeT = Math.min(w.charge, GS.run.chargeT + dt); SFX.chargeSet(GS.run.chargeT / w.charge);
  } else if (GS.run.charging && !GS.mouseDown) fireCharged();
  else if (GS.run.charging && !can) { GS.run.charging = false; GS.run.chargeT = 0; SFX.chargeStop(); }
  if (GS.mouseDown && !GS.firedThisPress && cw.mag <= 0) { GS.firedThisPress = true; tryFire(); }
}
function shootOnce() {
  const ws = curWeapon(), w0 = W(ws.id), w = w0.charge && GS.run.chargeK != null ? chargedW(w0, GS.run.chargeK) : w0;
  ws.mag--; GS.run.shots++; GS.run.used[ws.id] = true;
  camera.updateMatrixWorld();
  const origin = camera.getWorldPosition(V3());
  const dir = camera.getWorldDirection(V3());
  const spread = currentSpread(w);
  const right = V3(1, 0, 0).applyQuaternion(camera.quaternion), up = V3(0, 1, 0).applyQuaternion(camera.quaternion);
  const mz = muzzleWorld(V3());
  const big = w.scope || w.pellets || w.pierce || w.explosive;
  if (w.explosive) {
    const ad = dir.clone(); const r0 = Math.tan(spread) * Math.sqrt(Math.random()), t0 = Math.random() * Math.PI * 2;
    ad.addScaledVector(right, r0 * Math.cos(t0)).addScaledVector(up, r0 * Math.sin(t0)).normalize();
    launchThrowable('gl', camera.getWorldPosition(V3()).addScaledVector(ad, 0.5), ad.multiplyScalar(w.projSpeed), true, w.explosive);
  } else for (let pi = 0, any = false, sd = [], sp2 = [], _c = (NET.claims = []); pi < (w.pellets || 1); pi++) {
    const sp = spread + (w.pelletSpread || 0);
    const r = Math.tan(sp) * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
    const d = dir.clone().addScaledVector(right, r * Math.cos(th)).addScaledVector(up, r * Math.sin(th)).normalize();
    const result = fireRay(origin, d, w);
    sd.push(v3a(d)); sp2.push(v3a(result.point));
    if (pi === (w.pellets || 1) - 1) { if (isGuest()) coopOut({ t: 'shot', o: v3a(origin), d: sd, p: sp2, c: NET.claims, oc: GS.run.ocT > 0 ? 1 : 0, w: { id: w.id || ws.id, dmg: w.dmg, precisionMult: w.precisionMult, armorMult: w.armorMult, range: w.range, pierce: w.pierce, falloff: w.falloff } }); else coopHostShotFx(sp2); }
    if (result.part && !any) { any = true; GS.run.shotsHit++; }
    if (w.chargeK != null) { spawnBeam(mz, result.point, w.full ? 0.38 : 0.05 + 0.15 * w.chargeK, w.full); if (w.full) { burstSparks(result.point, UPY, 22, 0x8ad8ff, 9); spawnFlash(result.point, 1.6, 0.18, 0x8ad8ff); } }
    else spawnTracer(mz, result.point, w.pierce ? 0x8ad8ff : big ? 0xffe4b0 : 0xffd28a, w.scope || w.pierce ? 0.14 : 0.06);
  }
  // 연출
  muzzleLight.position.copy(mz); muzzleLight.intensity = big ? 40 : 22;
  const fl = GUNS[ws.id].userData.flash; fl.visible = true; fl.rotation.z = Math.random() * Math.PI; fl.userData.t = 0.045;
  if (w.chargeK != null) SFX.rail(w.chargeK); else SFX.shot(ws.id);
  recoil.target += w.recoil * (1 - 0.35 * GS.ads);
  applyLook(0, (Math.random() - 0.5) * 2 * w.recoilYaw);
  GS.vmKick = Math.min(1.6, GS.vmKick + w.kick * 0.55);
  GS.bloom = Math.min(w.bloomMax, GS.bloom + w.bloom);
  GS.shake = Math.max(GS.shake, w.full ? 0.035 : ws.id === 'amr' ? 0.02 : big ? 0.012 : 0.004);
  // 총성으로 주변 적 경계
  for (const e of GS.enemies) if (!e.dead && !e.alert && e.root.position.distanceTo(player.pos) < (ws.id === 'pistol' ? 8 : 11)) e.pendingAlert = e.pendingAlert || rand(0.6, 1.2);
}
// 레이캐스트 판정: 가장 먼저 맞은 메시가 곧 피격 부위
function fireRay(origin, dir, w) {
  if (isGuest()) return guestRay(origin, dir, w);
  raycaster.set(origin, dir); raycaster.far = w.range; raycaster.near = 0.05;
  const hits = raycaster.intersectObjects(GS.hittables, false);
  if (!hits.length) return { point: origin.clone().addScaledVector(dir, w.range), part: null };
  if (w.pierce) {
    let cnt = 0, mult = 1, last = null, first = null; const seen = new Set();
    for (const hh of hits) {
      const u = hh.object.userData, nn = hh.face ? hh.face.normal.clone().transformDirection(hh.object.matrixWorld) : dir.clone().negate();
      last = hh.point;
      if (!u.part) { if (!cnt) { burstSparks(hh.point, nn, 6, 0x8ad8ff, 4); spawnFlash(hh.point, 0.3, 0.06, 0x8ad8ff); } break; }
      if (seen.has(u.part)) continue; seen.add(u.part); if (!first) first = u.part;
      hitPart(u.part, hh.object, hh.point, nn, Object.assign({}, w, { dmg: w.dmg * mult }), 1, true);
      mult *= 0.7; if (++cnt >= w.pierce) break;
    }
    return { point: last || origin.clone().addScaledVector(dir, w.range), part: first };
  }
  const h = hits[0];
  const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
  const ud = h.object.userData;
  const fall = w.falloff ? clamp(1 - (h.distance - w.falloff[0]) / (w.falloff[1] - w.falloff[0]), 0.25, 1) : 1;
  if (ud.part) { const info = hitPart(ud.part, h.object, h.point, n, w, fall); return { point: h.point, part: ud.part, mesh: h.object, info }; }
  burstSparks(h.point, n, 4, 0xd8d0c0, 3); spawnFlash(h.point, 0.18, 0.05, 0xddd6c8);
  return { point: h.point, part: null, mesh: h.object };
}
function applyLook(dPitch, dYaw) {
  const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  eu.x = clamp(eu.x + dPitch, -1.52, 1.52); eu.y += dYaw;
  camera.quaternion.setFromEuler(eu);
}

export { applyLook, currentSpread, cycleGrenade, empAt, finishReload, fireRay, launchThrowable, shootOnce, startReload, switchWeapon, throwGrenade, tryFire, updateCharge, updateFadeRings, updateThrowables, useMedkit, useSkill };
