import * as THREE from 'three';
import { GS } from '../core/state.js?v=35';
import { V3, clamp, lerp, rand } from '../core/utils.js?v=35';
import { ETYPES } from '../data/data.js?v=35';
import { SFX } from '../core/audio.js?v=35';
import { addBox } from '../world/world.js?v=35';
import { UPY, burstSparks, projGeo, spawnFlash } from '../fx/effects.js?v=35';
import { addAmmoCrate, addExtraction, setEnv, spawnEnemy } from '../world/missions.js?v=35';
import { alertEnemy } from '../enemies/ai.js?v=35';
import { markerGeo, partTick, spawnShock } from './rex.js?v=35';
import { dragonStrike, spawnBossProj } from './dragon.js?v=35';
import { _box3, dummyGlow, partKit, spawnDrone } from '../enemies/extra.js?v=35';
import { spawnMite } from './spider.js?v=35';
import { dmgTargets, hurtTarget, knockTarget } from '../modes/coop.js?v=35';
import { addFeed, popup } from '../ui/hud.js?v=35';

// =====================================================================
//  최종 작전: 근원지 · 생산 코어
// =====================================================================
const CORE_GATES = [[-17, -31], [17, -31]];
function buildFoundry() {
  setEnv({ sky: 0x141619, fog: [14, 92], hemi: [0x8a8070, 0x1a1512, 0.95], sun: [0xff9a50, 0.9, [0, 40, -30]],
    ground: '#2f2c29', groundLine: 'rgba(255,150,70,.10)', size: [74, 74] });
  const W = 0x26272a;
  addBox(0, -37, 76, 2, 12, W); addBox(0, 37, 76, 2, 12, W); addBox(-37, 0, 2, 76, 12, W); addBox(37, 0, 2, 76, 12, W);
  for (const [x, z] of [[-24, -14], [24, -14], [-20, 16], [20, 16], [0, -32], [0, 24]]) {
    const l = new THREE.PointLight(0xff8a3a, 80, 30, 1.6); l.position.set(x, 6, z); GS.world.add(l);
  }
  // 기둥 (포격 · 에너지탄 엄폐)
  for (const [x, z] of [[-14, 2], [14, 2], [-26, -22], [26, -22], [-7, 15], [7, 15]]) addBox(x, z, 2.4, 2.4, 12, 0x3a3734);
  // 컨베이어 (낮은 엄폐)
  const stripeM = new THREE.MeshBasicMaterial({ color: 0xd9a441 });
  for (const [x, z, w, d] of [[-24, 8, 9, 1.6], [24, 8, 9, 1.6], [-10, 25, 8, 1.6], [10, 25, 8, 1.6], [-28, -6, 1.6, 8], [28, -6, 1.6, 8]]) {
    addBox(x, z, w, d, 1.0, 0x45413a);
    const st = new THREE.Mesh(_box3(w > d ? w : 0.12, 0.03, w > d ? 0.12 : d), stripeM); st.position.set(x, 1.02, z); GS.world.add(st);
  }
  // 용광로 구덩이 (빛만)
  for (const [x, z] of [[-22, -26], [22, -26], [0, 6]]) {
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.55 }));
    pit.rotation.x = -Math.PI / 2; pit.position.set(x, 0.03, z); GS.world.add(pit);
  }
  // 생산 라인 출구
  for (const [x, z] of CORE_GATES) {
    addBox(x - 3.2, z - 1, 1.2, 3, 7, 0x3a3734); addBox(x + 3.2, z - 1, 1.2, 3, 7, 0x3a3734); addBox(x, z - 1, 7.6, 3, 1.2, 0x3a3734, 7);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 6.4), new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    glow.position.set(x, 3.2, z - 2.4); GS.world.add(glow);
  }
  addExtraction(0, 31);
  addAmmoCrate(-31, 28); addAmmoCrate(31, 28); addAmmoCrate(-31, -10); addAmmoCrate(31, -10);
  spawnCore(0, -15);
  return { spawn: V3(0, 0, 30), yaw: 0, bounds: { x: 35, z: 35 } };
}
function buildCore() {
  const cfg = ETYPES.fcore, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = {}, { P, M } = partKit(cfg, parts, { core: '코어 외피', reactor: '동력로', head: '감시 센서', podL: '좌측 포격 포드', podR: '우측 포격 포드', armA: '조립 팔 1', armB: '조립 팔 2', armC: '조립 팔 3' });
  const C = { main: 0x4a4740, dark: 0x24231f, plate: 0x6e665a, acc: 0xc77a2c };
  const core = P('core', body);
  M(core, new THREE.CylinderGeometry(5.6, 6.2, 2.2, 8), C.dark, 0, 1.1, 0);
  M(core, new THREE.CylinderGeometry(5.0, 5.4, 0.4, 8), C.acc, 0, 2.4, 0, { emissive: 0x401800 });
  M(core, new THREE.CylinderGeometry(2.4, 2.9, 3.4, 8), C.main, 0, 4.3, 0);
  M(core, new THREE.CylinderGeometry(2.2, 2.4, 3.6, 8), C.main, 0, 9.8, 0);
  M(core, new THREE.CylinderGeometry(2.9, 2.2, 0.6, 8), C.plate, 0, 11.9, 0);
  // 냉각구 덮개 (닫히면 동력로를 가림)
  const shutters = new THREE.Group(); body.add(shutters);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2, m = M(core, _box3(2.5, 2.2, 0.35), C.plate, Math.sin(a) * 2.05, 7.1, Math.cos(a) * 2.05, { ry: a, parent: shutters });
    m.userData.sub = '냉각구 덮개';
  }
  const re = P('reactor', body);
  const reactorM = M(re, new THREE.SphereGeometry(1.45, 16, 12), 0x0a2230, 0, 7.1, 0, { emissive: 0x66d8ff, hitMult: 1.3, sub: '동력로 핵' });
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; M(re, _box3(0.25, 2.4, 0.25), C.dark, Math.sin(a) * 1.75, 7.1, Math.cos(a) * 1.75); }
  const hd = P('head', body);
  M(hd, new THREE.TorusGeometry(1.5, 0.28, 8, 24), C.dark, 0, 12.5, 0, { rx: Math.PI / 2 });
  const eye = M(hd, new THREE.SphereGeometry(0.75, 12, 10), 0x300000, 0, 12.9, 0, { emissive: 0xff3a1a, hitMult: 1.5, sub: '감시 렌즈' });
  const pods = {};
  for (const [id, sx] of [['podL', 1], ['podR', -1]]) {
    const pd = P(id, body); pd.group.position.set(sx * 3.1, 9.6, 0);
    M(pd, _box3(1.6, 1.6, 2.2), C.main, 0, 0, 0);
    for (const ox of [-0.4, 0.4]) for (const oz of [-0.5, 0.5]) M(pd, new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), 0x1a1a1a, ox, 0.95, oz, { emissive: 0x401000, sub: '발사관' });
    pods[id] = pd;
  }
  // 조립 팔 세 개 (탑을 돌며 근접한 적을 쓸어냄)
  const arms = new THREE.Group(); arms.position.y = 4.6; body.add(arms);
  ['armA', 'armB', 'armC'].forEach((id, i) => {
    const ar = P(id, arms); const a = i / 3 * Math.PI * 2; ar.group.rotation.y = a;
    M(ar, _box3(0.9, 0.9, 4.8), C.plate, 0, 0, 4.4);
    M(ar, new THREE.SphereGeometry(0.62, 12, 10), C.acc, 0, 0, 6.9, { hitMult: 1.6, exposed: true, sub: '관절' });
    M(ar, _box3(0.6, 3.2, 0.6), C.main, 0, -1.6, 7.2, { rx: 0.2 });
    M(ar, _box3(1.2, 0.35, 1.0), C.dark, 0, -3.25, 7.6);
    for (const cx of [-0.4, 0.4]) M(ar, _box3(0.18, 0.5, 0.18), 0xd8d2c0, cx, -3.6, 7.9);
  });
  return { root, body, parts, shutters, reactorM, eye, arms, pods };
}
function spawnCore(x, z) {
  const r = buildCore(), cfg = ETYPES.fcore;
  const e = { type: 'fcore', boss: true, fcore: true, cfg, root: r.root, body: r.body, parts: r.parts, shutters: r.shutters, reactorM: r.reactorM, eyeM: r.eye, arms: r.arms,
    glow: dummyGlow(), eyeY: 12.9, coreY: 7.1, yaw: 0, homeYaw: 0, home: V3(x, 0, z), alert: false, canSee: true, canShoot: true, lastSeen: V3(), lostT: 0, fireCd: 0,
    dead: false, stunT: 0, stunned: false, pendingAlert: 0, hitKick: 0, phase: 0, sparkT: 0, moveSpeed: 0,
    bs: { state: 'idle', t: 1, phase: 1, phase2: false, vent: 0, open: 0, started: false, empImmune: 0, shots: 0, fireT: 0,
      cd: { build: 3, slam: 6, mortar: 4, volley: 2, storm: 8, vent: 0, sweep: 0 } } };
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  r.root.position.set(x, 0, z); GS.world.add(r.root); GS.enemies.push(e);
  const mk = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  mk.rotation.x = -Math.PI / 2; mk.position.set(x, 0.05, z); GS.world.add(mk); e.bs.marker = mk;
  return e;
}
const working = q => q && q.attached && q.state !== 'disabled' && q.state !== 'destroyed';
function coreArmsLeft(e) { return ['armA', 'armB', 'armC'].filter(id => working(e.parts[id])).length; }
function coreExposed(e) { return e.bs.vent > 0 || e.bs.state === 'stunned'; }
function coreShell(e) {
  const P = e.parts, pd = [P.podL, P.podR].filter(working); if (!pd.length) return;
  const from = pd[Math.floor(Math.random() * pd.length)].group.getWorldPosition(V3()); from.y += 1;
  const sp = 2.2 + (working(P.head) ? 0 : 3);
  const to = V3(GS.tg.pos.x + GS.tg.vel.x * 0.8 + rand(-sp, sp), 0.03, GS.tg.pos.z + GS.tg.vel.z * 0.8 + rand(-sp, sp));
  const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffb04a })); mesh.scale.set(0.24, 0.24, 0.38); mesh.position.copy(from); GS.world.add(mesh);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.position.copy(to); GS.world.add(marker);
  GS.missiles.push({ mesh, marker, from, to, t: 0, T: 1.3 + from.distanceTo(to) / 42, h: 10 + from.distanceTo(to) * 0.15 });
  spawnFlash(from, 1, 0.08, 0xffb060); SFX.missile();
}
function coreBolt(e) {
  const from = e.eyeM.getWorldPosition(V3());
  const sp = working(e.parts.head) ? 0.03 : 0.12;
  const aim = V3(GS.tg.pos.x + GS.tg.vel.x * 0.35, GS.tg.pos.y + 1.1, GS.tg.pos.z + GS.tg.vel.z * 0.35).sub(from).normalize();
  aim.x += rand(-sp, sp); aim.y += rand(-sp, sp) * 0.5; aim.z += rand(-sp, sp); aim.normalize();
  spawnBossProj(from, aim, 32, 11, 0.24, 0xff6a3a); spawnFlash(from, 0.8, 0.05, 0xff6a3a);
}
function coreBuild(e) {
  const ph = e.bs.phase, kinds = ph === 1 ? (Math.random() < 0.5 ? ['combat', 'combat'] : ['drone', 'drone', 'scout']) : ph === 2 ? ['heavy', 'mite', 'mite', 'mite'] : ['mite', 'mite', 'mite', 'mite', 'drone'];
  kinds.forEach((k, i) => {
    const [gx, gz] = CORE_GATES[i % 2], x = gx + rand(-1.5, 1.5), z = gz + 2;
    let m;
    if (k === 'mite') m = spawnMite(x, z);
    else if (k === 'drone') { m = spawnDrone(x, z, 4.4, { alert: 0.2 }); }
    else { m = spawnEnemy(k, x, z, 0, {}); alertEnemy(m); m.lastSeen.copy(GS.tg.pos); }
    m.minion = true; m.noReward = true;
  });
  for (const [gx, gz] of CORE_GATES) spawnFlash(V3(gx, 3, gz), 3, 0.25, 0xff5a2a);
  SFX.shock();
}
function coreNext(e, dist) {
  const B = e.bs, P = e.parts, ph = B.phase;
  const minions = GS.enemies.filter(o => !o.dead && o.minion).length;
  if (B.cd.build <= 0 && minions < (ph >= 2 ? 7 : 5)) { B.state = 'build'; B.t = 1.2; B.cd.build = ph === 3 ? 10 : ph === 2 ? 13 : 15; addFeed('생산 라인 가동 · 조립 기계 출고', 'k'); return; }
  const opts = [];
  if (B.cd.slam <= 0 && dist < 18) opts.push('slam');
  if (B.cd.mortar <= 0 && (working(P.podL) || working(P.podR))) opts.push('mortar');
  if (B.cd.volley <= 0) opts.push('volley');
  if (ph >= 2 && B.cd.storm <= 0) opts.push('storm');
  if (!opts.length) { B.t = 0.4; return; }
  const pick = opts[Math.floor(Math.random() * opts.length)];
  if (pick === 'slam') { B.state = 'slam_wind'; B.t = 1.0; B.cd.slam = ph === 3 ? 4.5 : 7; }
  else if (pick === 'mortar') { B.state = 'mortar'; B.shots = (working(P.podL) ? 3 : 0) + (working(P.podR) ? 3 : 0) + (ph === 3 ? 2 : 0); B.fireT = 0.3; B.cd.mortar = ph === 3 ? 5 : 7; }
  else if (pick === 'volley') { B.state = 'volley'; B.shots = ph === 3 ? 12 : 8; B.fireT = 0.45; B.cd.volley = ph === 3 ? 4 : 6; }
  else { B.state = 'storm'; B.shots = ph === 3 ? 7 : 5; B.fireT = 0.3; B.cd.storm = ph === 3 ? 7 : 10; addFeed('생산 코어 방전 · 낙뢰 주의', 'k'); }
}
function coreAnim(e, dt) {
  const B = e.bs;
  B.open = lerp(B.open, coreExposed(e) ? 1 : 0, clamp(dt * 5, 0, 1));
  e.shutters.position.y = B.open * 2.5;
  e.arms.rotation.y += dt * (B.phase === 1 ? 0.35 : 0.2);
  const rp = e.parts.reactor;
  if (rp.attached && rp.flash <= 0) e.reactorM.material.emissive.setHex(0x66d8ff).multiplyScalar(B.open > 0.5 ? 1.1 + 0.4 * Math.sin(GS.time * 14) : 0.25);
  if (e.parts.head.attached && e.parts.head.flash <= 0) e.eyeM.material.emissive.setHex(0xff3a1a).multiplyScalar(B.state === 'volley' ? 1.6 : 0.8);
  if (B.state === 'stunned' && Math.random() < 0.3) burstSparks(V3(e.root.position.x + rand(-2, 2), rand(3, 11), e.root.position.z + rand(-2, 2)), UPY, 3, 0x6ac8ff, 4);
}
function updateCore(e, dt) {
  const B = e.bs, P = e.parts, pos = e.root.position;
  partTick(e, dt);
  for (const k in B.cd) B.cd[k] -= dt;
  const dx = GS.tg.pos.x - pos.x, dz = GS.tg.pos.z - pos.z, dist = Math.hypot(dx, dz);
  if (e.pendingAlert > 0) { e.pendingAlert -= dt; if (e.pendingAlert <= 0) e.alert = true; }
  if (!e.alert && dist < 40) e.alert = true;
  if (!e.alert) { coreAnim(e, dt); return; }
  if (!B.started) { B.started = true; B.engageT = GS.time; SFX.roar(); GS.shake = Math.max(GS.shake, 0.02); addFeed('생산 코어 가동 · 최종 목표 교전 개시', 'k'); }
  if (B.phase === 1 && coreArmsLeft(e) === 0) { B.phase = 2; B.phase2 = true; B.cd.vent = 1.5; SFX.roar(); addFeed('조립 팔 전부 파괴 · 냉각구가 주기적으로 열린다', 'x'); popup('냉각구 개방 주기 시작', 'weak'); }
  if (B.phase === 2 && P.reactor.hp < P.reactor.maxHp * 0.35) { B.phase = 3; SFX.roar(); GS.shake = Math.max(GS.shake, 0.03); addFeed('생산 코어 과부하 · 낙뢰와 충격파 강화', 'k'); }
  if (B.vent > 0) { B.vent -= dt; if (B.vent <= 0) { B.cd.vent = B.phase === 3 ? 6 : 8.5; addFeed('냉각구 닫힘', 'k'); } }
  else if (B.phase >= 2 && B.cd.vent <= 0 && B.state !== 'stunned') { B.vent = B.phase === 3 ? 5.5 : 4.5; SFX.shock(); addFeed('냉각구 개방 · 동력로 노출', 'x'); popup('동력로 노출', 'weak'); }
  B.t -= dt;
  const mk = B.marker; mk.material.opacity = 0;
  switch (B.state) {
    case 'idle': if (B.t <= 0) coreNext(e, dist); break;
    case 'stunned': if (B.t <= 0) { B.state = 'idle'; B.t = 0.8; } break;
    case 'build': if (B.t <= 0) { coreBuild(e); B.state = 'idle'; B.t = 0.8; } break;
    case 'mortar': B.fireT -= dt; if (B.fireT <= 0 && B.shots > 0) { B.fireT = 0.22; B.shots--; coreShell(e); } if (B.shots <= 0) { B.state = 'idle'; B.t = 1.0; } break;
    case 'volley': B.fireT -= dt; if (B.fireT <= 0 && B.shots > 0) { B.fireT = 0.14; B.shots--; coreBolt(e); } if (B.shots <= 0) { B.state = 'idle'; B.t = 0.9; } break;
    case 'storm': B.fireT -= dt; if (B.fireT <= 0 && B.shots > 0) { B.fireT = 0.35; B.shots--; const a = rand(0, 6.28), r = B.shots === 0 ? 0 : rand(1, 6); dragonStrike(GS.tg.pos.x + Math.cos(a) * r, GS.tg.pos.z + Math.sin(a) * r); } if (B.shots <= 0) { B.state = 'idle'; B.t = 1; } break;
    case 'slam_wind': {
      mk.scale.setScalar(4); mk.material.opacity = 0.35 + 0.4 * Math.sin(GS.time * 30);
      if (B.t <= 0) {
        spawnShock(pos.x, pos.z); if (B.phase === 3) setTimeout(() => { if (!e.dead && GS.state === 'mission') spawnShock(pos.x, pos.z); }, 700);
        SFX.explode(dist); GS.shake = Math.max(GS.shake, 0.03); spawnFlash(V3(pos.x, 0.5, pos.z), 8, 0.25, 0xffa050);
        B.state = 'idle'; B.t = 1.2;
      }
      break;
    }
  }
  // 조립 팔: 가까이 붙으면 쓸어냄
  const arms = coreArmsLeft(e);
  if (arms > 0 && dist < 11 && B.cd.sweep <= 0) {
    B.cd.sweep = 2.6 - 0.4 * (3 - arms);
    for (const T of dmgTargets()) { const d2 = Math.hypot(T.pos.x - pos.x, T.pos.z - pos.z); if (d2 < 11 && T.pos.y < 3.5) { hurtTarget(T, 18, V3(pos.x, 1, pos.z), 'arm'); knockTarget(T, T.pos.x - pos.x, T.pos.z - pos.z, 12); } }
    SFX.explode(dist); spawnFlash(V3(GS.tg.pos.x, 1, GS.tg.pos.z), 1.5, 0.12, 0xffa050);
  }
  coreAnim(e, dt);
}

export { buildCore, buildFoundry, coreExposed, updateCore };
