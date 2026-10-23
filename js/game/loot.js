import * as THREE from 'three';
import { GS } from '../core/state.js?v=34';
import { $, V3, _box, _v1, fmt } from '../core/utils.js?v=34';
import { BAGS, GUN_KG, STATE_KO, UK, WEAPONS, bind, keyLabel, maxReserve, partKg } from '../data/data.js?v=34';
import { SFX } from '../core/audio.js?v=34';
import { camera } from '../core/renderer.js?v=34';
import { groundAt, hitsBoxXZ } from '../world/world.js?v=34';
import { updatePartVisual } from '../enemies/robot.js?v=34';
import { GRAV, curWeapon, player } from '../player/playerState.js?v=34';
import { TUT_STEPS, tutConfirm } from '../modes/tutorial.js?v=34';
import { renderBagUI } from '../player/input.js?v=34';
import { conditionOf, partValue } from '../combat/damage.js?v=34';
import { NET, coopEv, coopOn, coopOut, coopTryExtract, eIdx, isGuest, isHost, v3a } from '../modes/coop.js?v=34';
import { HARD_MUL } from '../modes/difficulty.js?v=34';
import { achEvent } from '../meta/achievements.js?v=34';
import { addFeed, popup } from '../ui/hud.js?v=34';
import { endMission } from './result.js?v=34';

// =====================================================================
//  부품 낙하 / 회수
// =====================================================================
function updateFallers(dt) {
  for (let i = GS.fallers.length - 1; i >= 0; i--) {
    const f = GS.fallers[i]; f.t += dt;
    f.vel.y -= GRAV * dt;
    f.obj.position.addScaledVector(f.vel, dt);
    f.obj.rotation.x += f.ang.x * dt; f.obj.rotation.y += f.ang.y * dt; f.obj.rotation.z += f.ang.z * dt;
    // 벽 밀어내기
    for (const b of GS.boxes) if (b.maxY > 1.5 && hitsBoxXZ(b, f.obj.position.x, f.obj.position.z, 0.15)) {
      f.vel.x *= -0.3; f.vel.z *= -0.3;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, p = f.obj.position;
      const ex = Math.min(p.x - b.minX, b.maxX - p.x), ez = Math.min(p.z - b.minZ, b.maxZ - p.z);
      if (ex < ez) p.x = p.x < cx ? b.minX - 0.3 : b.maxX + 0.3; else p.z = p.z < cz ? b.minZ - 0.3 : b.maxZ + 0.3;
    }
    _box.setFromObject(f.obj);
    const gy = groundAt(f.obj.position.x, f.obj.position.z, 0.05, 1.3, 0.2);
    if (_box.min.y <= gy) {
      f.obj.position.y += gy - _box.min.y;
      if (Math.abs(f.vel.y) > 2.5 && f.t < 3) { f.vel.y *= -0.3; f.vel.x *= 0.5; f.vel.z *= 0.5; f.ang.multiplyScalar(0.4); }
      else { GS.fallers.splice(i, 1); f.onLand(); }
    } else if (f.t > 5) { GS.fallers.splice(i, 1); f.onLand(); }
  }
}
const lootRingGeo = new THREE.RingGeometry(0.45, 0.58, 28);
const lootBeamGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6, 1, true);
function createLoot(p) {
  if (!GS.run || GS.state !== 'mission' || isGuest()) return;
  const cond = conditionOf(p);
  if (cond <= 0 || !p.val) return;
  _box.setFromObject(p.group); const c = _box.getCenter(V3());
  const blockedAt = (x, z) => GS.boxes.some(q => x > q.minX - 0.4 && x < q.maxX + 0.4 && z > q.minZ - 0.4 && z < q.maxZ + 0.4 && q.maxY > 1.5);
  if (!p.anchor) {
    // 상자·벽 안에 박힌 경우 가장 가까운 바깥쪽으로 밀어냄
    for (let it = 0; it < 4; it++) {
      const y0 = _box.min.y;
      const b = GS.boxes.find(q => c.x > q.minX - 0.35 && c.x < q.maxX + 0.35 && c.z > q.minZ - 0.35 && c.z < q.maxZ + 0.35 && q.maxY > y0 + 0.3 && q.minY < y0 + 1);
      if (!b) break;
      const opts = [[b.minX - 0.7 - c.x, 0], [b.maxX + 0.7 - c.x, 0], [0, b.minZ - 0.7 - c.z], [0, b.maxZ + 0.7 - c.z]].sort((u, v) => Math.hypot(...u) - Math.hypot(...v));
      const [dx, dz] = opts[0]; p.group.position.x += dx; p.group.position.z += dz;
      const gy = groundAt(c.x + dx, c.z + dz, 0.05, 1.3, 0.2);
      p.group.position.y += gy - y0;
      _box.setFromObject(p.group); _box.getCenter(c);
    }
    // 그래도 막혀 있으면 주변 빈 자리를 원형으로 탐색
    if (blockedAt(c.x, c.z)) {
      search: for (let r = 0.8; r < 8; r += 0.4) for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (!blockedAt(x, z) && Math.hypot(x, z) < 40) { const y0 = _box.min.y; p.group.position.x += x - c.x; p.group.position.z += z - c.z; p.group.position.y += groundAt(x, z, 0.05, 1.3, 0.2) - y0; _box.setFromObject(p.group); _box.getCenter(c); break search; }
      }
    }
  }
  const sz = _box.getSize(V3()); let pr = Math.max(2.3, Math.max(sz.x, sz.z) * 0.5 + 1.2);
  let ly = _box.min.y;
  if (p.anchor) {
    p.anchor.getWorldPosition(c); ly = c.y = groundAt(c.x, c.z, 0.05, 1.3, 0.2); pr = 4;
    if (blockedAt(c.x, c.z)) search2: for (let r = 0.8; r < 10; r += 0.4) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!blockedAt(x, z) && Math.hypot(x, z) < 40) { ly = groundAt(x, z, 0.05, 1.3, 0.2); c.set(x, ly, z); break search2; }
    }
  }
  const ring = new THREE.Mesh(lootRingGeo, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, ly + 0.03, c.z);
  const beam = new THREE.Mesh(lootBeamGeo, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(c.x, ly + 1.2, c.z);
  GS.world.add(ring, beam);
  p.flash = 0; updatePartVisual(p);
  GS.loots.push({ p, obj: p.group, ring, beam, x: c.x, y: ly, z: c.z, cond, state: p.state, r: pr, rs: pr / 2.3,
    name: `${p.enemy.cfg.name} ${p.name}`, base: Math.round(p.val * GS.run.mission.partMult * (GS.run.hard ? HARD_MUL.parts : 1)), val: partValue(p, cond), kg: partKg(p.val) });
  if (isHost()) { const L = GS.loots[GS.loots.length - 1]; L.lid = ++NET.lid; const q = p.group.quaternion;
    coopEv({ t: 'loot', lid: L.lid, i: eIdx(p.enemy), pid: p.id, x: L.x, y: L.y, z: L.z, r: L.r, cond: L.cond, state: L.state, name: L.name, base: L.base, val: L.val, kg: L.kg, gp: v3a(p.group.position), gq: [q.x, q.y, q.z, q.w] }); }
}
// 자동 회수: 전리품 위를 지나가기만 하면 줍는다
function autoPickup() {
  for (let i = GS.loots.length - 1; i >= 0; i--) {
    const l = GS.loots[i], d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
    if (l.noAuto) { if (d > l.r + 1.2) l.noAuto = false; continue; }
    if (d <= l.r && Math.abs(l.y - player.pos.y) <= 1.6 && (l.kg || 0) <= bagRoom() + 1e-6) pickup(l);
  }
}
// 가방: 들고 있는 총 + 회수한 부품의 무게
function bagCap() { return BAGS[GS.save.bag || 0].cap; }
function gunKg() { return GS.run ? GS.run.ws.reduce((a, w) => a + (GUN_KG[w.id] || 0), 0) : 0; }
function carryKg() { return GS.run ? gunKg() + GS.run.loot.reduce((a, l) => a + (l.kg || 0), 0) : 0; }
function bagRoom() { return bagCap() - carryKg(); }
// 이동 속도 배율: 절반까지는 그대로, 가득 차면 25% 감소,
// 넘으면 넘은 만큼 점점 더 느려짐 (10% 초과 -36%, 25% 초과 -53%, 50% 초과 -80%, 최저 -85%)
function loadMult() { const r = carryKg() / bagCap(); return r <= 0.5 ? 1 : r <= 1 ? 1 - 0.5 * (r - 0.5) : Math.max(0.15, 0.75 - 1.1 * (r - 1)); }
function dropWorst() {
  if (!GS.run || GS.state !== 'mission' || !GS.run.loot.length || player.downed) return;
  const eff = l => l.val / Math.max(0.1, l.kg || 0.1);
  let wi = 0; GS.run.loot.forEach((l, i) => { if (eff(l) < eff(GS.run.loot[wi])) wi = i; });
  dropLootAt(wi);
}
// 가방의 i번째 부품을 발 앞에 내려놓음 (다시 주울 수 있음)
const dropBoxGeo = new THREE.BoxGeometry(0.42, 0.3, 0.42);
function dropLootAt(i) {
  if (!GS.run || GS.state !== 'mission' || player.downed || !GS.run.loot[i]) return;
  const l = GS.run.loot.splice(i, 1)[0]; SFX.ui();
  const fwd = camera.getWorldDirection(_v1); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
  let x = player.pos.x + fwd.x * 1.1, z = player.pos.z + fwd.z * 1.1;
  if (GS.boxes.some(q => hitsBoxXZ(q, x, z, 0.3) && q.maxY > player.pos.y + 0.4)) { x = player.pos.x; z = player.pos.z; }
  const y = groundAt(x, z, 0.2, player.pos.y + 0.2, 0.3);
  const keep = l._o;
  let obj = keep && keep.obj;
  if (obj) {
    GS.world.add(obj); obj.updateMatrixWorld(true); _box.setFromObject(obj); const c = _box.getCenter(V3());
    obj.position.x += x - c.x; obj.position.z += z - c.z; obj.position.y += y - _box.min.y;
  } else {
    obj = new THREE.Mesh(dropBoxGeo, new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.8, metalness: 0.3 }));
    obj.position.set(x, y + 0.15, z); GS.world.add(obj);
  }
  const ring = new THREE.Mesh(lootRingGeo, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.03, z);
  const beam = new THREE.Mesh(lootBeamGeo, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(x, y + 1.2, z); GS.world.add(ring, beam);
  const p = (keep && keep.p) || { id: '', enemy: { type: l.src } };
  GS.loots.push({ p, obj, ring, beam, x, y, z, cond: l.cond, state: l.state, r: 1.8, rs: 1.8 / 2.3, name: l.name, base: l.base, val: l.val, kg: l.kg || 0, dropped: true, noAuto: true });
  addFeed(`버림 · ${l.name} (${(l.kg || 0).toFixed(1)}kg · ${fmt(l.val)} CR) · 다시 주울 수 있음`, 'p');
  achEvent('drop', { l });
  if (!$('pause').classList.contains('hidden')) renderBagUI();
}
function nearestLoot() {
  let best = null, bs = -1e9;
  const fwd = camera.getWorldDirection(_v1); fwd.y = 0; fwd.normalize();
  for (const l of GS.loots) {
    const dx = l.x - player.pos.x, dz = l.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > l.r || Math.abs(l.y - player.pos.y) > 1.6) continue;
    const facing = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / d : 1;
    const score = facing * 2 - d;
    if (score > bs) { bs = score; best = l; }
  }
  return best;
}
function nearestCrate() {
  for (const c of GS.crates) if (!c.used && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 1.9 && Math.abs(c.y - player.pos.y) < 1.5) return c;
  return null;
}
function inExtraction() { return GS.extraction && Math.hypot(GS.extraction.x - player.pos.x, GS.extraction.z - player.pos.z) < GS.extraction.r; }
function interact() {
  if (player.downed) return;
  if (GS.run && GS.run.tut) { const st = TUT_STEPS[GS.run.tut.i]; if (st && (st.info || (st.wait && !GS.run.tut.started))) { tutConfirm(); return; } }
  const l = nearestLoot();
  if (l) { if (isGuest() && l.lid) coopOut({ t: 'fpick', lid: l.lid }); else if (!isGuest() || l.dropped) pickup(l); return; }
  const c = nearestCrate();
  if (c) {
    const prim = curWeapon().id !== 'pistol' ? curWeapon() : GS.run.ws[0];
    if (prim.reserve === Infinity) { addFeed('보조 권총은 탄약 보급이 필요하지 않음', 'p'); return; }
    prim.reserve = maxReserve(prim.id); c.used = true; c.readyAt = GS.time + 25; c.stripe.material.emissive.setHex(0x1a1a1a);
    SFX.reload(); addFeed(`탄약 보급 · ${WEAPONS[prim.id].name}`, 'p'); return;
  }
  if (inExtraction()) {
    if (GS.run.objDone) { if (coopOn()) { coopTryExtract(); return; } endMission('extract'); return; }
    popup(coopOn() ? '협동에서는 보스를 격파해야 탈출할 수 있습니다' : `조기 탈출은 ${UK()} 길게 누르기`, 'dim');
  }
}
function pickup(l) {
  GS.loots.splice(GS.loots.indexOf(l), 1);
  if (l.lid) coopEv({ t: 'unl', lid: l.lid });
  GS.world.remove(l.obj, l.ring, l.beam);
  const ent = { name: l.name, base: l.base, val: l.val, cond: l.cond, state: l.state, src: l.p.enemy.type, kg: l.kg || 0 };
  Object.defineProperty(ent, '_o', { value: { obj: l.obj, p: l.p }, enumerable: false });
  GS.run.loot.push(ent);
  if (!l.dropped) achEvent('pickup', { l });
  SFX.pickup();
  addFeed(`회수 · ${l.name} (${STATE_KO[l.state]} ${Math.round(l.cond * 100)}%) ${fmt(l.val)} CR · ${(l.kg || 0).toFixed(1)}kg`, 'p');
  if (carryKg() > bagCap()) popup(`무게 초과 · 이동 -${Math.round((1 - loadMult()) * 100)}% · ${keyLabel(bind('bag'))} 가방에서 버리기`, 'bad');
}

export { autoPickup, bagCap, bagRoom, carryKg, createLoot, dropLootAt, dropWorst, inExtraction, interact, loadMult, lootBeamGeo, lootRingGeo, nearestCrate, nearestLoot, updateFallers };
