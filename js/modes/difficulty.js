import { GS } from '../core/state.js?v=36';
import { V3, rand } from '../core/utils.js?v=36';
import { SHOP } from '../data/data.js?v=36';
import { SFX } from '../core/audio.js?v=36';
import { addBox, crate } from '../world/world.js?v=36';
import { player } from '../player/playerState.js?v=36';
import { addAmmoCrate, addExtraction, setEnv, spawnEnemy } from '../world/missions.js?v=36';
import { spawnBoss, spawnShock } from '../bosses/rex.js?v=36';
import { dragonStrike, spawnDragon } from '../bosses/dragon.js?v=36';
import { spawnDrone } from '../enemies/extra.js?v=36';
import { spawnMite, spawnSpider } from '../bosses/spider.js?v=36';
import { addFeed, popup } from '../ui/hud.js?v=36';
import { itemOwned } from '../ui/hub.js?v=36';

// =====================================================================
//  하드 모드
// =====================================================================
GS.HARD = false;
const HARD_MUL = { hp: 1.4, dmg: 1.3, contract: 2, parts: 1.5, kill: 1.5 };
// 카오스: 보스 작전 전용. 보통 난이도를 한 번 클리어하면 열림. 계약금 ×3
GS.CHAOS = false;
const CHAOS_IDS = ['C', 'F', 'D'];
function chaosUnlocked(id) { return CHAOS_IDS.includes(id) && !!(GS.save.stats[id] && GS.save.stats[id].clears > 0); }
// 카오스 특수 패턴: 모든 공격이 빨라지고, 붉은 균열 낙뢰 + 보스별 추가 패턴
function chaosTick(dt) {
  const e = GS.run.boss; if (!e || e.dead || !e.bs || !e.bs.started) return;
  const B = e.bs, C = GS.run.chaosS || (GS.run.chaosS = { t: 5, t2: 8, q: [], rage: false });
  if (B.cd) for (const k in B.cd) B.cd[k] -= dt * 0.4;
  if (!C.rage && (B.phase2 || GS.time - (B.engageT || GS.time) > 75)) { C.rage = true; SFX.roar(); GS.shake = Math.max(GS.shake, 0.025); addFeed('카오스 각성 · 균열 낙뢰가 거세집니다', 'k'); popup('카오스 각성', 'bad'); }
  for (let i = C.q.length - 1; i >= 0; i--) { C.q[i].t -= dt; if (C.q[i].t <= 0) { const f = C.q[i].fn; C.q.splice(i, 1); f(); } }
  const tg = player;
  C.t -= dt;
  if (C.t <= 0) {
    C.t = C.rage ? 6 : 8.5;
    const n = C.rage ? 5 : 3, px = tg.pos.x + tg.vel.x * 0.9, pz = tg.pos.z + tg.vel.z * 0.9;
    dragonStrike(px, pz, 0xff2a50);
    for (let i = 1; i < n; i++) { const a = i / (n - 1) * Math.PI * 2 + rand(0, 1), r = rand(3, 6); dragonStrike(px + Math.cos(a) * r, pz + Math.sin(a) * r, 0xff2a50); }
    popup('카오스 균열 · 붉은 원에서 벗어나세요', 'bad');
  }
  C.t2 -= dt;
  if (C.t2 <= 0) {
    const id = GS.run.mission.id, p = e.root.position;
    if (id === 'C') {   // REX: 지면 강타 3연타 (점프로 넘기)
      C.t2 = C.rage ? 9 : 12; addFeed('REX-09 연속 지진 · 점프로 넘기세요', 'k');
      for (let i = 0; i < (C.rage ? 4 : 3); i++) C.q.push({ t: 0.75 * i, fn: () => { if (!e.dead) { spawnShock(e.root.position.x, e.root.position.z); SFX.shock(); GS.shake = Math.max(GS.shake, 0.02); } } });
    } else if (id === 'F') {   // 거미: 자폭 거미 무리
      C.t2 = C.rage ? 8 : 11; addFeed('ARACHNE 자폭 거미 방출', 'k');
      for (let i = 0; i < (C.rage ? 4 : 2); i++) { const a = rand(0, Math.PI * 2); spawnMite(p.x + Math.cos(a) * 3, p.z + Math.sin(a) * 3); }
    } else if (id === 'D') {   // 청룡: 십자 낙뢰
      C.t2 = C.rage ? 7 : 10; addFeed('청룡 십자 낙뢰', 'k');
      const px = tg.pos.x, pz = tg.pos.z;
      for (const [dx, dz] of [[0, 0], [3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2], [6.4, 0], [-6.4, 0], [0, 6.4], [0, -6.4]]) C.q.push({ t: Math.hypot(dx, dz) * 0.06, fn: () => dragonStrike(px + dx, pz + dz) });
    }
  }
}
function hardUnlocked(id) { return !!(GS.save.stats[id] && GS.save.stats[id].clears > 0); }
function applyHard(e) {
  e.hardDone = true;
  if (!GS.HARD) return;
  for (const p of Object.values(e.parts)) { p.maxHp *= HARD_MUL.hp; p.hp *= HARD_MUL.hp; p.brkMax *= HARD_MUL.hp; p.brk *= HARD_MUL.hp; }
  const c = e.cfg;
  e.cfg = Object.assign({}, c, { killReward: Math.round(c.killReward * HARD_MUL.kill),
    cooldown: c.cooldown ? c.cooldown * 0.75 : c.cooldown, spread: c.spread ? c.spread * 0.7 : c.spread, reaction: c.reaction ? c.reaction * 0.6 : c.reaction,
    detect: c.detect ? c.detect * 1.2 : c.detect, speed: c.speed ? c.speed * 1.1 : c.speed, aimTime: c.aimTime ? c.aimTime * 0.8 : c.aimTime });
}
function hardExtras(id) {
  if (id === 'A') { spawnEnemy('combat', -6, -18, 0.2); spawnEnemy('combat', 20, 0, -0.8); spawnDrone(-14, -14, 4.6); }
  else if (id === 'B') { spawnEnemy('heavy', 0, -18, 0, { guard: true }); spawnDrone(16, -14, 3.8); spawnEnemy('combat', -26, 2, 0.5); }
  else if (id === 'E') { spawnEnemy('combat', -20, 4, 0.3, { guard: true }); spawnEnemy('heavy', 20, 6, -0.3, { guard: true }); spawnDrone(0, -6, 4.6); for (const e of GS.enemies) if (e.relay) e.spawnLeft = 6; }
}
// =====================================================================
//  익스트림 모드 · 삼중 위협
// =====================================================================
const extremeItems = () => SHOP.filter(x => x.kind !== 'cons' && x.kind !== 'wlv');
function extremeProgress() { const it = extremeItems(); return [it.filter(itemOwned).length, it.length]; }
function extremeUnlocked() { const [a, b] = extremeProgress(); return a >= b; }
function buildColosseum() {
  setEnv({ sky: 0x4a3530, fog: [36, 150], hemi: [0xf0c8b0, 0x30221c, 1.35], sun: [0xff9a6a, 2.0, [-35, 32, 25]],
    ground: '#5a4c44', groundLine: 'rgba(30,18,14,.32)', size: [90, 90] });
  const W = 0x4a3c36;
  addBox(0, -45, 94, 2, 10, W); addBox(0, 45, 94, 2, 10, W); addBox(-45, 0, 2, 94, 10, W); addBox(45, 0, 2, 94, 10, W);
  // 돌진을 유도하는 굵은 기둥
  for (const [x, z] of [[0, -26], [-22, -13], [22, -13], [-22, 13], [22, 13], [0, 26]]) addBox(x, z, 3.2, 3.2, 13, 0x6a5a50);
  // 암석
  for (const [x, z, w, d, h] of [[-34, -30, 4, 4, 8], [34, -30, 4, 4, 9], [-34, 30, 4, 4, 9], [34, 30, 4, 4, 8], [-12, 0, 3, 3, 6], [12, 0, 3, 3, 6]]) addBox(x, z, w, d, h, 0x6f6258);
  const LC = 0x857669;
  for (const [x, z, w, d] of [[-8, 34, 4, 0.8], [8, 34, 4, 0.8], [-30, 0, 0.8, 4], [30, 0, 0.8, 4], [-8, -36, 4, 0.8], [8, -36, 4, 0.8],
    [0, 12, 4, 0.8], [0, -12, 4, 0.8], [-18, 26, 3, 0.8], [18, 26, 3, 0.8], [-18, -26, 3, 0.8], [18, -26, 3, 0.8]]) addBox(x, z, w, d, 1.1, LC);
  for (const [x, z, st] of [[-14, 38, 1], [14, 38, 0], [-39, 14, 1], [39, -14, 0], [-39, -20, 0], [39, 20, 1]]) { crate(x, z, 0x6d5a4c); if (st) crate(x, z, 0x625046, 1.2, 1.2); }
  addExtraction(0, 39);
  addAmmoCrate(-5, 40, true); addAmmoCrate(5, 40, true); addAmmoCrate(-41, 0, true); addAmmoCrate(41, 0, true); addAmmoCrate(0, -41, true);
  spawnBoss(0, -18, 0);
  spawnSpider(-24, -4, 0.6);
  spawnDragon(20, 13, -14);
  return { spawn: V3(0, 0, 38), yaw: 0, bounds: { x: 42, z: 42 } };
}
function barBoss() {
  if (!GS.run.mission.extreme) return GS.run.boss;
  const live = GS.enemies.filter(o => o.boss && !o.dead && o.alert);
  if (!live.length) return null;
  return live.reduce((a, b) => (b.lastHitT || 0) > (a.lastHitT || 0) ? b : a);
}

export { CHAOS_IDS, HARD_MUL, applyHard, barBoss, buildColosseum, chaosTick, chaosUnlocked, extremeProgress, extremeUnlocked, hardExtras, hardUnlocked };
