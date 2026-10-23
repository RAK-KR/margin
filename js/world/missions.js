import * as THREE from 'three';
import { GS } from '../core/state.js?v=35';
import { $, TEST, V3, rand, setText } from '../core/utils.js?v=35';
import { ARMORS, ETYPES, GRENADES, MISSIONS, SALVAGES, effW, maxReserve } from '../data/data.js?v=35';
import { writeSave } from '../core/save.js?v=35';
import { SFX, initAudio } from '../core/audio.js?v=35';
import { camera, groundTexture, scene } from '../core/renderer.js?v=35';
import { addBox, crate } from './world.js?v=35';
import { clearFX, projGeo } from '../fx/effects.js?v=35';
import { GUNS, HIP_POS } from '../player/viewmodel.js?v=35';
import { buildRobot } from '../enemies/robot.js?v=35';
import { EYE, P_HEIGHT, curWeapon, player, recoil } from '../player/playerState.js?v=35';
import { buildFoundry } from '../bosses/core.js?v=35';
import { buildRange, tutNext } from '../modes/tutorial.js?v=35';
import { lockPointer, showPause } from '../player/input.js?v=35';
import { alertEnemy } from '../enemies/ai.js?v=35';
import { buildArena } from '../bosses/rex.js?v=35';
import { buildShrine } from '../bosses/dragon.js?v=35';
import { _box3, addSniperLaser, spawnDrone, spawnRelay } from '../enemies/extra.js?v=35';
import { buildQuarry } from '../bosses/spider.js?v=35';
import { NET, buildAvatar, coopEv, coopOn, isHost, makeRemote } from '../modes/coop.js?v=35';
import { applyHard, buildColosseum, extremeUnlocked, hardExtras, hardUnlocked } from '../modes/difficulty.js?v=35';
import { achEvent, checkObjective, killEnemy } from '../meta/achievements.js?v=35';
import { addFeed, popup } from '../ui/hud.js?v=35';
import { carryList } from '../ui/hub.js?v=35';

// =====================================================================
//  임무 생성
// =====================================================================
function clearWorld() {
  GS.world.traverse(o => { if (o.geometry && o.geometry !== projGeo) o.geometry.dispose(); });
  scene.remove(GS.world); GS.world = new THREE.Group(); scene.add(GS.world);
  NET.av = null;
  GS.boxes = []; GS.hittables = []; GS.enemies = []; GS.loots = []; GS.fallers = []; GS.crates = []; GS.extraction = null; capZones = []; GS.missiles = []; GS.shocks = []; GS.throwables = []; GS.fadeRings = []; GS.bolts = [];
  clearFX();
}
function setEnv(o) {
  scene.background = new THREE.Color(o.sky);
  scene.fog = new THREE.Fog(o.sky, o.fog[0], o.fog[1]);
  GS.world.add(new THREE.HemisphereLight(o.hemi[0], o.hemi[1], o.hemi[2]));
  const sun = new THREE.DirectionalLight(o.sun[0], o.sun[1]); sun.position.set(...o.sun[2]); GS.world.add(sun);
  const gt = groundTexture(o.ground, o.groundLine); gt.repeat.set(o.size[0] / 4, o.size[1] / 4);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(o.size[0] + 8, o.size[1] + 8), new THREE.MeshLambertMaterial({ map: gt }));
  g.rotation.x = -Math.PI / 2; g.userData = { world: true }; GS.world.add(g); GS.hittables.push(g);
}
function addExtraction(x, z) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.5, 40), new THREE.MeshBasicMaterial({ color: 0x6fd08c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; grp.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.MeshBasicMaterial({ color: 0x6fd08c, transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.02; grp.add(fill);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x6fd08c, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
  col.position.y = 3.5; grp.add(col);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a2d2a, emissive: 0x2f8a52 }));
  beacon.position.set(2.8, 1.2, 0); grp.add(beacon);
  GS.world.add(grp);
  GS.boxes.push({ minX: x + 2.65, maxX: x + 2.95, minZ: z - 0.15, maxZ: z + 0.15, minY: 0, maxY: 2.4 });
  GS.extraction = { x, z, r: 2.3, grp, ring, col };
}
function addAmmoCrate(x, z, refill = false, y0 = 0) {
  const m = addBox(x, z, 1.1, 0.7, 0.7, 0x4b5338, y0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.72), new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0xd9a441 }));
  stripe.position.set(x, y0 + 0.5, z); GS.world.add(stripe);
  GS.crates.push({ x, z, y: y0, used: false, refill, readyAt: 0, stripe });
}
function buildScrapyard() {
  setEnv({ sky: 0x9a9186, fog: [28, 120], hemi: [0xf0e4cf, 0x4a3f33, 1.7], sun: [0xffe2b8, 2.0, [-30, 50, 24]],
    ground: '#6b6256', groundLine: 'rgba(40,34,28,.35)', size: [64, 64] });
  const W = 0x5b5650;
  addBox(0, -31, 64, 2, 4, W); addBox(0, 31, 64, 2, 4, W); addBox(-31, 0, 2, 64, 4, W); addBox(31, 0, 2, 64, 4, W);
  // 컨테이너
  addBox(-18, -8, 2.4, 6, 2.6, 0x8a3b2a); addBox(-15.2, -8, 2.4, 6, 2.6, 0x55684a);
  addBox(14, -14, 6, 2.4, 2.6, 0xa0782f); addBox(14, -14, 6, 2.4, 2.4, 0x6a6a66, 2.6);
  addBox(20, 6, 2.4, 6, 2.6, 0x55684a); addBox(-20, 14, 6, 2.4, 2.6, 0x8a3b2a);
  addBox(-4, -22, 6, 2.4, 2.6, 0x6a6a66); addBox(22, -24, 2.4, 6, 2.6, 0x8a3b2a);
  addBox(9, 13, 2.4, 6, 2.6, 0xa0782f);
  // 낮은 엄폐물 (콘크리트 방벽)
  const CB = 0x8e8a82;
  addBox(-5, 16, 3, 0.6, 1.1, CB); addBox(5, 17, 3, 0.6, 1.1, CB); addBox(0, 9, 4, 0.6, 1.1, CB);
  addBox(-12, 2, 0.6, 3, 1.1, CB); addBox(12, 0, 0.6, 3, 1.1, CB); addBox(7, -6, 3, 0.6, 1.1, CB);
  addBox(-8, -13, 3, 0.6, 1.1, CB); addBox(1, -15, 4, 0.6, 1.1, CB); addBox(-24, 0, 0.6, 4, 1.1, CB);
  addBox(24, -4, 0.6, 3, 1.1, CB);
  // 고철 더미 (상자)
  for (const [x, z, st] of [[-10, 22, 1], [-11.3, 22, 0], [12, 21, 0], [13.3, 21.2, 1], [19, -4, 1], [-22, -20, 1], [-23.3, -19.6, 0],
    [6, -26, 1], [7.3, -26, 0], [-26, 24, 0], [26, 24, 1], [-3, 2, 0]]) {
    crate(x, z, 0x7a6646); if (st) crate(x, z, 0x6b5a40, 1.2, 1.2);
  }
  // 폐차
  addBox(0, -3, 4.4, 2.2, 1.4, 0x4f4a44); addBox(-0.4, -3, 2.4, 2.0, 0.8, 0x5c554d, 1.4);
  // 추가 엄폐물: 시야를 끊는 높은 벽 + 낮은 방벽 + 고철 더미
  const TW = 0x6f6a62;
  addBox(-7, 6, 0.6, 4, 2.4, TW); addBox(6, 4, 4, 0.6, 2.4, TW);
  addBox(-14, 10, 4, 0.6, 2.4, TW); addBox(16, 13, 0.6, 4, 2.4, TW);
  addBox(-4, -9, 0.6, 3.5, 2.4, TW); addBox(9, -10, 3.5, 0.6, 2.4, TW);
  addBox(-20, -14, 3.5, 0.6, 2.4, TW); addBox(20, -17, 0.6, 3.5, 2.4, TW);
  addBox(-16, 6, 3, 0.6, 1.1, CB); addBox(16, 9, 0.6, 3, 1.1, CB); addBox(-12, -16, 3, 0.6, 1.1, CB);
  addBox(8, -13, 0.6, 3, 1.1, CB); addBox(-12, 18, 0.6, 3, 1.1, CB); addBox(0, 4, 3, 0.6, 1.1, CB);
  for (const [x, z, st] of [[-9.5, 10, 1], [11, 5, 1], [-24, 8, 1], [24, 14, 0], [3, -8, 0], [-20, -2, 1], [21, -1, 0]]) {
    crate(x, z, 0x7a6646); if (st) crate(x, z, 0x6b5a40, 1.2, 1.2);
  }
  addExtraction(0, 25);
  addAmmoCrate(4, 23); addAmmoCrate(-25, -6);
  spawnEnemy('scout', -14, 0, Math.PI * 0.2);
  spawnEnemy('scout', 16, -8, -Math.PI * 0.3);
  spawnEnemy('scout', -9, -19, 0.5);
  spawnEnemy('scout', 5, -20, -0.3);
  spawnEnemy('scout', 25, -14, -1.2);
  spawnEnemy('combat', -16, -23, 0.4);
  spawnEnemy('combat', 13, -21, -0.2);
  spawnDrone(2, -12, 4.6);
  return { spawn: V3(0, 0, 25), yaw: 0, bounds: { x: 29, z: 29 } };
}
function buildFactory() {
  setEnv({ sky: 0x17191c, fog: [16, 78], hemi: [0xa8aeb6, 0x2e2a26, 1.1], sun: [0xfff1dc, 0.7, [20, 40, -10]],
    ground: '#3c3d3f', groundLine: 'rgba(230,180,70,.18)', size: [64, 48] });
  for (const [x, y, z] of [[-16, 6, -12], [16, 6, -12], [0, 6, -4], [-18, 6, 14], [18, 6, 14]]) {
    const l = new THREE.PointLight(0xffd9a0, 110, 40, 1.7); l.position.set(x, y, z); GS.world.add(l);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe6b8 }));
    lamp.position.set(x, y + 0.2, z); GS.world.add(lamp);
  }
  const W = 0x4a4c50;
  addBox(0, -25, 66, 2, 7, W); addBox(0, 25, 66, 2, 7, W); addBox(-33, 0, 2, 52, 7, W); addBox(33, 0, 2, 52, 7, W);
  // 내부 칸막이 (중앙 출입구)
  addBox(-20, 4, 24, 0.8, 4.5, 0x55575b); addBox(20, 4, 24, 0.8, 4.5, 0x55575b);
  // 기둥
  for (const x of [-22, -11, 11, 22]) for (const z of [-14, 14]) addBox(x, z, 1, 1, 7, 0x6b6d70);
  // 기계 설비
  addBox(-16, -15, 4, 3, 3, 0x5a5f55); addBox(-16, -15, 2.4, 1.6, 1.2, 0x4a4e47, 3);
  addBox(14, -16, 5, 3.2, 3.2, 0x6a5440);
  addBox(-6, -4, 2.5, 2.5, 2.0, 0x5a5f55); addBox(7, -3, 2.5, 2.5, 2.0, 0x6a5440);
  // 컨베이어
  addBox(0, -19, 16, 1.6, 1.0, 0x3a3c3e); addBox(-19, -8, 10, 1.6, 1.0, 0x3a3c3e); addBox(19, -6, 10, 1.6, 1.0, 0x3a3c3e);
  // 앞쪽 구역 엄폐물
  addBox(-6, 13, 3, 0.6, 1.1, 0x77736c); addBox(6, 12, 3, 0.6, 1.1, 0x77736c); addBox(0, 8, 4, 0.6, 1.1, 0x77736c);
  for (const [x, z, st] of [[-26, 16, 1], [26, 14, 1], [-4, 17, 0], [7, 18, 1], [-28, -20, 1], [28, -20, 0], [-14, 9, 0], [15, 9, 1], [-24, -2, 0], [25, 0, 1]]) {
    crate(x, z, 0x6a5a40); if (st) crate(x, z, 0x5c4e38, 1.2, 1.2);
  }
  // 추가 엄폐물
  const TW = 0x5d5f63, LC = 0x77736c;
  addBox(-12, 17, 0.6, 4, 2.4, TW); addBox(12, 16, 0.6, 4, 2.4, TW);
  addBox(-5, 6, 2, 0.6, 1.1, LC); addBox(5, 6, 2, 0.6, 1.1, LC);
  addBox(0, -1, 3, 0.6, 1.1, LC); addBox(0, -7, 3, 0.6, 2.4, TW);
  addBox(-10, -8, 0.6, 3, 1.1, LC); addBox(11, -8, 0.6, 3, 1.1, LC);
  addBox(-18, 0, 3, 0.6, 2.4, TW); addBox(18, 1, 3, 0.6, 2.4, TW);
  addBox(-26, -10, 0.6, 4, 2.4, TW); addBox(26, -14, 0.6, 4, 2.4, TW);
  for (const [x, z, st] of [[-17.5, -3, 1], [17.5, -3, 0], [-3, -15, 1], [4, -15, 0], [-20, 9, 0], [21, 8, 1]]) {
    crate(x, z, 0x6a5a40); if (st) crate(x, z, 0x5c4e38, 1.2, 1.2);
  }
  addExtraction(0, 20);
  addAmmoCrate(-4, 22); addAmmoCrate(28, -23); addAmmoCrate(-28, 8);
  spawnEnemy('combat', -14, -1, 0.2);
  spawnEnemy('combat', 14, -1, -0.2);
  spawnEnemy('combat', -22, -18, 0.6);
  spawnEnemy('combat', 22, -11, -0.6);
  spawnEnemy('heavy', -6, -12, 0, { guard: true });
  spawnEnemy('heavy', 7, -11, 0, { guard: true });
  spawnEnemy('sniper', 0, -22, 0, { guard: true });
  spawnDrone(-20, -12, 3.8);
  return { spawn: V3(0, 0, 21), yaw: 0, bounds: { x: 31, z: 23 } };
}

function spawnEnemy(type, x, z, yaw, opts = {}) {
  const r = buildRobot(type), cfg = ETYPES[type];
  const e = { type, cfg, root: r.root, body: r.body, parts: r.parts, muzzle: r.muzzle, glow: r.glow, eyeY: r.eyeY, coreY: r.coreY,
    yaw, homeYaw: yaw, home: V3(x, 0, z), alert: false, canSee: false, losT: Math.random() * 0.2, lastSeen: V3(x, 0, z), lostT: 0,
    fireCd: 1, burstLeft: 0, burstT: 0, stunT: 0, stunned: false, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
    patrolT: rand(1, 4), patrolTarget: V3(x, 0, z), phase: Math.random() * 6, hitKick: 0, dead: false, guard: !!opts.guard,
    stuckT: 0, detourT: 0, detour: V3(), sparkT: 0, canShoot: true, pendingAlert: 0, moveSpeed: 0, tilt: 0 };
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  r.root.position.set(x, 0, z); r.root.rotation.y = yaw;
  GS.world.add(r.root); GS.enemies.push(e);
  if (cfg.sniper) addSniperLaser(e);
  if (isHost() && GS.state === 'mission') coopEv({ t: 'spawn', i: GS.enemies.length - 1, k: type, x, z, r: yaw });
  return e;
}

function startMission(id, hardOverride, force) {
  const ms = MISSIONS[id];
  if (!ms || !GS.save.unlocked[id]) return;
  if (ms.extreme && !force && !extremeUnlocked()) { popup('상점 장비를 모두 구매하면 열립니다', 'dim'); return; }
  initAudio();
  { const sd = document.getElementById('skilldemo'); if (sd) sd.remove(); const tb = document.getElementById('toasts'); if (tb) tb.classList.remove('hubpos'); }
  clearWorld();
  const spawn = ({ A: buildScrapyard, B: buildFactory, C: buildArena, D: buildShrine, E: buildSubstation, F: buildQuarry, G: buildColosseum, T: buildRange, H: buildFoundry })[id]();
  GS.MAPB = spawn.bounds || { x: 30, z: 30 };
  GS.HARD = ms.extreme || ms.tut || ms.final ? false : hardOverride !== undefined ? !!hardOverride : (!!GS.save.hardSel && hardUnlocked(id));
  if (ms.extreme) for (const e of GS.enemies) if (e.boss) for (const p of Object.values(e.parts)) { p.maxHp *= 0.85; p.hp = p.maxHp; p.brkMax *= 0.85; p.brk = p.brkMax; }
  if (GS.HARD && !ms.boss) hardExtras(id);
  for (const e of GS.enemies) applyHard(e);
  if (coopOn()) for (const e of GS.enemies) if (e.boss) for (const p of Object.values(e.parts)) { p.maxHp *= 1.6; p.hp = p.maxHp; p.brkMax *= 1.6; p.brk = p.brkMax; }
  const arm = ms.extreme ? ARMORS[0] : ARMORS[GS.save.armor];
  player.pos.copy(spawn.spawn); player.vel.set(0, 0, 0); player.vy = 0; player.onGround = true;
  player.maxHp = arm.hp; player.hp = arm.hp; player.dr = arm.dr; player.lastHurt = -99; player.downed = false; player.out = false; player.crouch = 0; player.eye = EYE; player.height = P_HEIGHT;
  camera.position.set(player.pos.x, EYE, player.pos.z);
  camera.quaternion.setFromEuler(new THREE.Euler(0, spawn.yaw, 0, 'YXZ'));
  const ids = [...carryList(), 'pistol'];
  const wst = {}; for (const w of ids) wst[w] = effW(w);
  if (!(GS.save.inv[GS.save.grenadeSel] > 0)) GS.save.grenadeSel = GRENADES.find(g => GS.save.inv[g] > 0) || 'emp';
  GS.run = { mission: ms, wst, ws: ids.map(w => ({ id: w, mag: wst[w].mag, reserve: maxReserve(w) })), cur: 0, lastCur: ids.length - 1, medkits: GS.save.utils.medkit && !ms.extreme ? 2 : 0, charging: false, chargeT: 0, chargeK: null,
    skillCd: [0, 0], shield: 0, shieldT: 0, nanoT: 0, ocT: 0, focusT: 0, dashT: 0, iframeT: 0, burstLeft: 0, burstT: 0, throwCd: 0,
    reloadT: 0, switchT: 0, loot: [], kills: 0, killReward: 0, killsByType: {}, total: GS.enemies.length, objDone: false,
    hard: GS.HARD, coop: coopOn(), shots: 0, hitsN: 0, shotsHit: 0, startT: GS.time, used: {}, bossKillT: 0, salvageBonus: SALVAGES[GS.save.salvage].bonus, boss: GS.enemies.find(e => e.boss) || null };
  GS.ads = 0; GS.fireCd = 0; GS.bloom = 0; recoil.cur = recoil.target = 0; GS.vigT = 0; GS.earlyConfirmT = 0; GS.dmgLog = {};
  if (coopOn()) {
    const off = NET.role === 'guest' ? 1.6 : -1.6;
    player.pos.x += off; camera.position.set(player.pos.x, EYE, player.pos.z);
    NET.rp = makeRemote(); NET.rp.tpos.set(player.pos.x - off * 2, 0, player.pos.z); NET.rp.pos.copy(NET.rp.tpos);
    NET.av = buildAvatar(); NET.av.g.position.copy(NET.rp.pos); NET.evq = []; NET.outq = []; NET.sendT = 0; NET.fullT = 0; NET.lid = 0; NET.revT = 0;
  }
  showGun(); $('feed').innerHTML = '';
  $('tut').classList.toggle('hidden', !ms.tut);
  if (ms.tut) { GS.run.tut = { i: -1, okT: 0, marker: null }; tutNext(); }
  GS.save.stats[id].runs++; writeSave();
  GS.state = 'mission';
  $('hub').classList.add('hidden'); $('result').classList.add('hidden'); $('hud').classList.remove('hidden');
  setText($('objcode'), ms.code + (GS.HARD ? ' · 하드' : '')); $('objcode').classList.toggle('bad', GS.HARD); setText($('objname'), ms.name); setText($('armorname'), arm.name);
  if (ms.extreme && (GS.save.armor || GS.save.utils.medkit || GS.save.utils.regen || GS.save.utils.radar)) addFeed('익스트림 규정 · 방어복과 보조 장비 사용 불가', 'x');
  if (ms.final) addFeed('작전 개시 · 생산 코어를 멈추고 탈출 지점으로 귀환', 'x');
  else if (!ms.tut) addFeed(ms.extreme ? '작전 개시 · 세 보스를 모두 격파하고 탈출 지점으로 귀환' : ms.boss ? `작전 개시 · 목표 ${ms.target[0]} 격파 후 탈출 지점으로 귀환` : ms.relays ? '작전 개시 · 구역 3곳을 점령하고 탈출 지점으로 귀환' : '작전 개시 · 모든 적대 기계를 제거하고 탈출 지점으로 귀환', 'x');
  if (!TEST) { showPause(true); lockPointer(); }
}

function showGun() {
  for (const k in GUNS) GUNS[k].visible = false;
  const g = GUNS[curWeapon().id]; g.visible = true; g.position.copy(HIP_POS).add(V3(0, -0.25, 0));
}

// =====================================================================
//  임무: 변전소 장악
// =====================================================================
function powerTower(x, z, h, col = 0x3a3d42) {
  const g = new THREE.Group(); const mat = new THREE.MeshLambertMaterial({ color: col });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const m = new THREE.Mesh(_box3(0.18, h, 0.18), mat); m.position.set(sx * 0.9, h / 2, sz * 0.9); m.rotation.z = -sx * 0.06; m.rotation.x = sz * 0.06; g.add(m); }
  for (let y = 2; y < h; y += 2.4) { const a = new THREE.Mesh(_box3(2, 0.1, 0.1), mat); a.position.set(0, y, 0.9 - y * 0.02); g.add(a); const b = a.clone(); b.position.z = -0.9 + y * 0.02; g.add(b); }
  const arm = new THREE.Mesh(_box3(6, 0.25, 0.25), mat); arm.position.set(0, h - 1, 0); g.add(arm);
  g.position.set(x, 0, z); GS.world.add(g);
}
// 점령 구역: 안에 머물면 점령, 적이 있으면 멈춤, 시작과 절반 지점에서 증원
let capZones = [];
const zoneRingGeo = new THREE.RingGeometry(5.6, 6, 56), zoneColGeo = new THREE.CylinderGeometry(6, 6, 1, 40, 1, true);
function addZone(x, z, name, relay) {
  const ring = new THREE.Mesh(zoneRingGeo, new THREE.MeshBasicMaterial({ color: 0xd9443a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.04, z);
  const col = new THREE.Mesh(zoneColGeo, new THREE.MeshBasicMaterial({ color: 0xd9443a, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  col.position.set(x, 0, z); col.scale.y = 0.01;
  GS.world.add(ring, col);
  capZones.push({ x, z, r: 6, name, relay, prog: 0, done: false, started: false, wave2: false, inside: false, contested: false, ring, col });
}
const ZONE_EDGES = [[-31, 22], [31, 21], [-31, -6], [31, -8], [-12, -28], [14, -28], [0, 12]];
function zoneWave(z, n) {
  const pts = ZONE_EDGES.filter(([x, q]) => Math.hypot(x - player.pos.x, q - player.pos.z) > 16).sort(() => Math.random() - 0.5);
  const kinds = n === 1 ? ['combat', 'combat'] : ['heavy', 'scout'];
  if (GS.run.hard) kinds.push('combat');
  kinds.forEach((k, i) => {
    const [x, q] = pts[i % pts.length] || [0, -28];
    const e = spawnEnemy(k, x, q, Math.atan2(z.x - x, z.z - q), {});
    alertEnemy(e); e.lastSeen.set(z.x, 0, z.z); GS.run.total++;
  });
  if (z.relay && !z.relay.dead) z.relay.spawnT = 0.5;
}
function updateZones(dt) {
  const capT = GS.run.hard ? 22 : 18;
  for (const z of capZones) {
    const pulse = 0.5 + 0.5 * Math.sin(GS.time * 4 + z.x);
    if (z.done) { z.ring.material.color.setHex(0x5ad8ff); z.ring.material.opacity = 0.5 + 0.2 * pulse; z.col.material.color.setHex(0x5ad8ff); z.col.scale.y = 0.6; z.col.position.y = 0.3; z.col.material.opacity = 0.05; continue; }
    const inside = !player.downed && Math.hypot(player.pos.x - z.x, player.pos.z - z.z) < z.r && player.pos.y < 3;
    const foes = inside ? GS.enemies.filter(e => !e.dead && !e.relay && Math.hypot(e.root.position.x - z.x, e.root.position.z - z.z) < z.r + 1.5).length : 0;
    z.inside = inside; z.contested = inside && foes > 0;
    if (inside && !z.started) { z.started = true; zoneWave(z, 1); addFeed(`구역 ${z.name} 점령 시작 · 적 증원 접근`, 'x'); popup(`구역 ${z.name} 점령 시작`, 'weak'); }
    if (inside && !foes) {
      z.prog = Math.min(1, z.prog + dt / capT);
      if (!z.wave2 && z.prog >= 0.5) { z.wave2 = true; zoneWave(z, 2); addFeed(`구역 ${z.name} 절반 점령 · 중장갑 증원`, 'x'); }
    }
    const c = z.contested ? 0xff5a3a : inside ? 0xffb340 : 0xd9443a;
    z.ring.material.color.setHex(c); z.ring.material.opacity = inside ? 0.7 + 0.3 * pulse : 0.6;
    z.col.material.color.setHex(c); z.col.scale.y = Math.max(0.01, z.prog * 8); z.col.position.y = z.col.scale.y / 2; z.col.material.opacity = 0.06 + 0.06 * (inside ? pulse : 0);
    if (z.prog >= 1) {
      z.done = true; SFX.objective(); addFeed(`구역 ${z.name} 점령 완료 · 중계탑 정지`, 'd'); popup(`구역 ${z.name} 점령`, 'weak');
      if (z.relay && !z.relay.dead) killEnemy(z.relay, 'shutdown'); else checkObjective();
      achEvent('zone', { z });
    }
  }
}
function zoneText() { return capZones.map(z => `${z.name} ${z.done ? '완료' : Math.round(z.prog * 100) + '%'}`).join(' · '); }
function zonePrompt() {
  const z = capZones.find(q => q.inside && !q.done); if (!z) return '';
  return z.contested ? `<span class="bad">구역 ${z.name} · 적이 구역 안에 있어 점령 중단</span>` : `<span class="acc">구역 ${z.name} 점령 중 ${Math.round(z.prog * 100)}%</span> <span class="dim">구역 밖으로 나가면 멈춤</span>`;
}
function buildSubstation() {
  setEnv({ sky: 0x3b4150, fog: [22, 105], hemi: [0xb8c4d8, 0x2a2622, 1.3], sun: [0xffb27a, 1.6, [-40, 18, 30]],
    ground: '#4a4c4a', groundLine: 'rgba(140,170,200,.16)', size: [70, 62] });
  const W = 0x3e4146;
  addBox(0, -31, 72, 2, 4.5, W); addBox(0, 31, 72, 2, 4.5, W); addBox(-35, 0, 2, 64, 4.5, W); addBox(35, 0, 2, 64, 4.5, W);
  for (const [x, y, z] of [[-14, 7, -6], [14, 7, -2], [0, 7, -20], [-24, 7, 12], [24, 7, 14]]) {
    const l = new THREE.PointLight(0xffd2a0, 70, 34, 1.7); l.position.set(x, y, z); GS.world.add(l);
    const lamp = new THREE.Mesh(_box3(0.5, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe6b8 })); lamp.position.set(x, y + 0.2, z); GS.world.add(lamp);
    const pole = new THREE.Mesh(_box3(0.15, y, 0.15), new THREE.MeshLambertMaterial({ color: 0x2c2e31 })); pole.position.set(x + 0.4, y / 2, z); GS.world.add(pole);
  }
  for (const [x, z] of [[-30, -26], [30, -26], [-30, 25], [30, 25]]) powerTower(x, z, 15);
  // 변압기 (높은 엄폐)
  const TR = 0x5a6068, FIN = 0x4a4f56;
  for (const [x, z] of [[-10, -4], [10, 2], [-19, 5], [18, 11], [-5, -13], [7, -17], [-14, 18], [13, 20]]) {
    addBox(x, z, 3, 2.4, 2.8, TR); addBox(x, z, 3.4, 0.3, 2.2, FIN);
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), new THREE.MeshLambertMaterial({ color: 0xc9b9a0 }));
    for (const dx of [-0.9, 0, 0.9]) { const m = ins.clone(); m.position.set(x + dx, 3.3, z); GS.world.add(m); }
  }
  // 낮은 방벽 · 펜스
  const CB = 0x7c7a74;
  for (const [x, z, w, d] of [[-4, 17, 3, 0.6], [5, 15, 3, 0.6], [0, 8, 4, 0.6], [-14, 9, 0.6, 3], [15, 6, 0.6, 3], [-24, -4, 0.6, 3.5], [24, -6, 0.6, 3.5],
    [-2, -6, 3, 0.6], [4, 3, 3, 0.6], [-22, -20, 3, 0.6], [22, -18, 3, 0.6], [-10, -22, 0.6, 3], [12, -26, 3, 0.6]]) addBox(x, z, w, d, 1.1, CB);
  for (const [x, z, w, d] of [[-28, 0, 0.25, 10], [28, 2, 0.25, 10]]) addBox(x, z, w, d, 1.9, 0x8e9499);
  for (const [x, z, st] of [[-7, 22, 1], [8, 23, 0], [-27, 16, 1], [27, -12, 0], [-17, -12, 1], [19, -2, 0], [2, -28, 1]]) {
    crate(x, z, 0x5a5f55); if (st) crate(x, z, 0x4f5450, 1.2, 1.2);
  }
  // 저격 망루
  for (const [x, z] of [[-27, -24], [27, -22]]) {
    addBox(x, z, 4, 4, 4.2, 0x55585c);
    const rail = new THREE.MeshLambertMaterial({ color: 0x2c2e31 });
    for (const [rx, rz, w, d] of [[0, 2, 4, 0.08], [-2, 0, 0.08, 4], [2, 0, 0.08, 4]]) { const m = new THREE.Mesh(_box3(w, 0.9, d), rail); m.position.set(x + rx, 4.65, z + rz); GS.world.add(m); }
  }
  addExtraction(0, 26);
  addAmmoCrate(4, 24); addAmmoCrate(-31, 6); addAmmoCrate(31, 4);
  const rA = spawnRelay(-22, -12), rB = spawnRelay(22, -9), rC = spawnRelay(0, -24);
  addZone(-20, -8, 'A', rA); addZone(19, -5, 'B', rB); addZone(0, -19, 'C', rC);
  for (const [x, z] of [[-27, -24], [27, -22]]) { const s = spawnEnemy('sniper', x, z + 1, 0, { guard: true }); s.root.position.y = 4.2; s.perch = true; }
  spawnEnemy('combat', -12, -8, 0.3, { guard: true });
  spawnEnemy('combat', 13, -5, -0.3, { guard: true });
  spawnEnemy('combat', 2, -16, 0, { guard: true });
  spawnDrone(-8, -18, 4.6); spawnDrone(10, -14, 4.6);
  return { spawn: V3(0, 0, 26), yaw: 0, bounds: { x: 33, z: 29 } };
}

export { addAmmoCrate, addExtraction, capZones, clearWorld, setEnv, showGun, spawnEnemy, startMission, updateZones, zonePrompt, zoneText };
