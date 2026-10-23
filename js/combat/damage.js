import { GS } from '../core/state.js?v=34';
import { V3, clamp, rand } from '../core/utils.js?v=34';
import { SFX } from '../core/audio.js?v=34';
import { removeHittables } from '../world/world.js?v=34';
import { UPY, burstSparks, spawnDebris, spawnFlash } from '../fx/effects.js?v=34';
import { updatePartVisual } from '../enemies/robot.js?v=34';
import { player } from '../player/playerState.js?v=34';
import { coreExposed } from '../bosses/core.js?v=34';
import { alertEnemy } from '../enemies/ai.js?v=34';
import { dragonDown, dragonNodeEvent, dragonNodesOpen } from '../bosses/dragon.js?v=34';
import { spiderExposed, spiderLegLost } from '../bosses/spider.js?v=34';
import { NET, coopEv, eIdx, v3a } from '../modes/coop.js?v=34';
import { HARD_MUL } from '../modes/difficulty.js?v=34';
import { achEvent, killEnemy } from '../meta/achievements.js?v=34';
import { createLoot } from '../game/loot.js?v=34';
import { addFeed, popup, showHitmarker } from '../ui/hud.js?v=34';

// =====================================================================
//  부위 피해 처리
// =====================================================================
function partAlive(q) { return q && q.attached && q.state !== 'destroyed'; }
function computeDamage(p, mesh, w, pierce) {
  const ud = mesh.userData;
  let d = w.dmg * p.mult * ud.hitMult;
  const precise = p.precise || ud.hitMult > 1.2;
  if (precise) d *= w.precisionMult;
  if (p.type === 'armor') d *= w.armorMult;
  let shielded = false;
  if (!ud.exposed && !pierce && p.protectedBy.some(id => partAlive(p.enemy.parts[id]))) { d *= p.protectedBy.includes('pearl') ? 0.25 : 0.4; shielded = true; }
  if (p.enemy.dragon && p.type === 'power' && !dragonNodesOpen(p.enemy)) { d *= 0.08; shielded = true; p.coverHit = true; } else p.coverHit = false;
  if (p.enemy.spider && p.id === 'reactor' && !spiderExposed(p.enemy)) { d *= 0.15; shielded = true; p.coverHit = true; }
  if (p.enemy.fcore && p.id === 'reactor' && !coreExposed(p.enemy)) { d *= 0.1; shielded = true; p.coverHit = true; }
  return { d, precise, shielded };
}
// 반환: 'damaged' | 'disabled' | 'destroyed' | 'hit'
function damagePart(p, d) {
  p.nd = 1;
  if (p.type === 'core' || p.type === 'armor') {
    p.hp -= d; if (p.hp <= 0) { p.hp = 0; p.state = 'destroyed'; return 'destroyed'; }
    p.state = 'damaged'; return 'damaged';
  }
  if (p.state === 'disabled') {
    p.brk -= d; if (p.brk <= 0) { p.brk = 0; p.state = 'destroyed'; return 'destroyed'; }
    return 'hit';
  }
  if (d >= p.hp) {
    // 기능 정지 순간 남은 충격의 절반이 구조 내구도로 전달 → 과도한 화력은 부품을 파괴
    const excess = (d - p.hp) * 0.5; p.hp = 0; p.brk -= excess;
    if (p.brk <= 0) { p.brk = 0; p.state = 'destroyed'; return 'destroyed'; }
    p.state = 'disabled'; return 'disabled';
  }
  p.hp -= d; p.state = 'damaged'; return 'damaged';
}
function conditionOf(p) {
  if (p.state === 'destroyed') return 0;
  const tot = p.maxHp + p.brkMax; const lost = (p.maxHp - p.hp) + (p.brkMax - p.brk);
  return clamp(1 - lost / tot, 0, 1);
}
function partValue(p, cond) { return Math.round(p.val * GS.run.mission.partMult * (GS.run.hard ? HARD_MUL.parts : 1) * (0.3 + 0.7 * cond)); }

function hitPart(p, mesh, point, normal, w, fall = 1, pierce = false) {
  const e = p.enemy; if (e.dead || !p.attached) return null;
  e.lastHit = w.id || 'gun'; e.lastHitT = GS.time;
  const cd = computeDamage(p, mesh, w, pierce), d = cd.d * fall * ((NET.remoteShot ? NET.remoteOc : GS.run.ocT > 0) ? 1.4 : 1), precise = cd.precise, shielded = cd.shielded;
  e.aggro = e.aggro || {}; e.aggro[NET.remoteShot ? 'r' : 'l'] = (e.aggro[NET.remoteShot ? 'r' : 'l'] || 0) + d;
  const ev = damagePart(p, d);
  GS.run.hitsN++;
  // 피격 이펙트 (실제 피격 지점)
  const armorish = p.type === 'armor' || shielded;
  burstSparks(point, normal, precise ? 9 : 6, precise ? 0xff9a3a : (armorish ? 0xe8e4d8 : 0xffc060), precise ? 7 : 5);
  spawnFlash(point, precise ? 0.5 : 0.32, 0.06, precise ? 0xffb060 : 0xfff0d0);
  if (ev !== 'destroyed') { p.flash = 0.07; for (const m of p.meshes) m.material.emissive.setRGB(0.55, 0.38, 0.2); }
  let kind = 'hit';
  if (ev === 'disabled' || ev === 'destroyed') kind = 'kill';
  else if (precise) kind = 'weak';
  else if (armorish) kind = 'armor';
  if (!NET.remoteShot) { showHitmarker(kind); SFX.hit(kind); }
  if (NET.remoteShot) { } else if (precise && ev !== 'disabled' && ev !== 'destroyed') popup(mesh.userData.sub ? `약점 · ${mesh.userData.sub}` : '약점', 'weak');
  else if (shielded && ev === 'damaged') popup(p.coverHit ? (e.spider ? '동력로 차폐 · 다리를 부숴 주저앉혀라' : e.fcore ? '냉각구 닫힘 · 조립 팔을 부수거나 EMP로 멈춰라' : '마디 덮개 닫힘 · 공격 중에 노려라') : p.protectedBy.includes('pearl') ? '여의주 보호막 · 피해 감소' : '장갑 차폐 · 피해 감소', 'dim');
  if (!e.alert) { alertEnemy(e); e.lastSeen.copy(NET.remoteShot && NET.rp ? NET.rp.pos : player.pos); }
  e.hitKick = Math.min(0.25, e.hitKick + 0.08);
  handlePartEvent(p, ev);
  return { ev, d, precise, shielded };
}

function handlePartEvent(p, ev) {
  achEvent('part', { p, ev });
  const e = p.enemy, nm = `${e.cfg.name} · ${p.name}`;
  if (ev === 'damaged' || ev === 'hit') { updatePartVisual(p); return; }
  if (ev === 'destroyed') {
    switch (p.type) {
      case 'core': if (e.dragon) { dragonDown(e, 'core'); break; } shatter(p); killEnemy(e, 'core'); break;
      case 'armor': shatter(p); addFeed(`${nm} 파괴 · ${p.id === 'hatch' ? '동력로 상시 노출' : '내부 노출'}`, 'd'); popup(p.id === 'hatch' ? '해치 파괴 · 동력로 노출' : '장갑 파괴', p.id === 'hatch' ? 'weak' : 'bad'); break;
      case 'power': if (e.dragon) { shatter(p); dragonNodeEvent(e, p); break; } { shatter(p); const c = e.parts.core; if (c.attached) { c.hp = Math.max(1, c.hp * 0.5); c.state = 'damaged'; updatePartVisual(c); } killEnemy(e, 'overload'); break; }
      case 'weapon': shatter(p); e.canShoot = false; addFeed(`${nm} 파괴 · 공격 불가 (회수 불가)`, 'd'); popup('무장 파괴', 'bad'); break;
      case 'arm': shatter(p); addFeed(`${nm} 파괴`, 'd'); popup('부품 파괴', 'bad'); break;
      case 'jaw': shatter(p); addFeed(`${nm} 파괴 · ${e.dragon ? '숨결' : '물기'} 불가 (회수 불가)`, 'd'); popup('턱 파괴', 'bad'); break;
      case 'pearl': shatter(p); addFeed(`${nm} 파괴 · 보호막 해제 (회수 불가)`, 'd'); popup('여의주 파괴 · 보호막 해제', 'weak'); break;
      case 'horn': shatter(p); addFeed(`${nm} 파괴 · 낙뢰 약화`, 'd'); popup('뿔 파괴', 'bad'); break;
      case 'fin': shatter(p); addFeed(`${nm} 파괴 · 비행 둔화`, 'd'); popup('지느러미 파괴', 'bad'); break;
      case 'pod': shatter(p); addFeed(`${nm} 파괴 · 미사일 감소 (회수 불가)`, 'd'); popup('포드 파괴', 'bad'); break;
      case 'tail': shatter(p); addFeed(`${nm} 파괴 · 꼬리 휩쓸기 불가 (회수 불가)`, 'd'); popup('꼬리 파괴', 'bad'); break;
      case 'head': shatter(p); if (!e.stunned) { e.stunned = true; e.stunT = 2.4; } addFeed(`${nm} 파괴 · 조준 능력 저하`, 'd'); popup('센서 파괴', 'bad'); break;
      case 'leg': shatter(p); addFeed(`${nm} 파괴 · ${legFactor(e) === 0 ? '이동 불가' : '이동 저하'}`, 'd'); popup('다리 파괴', 'bad'); break;
      case 'rotor': shatter(p); addFeed(`${nm} 파괴`, 'd'); popup('로터 파괴', 'bad'); break;
      case 'sleg': shatter(p); spiderLegLost(e, p); popup('다리 파괴', 'bad'); break;
      case 'turret': shatter(p); addFeed(`${nm} 파괴 · 포격 불가 (회수 불가)`, 'd'); popup('포탑 파괴', 'bad'); break;
      case 'bay': shatter(p); addFeed(`${nm} 파괴 · 드론 사출 불가 (회수 불가)`, 'd'); popup('격납고 파괴', 'bad'); break;
    }
    return;
  }
  if (ev === 'disabled') {
    updatePartVisual(p);
    switch (p.type) {
      case 'weapon': {
        e.canShoot = false; e.glow.material.opacity = 0;
        detachPart(p, V3(rand(-1, 1), 2.5, rand(-1, 1)), true);
        addFeed(`${nm} 무력화 · 분리됨 (회수 가능)`, 'd'); popup('무장 무력화 · 분리', 'ok'); break;
      }
      case 'arm': { const hadPearl = e.dragon && p.id === 'clawF' && e.parts.pearl.attached; detachPart(p, V3(rand(-1, 1), 2.2, rand(-1, 1)), true);
        addFeed(`${nm} 무력화 · 분리됨${hadPearl ? ' · 여의주 낙하 (보호막 해제)' : ''}`, 'd'); popup(hadPearl ? '여의주 낙하 · 보호막 해제' : `${p.name} 분리`, hadPearl ? 'weak' : 'ok'); break; }
      case 'jaw': detachPart(p, V3(rand(-1, 1), 2, 2), true); addFeed(`${nm} 무력화 · 분리됨 · ${e.dragon ? '숨결' : '물기'} 불가`, 'd'); popup('턱 분리', 'ok'); break;
      case 'pearl': detachPart(p, V3(rand(-1, 1), 1, rand(-1, 1)), true); addFeed(`${nm} 무력화 · 낙하 · 보호막 해제 (회수 가능)`, 'd'); popup('여의주 낙하 · 보호막 해제', 'weak'); break;
      case 'horn': detachPart(p, V3(rand(-1, 1), 1.5, rand(-1, 1)), true); addFeed(`${nm} 무력화 · 분리됨 · 낙뢰 약화`, 'd'); popup('뿔 분리', 'ok'); break;
      case 'fin': detachPart(p, V3(rand(-1, 1), 1, rand(-1, 1)), true); addFeed(`${nm} 무력화 · 분리됨 · 비행 둔화`, 'd'); popup('지느러미 분리', 'ok'); break;
      case 'pod': detachPart(p, V3(rand(-2, 2), 3, rand(-1, 1)), true); addFeed(`${nm} 무력화 · 분리됨 · 미사일 감소`, 'd'); popup('포드 분리', 'ok'); break;
      case 'tail': detachPart(p, V3(rand(-1, 1), 1.5, -2), true); addFeed(`${nm} 무력화 · 분리됨 · 꼬리 휩쓸기 불가`, 'd'); popup('꼬리 분리', 'ok'); break;
      case 'head': if (!e.stunned) { e.stunned = true; e.stunT = 2.4; } addFeed(`${nm} 무력화 · 조준 능력 저하`, 'd'); popup('센서 무력화', 'ok'); break;
      case 'leg': addFeed(`${nm} 무력화 · ${legFactor(e) === 0 ? '이동 불가' : '이동 저하'}`, 'd'); popup('다리 무력화', 'ok'); break;
      case 'rotor': detachPart(p, V3(rand(-1, 1), 1.5, rand(-1, 1)), true); addFeed(`${nm} 무력화 · 분리됨`, 'd'); popup('로터 분리', 'ok'); break;
      case 'sleg': detachPart(p, V3(rand(-1, 1), 2, rand(-1, 1)), true); spiderLegLost(e, p); popup(`${p.name} 분리`, 'ok'); break;
      case 'turret': detachPart(p, V3(rand(-1, 1), 3, rand(-1, 1)), true); addFeed(`${nm} 무력화 · 분리됨 · 포격 불가`, 'd'); popup('포탑 분리', 'ok'); break;
      case 'bay': updatePartVisual(p); addFeed(`${nm} 무력화 · 드론 사출 불가`, 'd'); popup('격납고 정지', 'ok'); break;
      case 'power': if (e.dragon) dragonNodeEvent(e, p); else killEnemy(e, 'shutdown'); break;
    }
  }
}
function legFactor(e) {
  let f = 1, broken = 0;
  for (const id of ['legL', 'legR']) {
    const p = e.parts[id];
    if (p.state === 'disabled' || p.state === 'destroyed') { broken++; f *= 0.4; }
    else if (p.state === 'damaged') f *= 0.8;
  }
  return broken >= 2 ? 0 : f;
}
function sensorMult(e) {
  const h = e.parts.head;
  if (h.state === 'disabled' || h.state === 'destroyed') return 3.5;
  if (h.state === 'damaged') return 1.4;
  return 1;
}
function shatter(p) {
  if (p.attached) coopEv({ t: 'sh', i: eIdx(p.enemy), pid: p.id });
  for (const c of p.children) if (c.attached) shatter(c);
  p.attached = false; p.state = 'destroyed';
  removeHittables(p.meshes);
  p.group.updateMatrixWorld(true);
  const wp = V3();
  for (const m of p.meshes) { m.getWorldPosition(wp); spawnDebris(wp, m.userData.base.getHex(), 3, 3.2); }
  p.group.getWorldPosition(wp);
  burstSparks(wp, UPY, 12, 0xffa040, 6); spawnFlash(wp, 0.9, 0.12, 0xffb060);
  SFX.brk();
  if (p.group.parent) p.group.parent.remove(p.group);
}
function detachPart(p, vel, asLoot) {
  coopEv({ t: 'det', i: eIdx(p.enemy), pid: p.id, v: v3a(vel) });
  for (const c of p.children) if (c.attached && asLoot) detachPart(c, vel.clone().add(V3(rand(-1, 1), 0.5, rand(-1, 1))), true);
  p.attached = false;
  removeHittables(p.meshes);
  GS.world.attach(p.group);
  GS.fallers.push({ obj: p.group, vel: vel.clone(), ang: V3(rand(-4, 4), rand(-4, 4), rand(-4, 4)), t: 0, onLand: () => { if (asLoot) createLoot(p); } });
}

export { conditionOf, damagePart, detachPart, handlePartEvent, hitPart, legFactor, partAlive, partValue, sensorMult, shatter };
