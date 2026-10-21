import { GS } from '../core/state.js?v=30';
import { V3 } from '../core/utils.js?v=30';
import { SHOP } from '../data/data.js?v=30';
import { addBox, crate } from '../world/world.js?v=30';
import { addAmmoCrate, addExtraction, setEnv, spawnEnemy } from '../world/missions.js?v=30';
import { spawnBoss } from '../bosses/rex.js?v=30';
import { spawnDragon } from '../bosses/dragon.js?v=30';
import { spawnDrone } from '../enemies/extra.js?v=30';
import { spawnSpider } from '../bosses/spider.js?v=30';
import { itemOwned } from '../ui/hub.js?v=30';

// =====================================================================
//  하드 모드
// =====================================================================
GS.HARD = false;
const HARD_MUL = { hp: 1.4, dmg: 1.3, contract: 2, parts: 1.5, kill: 1.5 };
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

export { HARD_MUL, applyHard, barBoss, buildColosseum, extremeProgress, extremeUnlocked, hardExtras, hardUnlocked };
