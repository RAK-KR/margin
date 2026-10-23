import * as THREE from 'three';
import { GS } from '../core/state.js?v=36';
import { V3, _v1, _v2, clamp, lerp, rand } from '../core/utils.js?v=36';
import { ETYPES, PART_MULT, PART_NAMES, PART_TYPE, PRECISE } from '../data/data.js?v=36';
import { SFX } from '../core/audio.js?v=36';
import { GLOW, scene } from '../core/renderer.js?v=36';
import { addBox, crate, groundAt, hitsBoxXZ } from '../world/world.js?v=36';
import { FX, UPY, blastLight, burstSparks, poolGet, projGeo, spawnFlash } from '../fx/effects.js?v=36';
import { updatePartVisual } from '../enemies/robot.js?v=36';
import { player } from '../player/playerState.js?v=36';
import { addAmmoCrate, addExtraction, setEnv, spawnEnemy } from '../world/missions.js?v=36';
import { partAlive, sensorMult } from '../combat/damage.js?v=36';
import { markerGeo, partTick } from './rex.js?v=36';
import { coopEv, dmgTargets, hurtTarget, isGuest, knockTarget, v3a } from '../modes/coop.js?v=36';
import { killEnemy } from '../meta/achievements.js?v=36';
import { addFeed, popup } from '../ui/hud.js?v=36';

// =====================================================================
//  공중 보스: 청룡 (기계 용)
// =====================================================================
const DR = { segs: 26, gap: 1.55, neck: 1.7, r0: 1.05, r1: 0.32 };
const dragonSegR = i => lerp(DR.r0, DR.r1, Math.pow(i / (DR.segs - 1), 0.85));
const _m4 = new THREE.Matrix4(), _zero = V3();
function faceDir(obj, dir) { if (dir.lengthSq() < 1e-8) return; _m4.lookAt(dir, _zero, UPY); obj.quaternion.setFromRotationMatrix(_m4); }
GS.bolts = [];
function buildDragon() {
  const cfg = ETYPES.dragon, root = new THREE.Group(), parts = {};
  const C = { main: 0x2c6e78, dark: 0x173a40, belly: 0xb6c2a8, gold: 0xd9a441, glow: 0x5ff6ff, eye: 0xffc040 };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function P(id, parent = root, name) {
    const def = cfg.parts[id]; const g = new THREE.Group(); g.name = id; parent.add(g);
    const type = PART_TYPE[id];
    const p = { id, type, name: name || PART_NAMES[id], group: g, meshes: [], maxHp: def.hp, hp: def.hp, brkMax: def.brk || 0, brk: def.brk || 0,
      val: def.val, state: 'intact', precise: !!PRECISE[type], mult: PART_MULT[type], protectedBy: [], flash: 0, attached: true, children: [], enemy: null };
    parts[id] = p; return p;
  }
  function M(p, geo, color, x, y, z, o = {}) {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (o.emissive) mat.emissive.setHex(o.emissive);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
    m.userData = { part: p, hitMult: o.hitMult || 1, exposed: !!o.exposed, sub: o.sub || null, base: new THREE.Color(color), baseE: new THREE.Color(o.emissive || 0) };
    (o.parent || p.group).add(m); p.meshes.push(m); return m;
  }
  // 몸통 마디
  const core = P('core', root, '몸통 장갑'); const segs = [];
  for (let i = 0; i < DR.segs; i++) {
    const r = dragonSegR(i), g = new THREE.Group(); core.group.add(g); segs.push(g);
    M(core, box(r * 1.7, r * 1.5, DR.gap * 1.18), i % 2 ? C.main : 0x2a6670, 0, 0, 0, { parent: g });
    M(core, box(r * 1.25, r * 0.32, DR.gap * 1.0), C.belly, 0, -r * 0.72, 0, { parent: g });
    M(core, box(0.08, r * 0.85, DR.gap * 0.55), C.gold, 0, r * 1.05, -0.1, { parent: g, rx: -0.35 });
    if (i % 3 === 1) for (const sx of [-1, 1]) M(core, box(0.06, r * 0.5, DR.gap * 0.7), C.dark, sx * r * 0.9, r * 0.2, 0, { parent: g, rz: sx * 0.5 });
  }
  core.anchor = segs[12];
  // 동력 마디 3곳 (등)
  for (const [id, si] of [['n1', 6], ['n2', 12], ['n3', 18]]) {
    const p = P(id); p.seg = si; const r = dragonSegR(si);
    // 몸통을 감싸는 동력 고리: 위·아래·옆 어디서든 보임
    M(p, box(r * 2.05, r * 1.85, 0.55), C.dark, 0, 0, 0);
    for (const [x, y, w, h] of [[r * 1.04, 0, 0.06, r * 1.2], [-r * 1.04, 0, 0.06, r * 1.2], [0, -r * 0.94, r * 1.3, 0.06], [0, r * 0.94, r * 1.3, 0.06]])
      M(p, box(w, h, 0.42), 0x003322, x, y, 0, { emissive: C.glow, sub: '동력 셀' });
    const sh = new THREE.Mesh(new THREE.SphereGeometry(r * 1.55, 14, 10), new THREE.MeshBasicMaterial({ color: 0x8af4ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false }));
    p.group.add(sh); p.shieldMesh = sh;
    p.protectedBy.push('pearl');
  }
  core.protectedBy.push('pearl');
  // 발
  for (const [id, si] of [['clawF', 4], ['clawB', 15]]) {
    const p = P(id); p.seg = si; const r = dragonSegR(si);
    for (const sx of [-1, 1]) {
      M(p, box(0.24, 1.0, 0.26), C.main, sx * r * 0.85, -r * 0.95, 0.15, { rz: sx * 0.35, rx: 0.3 });
      M(p, box(0.36, 0.16, 0.5), C.gold, sx * r * 1.15, -r * 1.5, 0.45);
    }
  }
  // 여의주 (앞발이 쥠)
  const pr = P('pearl', parts.clawF.group);
  M(pr, new THREE.SphereGeometry(0.55, 18, 14), 0xdafcff, 0, -dragonSegR(4) * 1.55, 0.95, { emissive: 0x5ad8f0, sub: '여의주' });
  const prGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x8af4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  prGlow.scale.setScalar(2.4); prGlow.position.set(0, -dragonSegR(4) * 1.55, 0.95); pr.group.add(prGlow); pr.glowSprite = prGlow;
  parts.clawF.children.push(pr);
  // 꼬리 지느러미
  const fin = P('fin'); fin.seg = DR.segs - 1;
  for (const a of [-0.55, 0, 0.55]) M(fin, box(0.08, 1.3, 1.7), C.gold, Math.sin(a) * 0.5, 0.1, -1.1, { ry: a, rx: 0.25 });
  // 머리
  const hd = P('head');
  M(hd, box(1.5, 1.1, 2.0), C.main, 0, 0.1, 0.4);
  M(hd, box(1.1, 0.72, 1.6), C.main, 0, 0.0, 2.0);
  M(hd, box(0.5, 0.2, 2.6), C.gold, 0, 0.5, 1.3);
  M(hd, box(0.9, 0.3, 0.3), C.dark, 0, -0.1, 2.85);
  for (const sx of [-1, 1]) {
    M(hd, box(0.24, 0.2, 0.42), 0x221100, sx * 0.66, 0.38, 1.2, { emissive: C.eye, hitMult: 1.6, exposed: true, sub: '광학 센서' });
    M(hd, box(0.05, 0.05, 2.8), C.gold, sx * 0.85, -0.1, 1.2, { ry: sx * 0.55, rx: 0.15 });          // 수염
    M(hd, box(0.05, 0.05, 2.0), C.gold, sx * 0.7, -0.35, 1.6, { ry: sx * 0.35, rx: -0.25 });
  }
  for (let k = 0; k < 5; k++) M(hd, box(0.1, 0.7 - k * 0.08, 0.32), C.gold, (k % 2 ? 0.25 : -0.25), 0.55, -0.4 - k * 0.32, { rx: -0.9 });   // 갈기
  const jw = P('jaw', hd.group); jw.group.position.set(0, -0.3, 1.3);
  M(jw, box(1.0, 0.32, 1.8), C.main, 0, -0.08, 0.85);
  for (let k = 0; k < 4; k++) for (const sx of [-0.38, 0.38]) M(jw, box(0.09, 0.2, 0.1), 0xe8e2d0, sx, 0.15, 0.3 + k * 0.38);
  M(jw, box(0.2, 0.7, 0.5), C.gold, 0, -0.5, 0.5, { rx: 0.4 });
  hd.children.push(jw);
  for (const side of [1, -1]) {
    const h = P(side > 0 ? 'hornL' : 'hornR', hd.group); h.group.position.set(side * 0.48, 0.62, 0.0);
    M(h, box(0.14, 0.14, 1.7), C.gold, side * 0.15, 0.45, -0.55, { rx: 0.65, ry: side * -0.25 });
    M(h, box(0.1, 0.1, 0.8), C.gold, side * 0.3, 0.75, -0.25, { rx: -0.2, ry: side * 0.6 });
    M(h, box(0.1, 0.1, 0.7), C.gold, side * 0.08, 1.0, -1.05, { rx: 1.1 });
    hd.children.push(h);
  }
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.2, 3.0); hd.group.add(mouth);
  const mglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x8af4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  mglow.scale.setScalar(2.2); mouth.add(mglow);
  return { root, parts, segs, mouth, mglow };
}
// 머리 위치 + 마디 위치 배열(월드)로 자세 적용
function applyDragonPose(d, head, hdir, pts) {
  d.root.position.copy(head);
  const P = d.parts;
  if (P.head.attached) { P.head.group.position.set(0, 0, 0); faceDir(P.head.group, hdir); }
  for (let i = 0; i < d.segs.length; i++) {
    const g = d.segs[i]; g.position.copy(pts[i]).sub(head);
    _v1.copy(i ? pts[i - 1] : head).sub(pts[i]); faceDir(g, _v1);
  }
  for (const id of ['n1', 'n2', 'n3', 'clawF', 'clawB', 'fin']) {
    const p = P[id]; if (!p.attached) continue;
    const g = d.segs[p.seg]; p.group.position.copy(g.position); p.group.quaternion.copy(g.quaternion);
  }
}
// 이동 궤적을 따라 마디 배치
function dragonChain(e) {
  const tr = e.trail, out = e.segPts, need = DR.neck + DR.gap * DR.segs;
  let acc = 0, k = 0, target = DR.neck, prev = e.headPos;
  for (let i = 0; i < tr.length && k < DR.segs; i++) {
    const cur = tr[i]; const L = prev.distanceTo(cur);
    while (k < DR.segs && acc + L >= target) { const u = L > 1e-6 ? (target - acc) / L : 0; out[k].lerpVectors(prev, cur, u); k++; target += DR.gap; }
    acc += L; prev = cur;
  }
  while (k < DR.segs) { out[k].copy(k ? out[k - 1] : e.headPos); out[k].y -= 0.01; k++; }
  // 오래된 궤적 정리
  let len = 0, p2 = e.headPos;
  for (let i = 0; i < tr.length; i++) { len += p2.distanceTo(tr[i]); p2 = tr[i]; if (len > need + 4) { tr.length = i + 1; break; } }
}
function spawnDragon(x, y, z) {
  const d = buildDragon(), cfg = ETYPES.dragon;
  const e = { type: 'dragon', boss: true, dragon: true, cfg, root: d.root, body: d.root, parts: d.parts, segs: d.segs, mouth: d.mouth, mglow: d.mglow,
    glow: { material: { opacity: 0 } }, eyeY: 0, coreY: 0, yaw: 0, home: V3(0, 0, 0), alert: false, canSee: true, canShoot: true, lastSeen: V3(),
    dead: false, stunT: 0, stunned: false, pendingAlert: 0, hitKick: 0, phase: 0, sparkT: 0,
    headPos: V3(x, y, z), headDir: V3(1, 0, 0), speed: 11, trail: [], segPts: Array.from({ length: DR.segs }, () => V3()),
    bs: { state: 'cruise', t: 3, cd: { breath: 2, storm: 4, dive: 7, barrage: 6 }, ang: Math.atan2(z, x), started: false, phase2: false, empImmune: 0 } };
  // 시작 궤적: 원을 따라 뒤로 늘어뜨림
  for (let i = 1; i < 120; i++) { const a = e.bs.ang - i * 0.025; e.trail.push(V3(Math.cos(a) * 24, y + Math.sin(a * 2) * 2, Math.sin(a) * 24)); }
  e.headPos.copy(e.trail[0]).add(V3(-Math.sin(e.bs.ang), 0, Math.cos(e.bs.ang)).multiplyScalar(0.6));
  e.trail.unshift(e.headPos.clone());
  for (const p of Object.values(e.parts)) { p.enemy = e; GS.hittables.push(...p.meshes); }
  dragonChain(e); applyDragonPose(e, e.headPos, e.headDir.set(-Math.sin(e.bs.ang), 0, Math.cos(e.bs.ang)), e.segPts);
  const mk = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  mk.rotation.x = -Math.PI / 2; GS.world.add(mk); e.bs.marker = mk;
  GS.world.add(d.root); GS.enemies.push(e);
  return e;
}
const DRAGON_OPEN = { breath_wind: 1, breath: 1, storm_wind: 1, barrage_wind: 1, barrage: 1, dive: 1, skim: 1, downed: 1, dazed: 1, crash: 1 };
function dragonNodesOpen(e) { return !!DRAGON_OPEN[e.bs.state]; }
function dragonNodesDown(e) { return ['n1', 'n2', 'n3'].filter(id => { const p = e.parts[id]; return !p.attached || p.state === 'disabled' || p.state === 'destroyed'; }).length; }
function dragonWorking(e, id) { const p = e.parts[id]; return p && p.attached && p.state !== 'destroyed' && p.state !== 'disabled'; }
function dragonNodeEvent(e, p) {
  const k = dragonNodesDown(e);
  if (p.shieldMesh) p.shieldMesh.visible = false;
  addFeed(`청룡 동력 마디 정지 · ${k} / 3`, 'd'); popup(`동력 마디 ${k} / 3`, 'weak');
  if (k >= 3) dragonDown(e, 'shutdown');
  else if (e.bs.state === 'cruise' || e.bs.state === 'storm_wind') { e.bs.state = 'dazed'; e.bs.t = 1.4; }
}
function dragonDown(e, cause) {
  const B = e.bs; if (B.state === 'crash' || e.dead) return;
  B.state = 'crash'; B.t = 3.0; B.crashCause = cause; e.mglow.material.opacity = 0;
  SFX.dragonRoar(); GS.shake = Math.max(GS.shake, 0.02);
  addFeed('청룡 추락', 'k');
}
function dragonStrike(x, z, col = 0x8af4ff) {
  coopEv({ t: 'bolt', x, z });
  const mk = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  const gy = groundAt(x, z, 0.1, 10, 0) ; mk.rotation.x = -Math.PI / 2; mk.position.set(x, gy + 0.04, z); GS.world.add(mk);
  GS.bolts.push({ x, z, y: gy, t: 1.35, mk, hit: false, col });
}
function updateBolts(dt) {
  for (let i = GS.bolts.length - 1; i >= 0; i--) {
    const b = GS.bolts[i]; b.t -= dt;
    if (b.t > 0) { b.mk.material.opacity = 0.35 + 0.45 * (1 - b.t / 1.35) + 0.15 * Math.sin(GS.time * 30); b.mk.scale.setScalar(0.85 + 0.15 * (b.t / 1.35)); continue; }
    if (!b.hit) {
      b.hit = true;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 44, 6, 1, true), new THREE.MeshBasicMaterial({ color: b.col && b.col !== 0x8af4ff ? b.col : 0xdafcff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.set(b.x, b.y + 22, b.z); GS.world.add(beam); b.beam = beam;
      _v1.set(b.x, b.y + 0.3, b.z); spawnFlash(_v1, 5, 0.25, 0xbaf8ff); burstSparks(_v1, UPY, 22, 0x9af0ff, 9);
      blastLight.color.setHex(0xaaf0ff); blastLight.position.copy(_v1); blastLight.intensity = 90;
      SFX.thunder(_v1.distanceTo(player.pos));
      const d = Math.hypot(player.pos.x - b.x, player.pos.z - b.z);
      if (!isGuest()) for (const T of dmgTargets()) { const td = Math.hypot(T.pos.x - b.x, T.pos.z - b.z); if (td < 2.6 && Math.abs(T.pos.y - b.y) < 3) hurtTarget(T, 30, _v1.clone(), 'lightning'); }
      GS.shake = Math.max(GS.shake, d < 10 ? 0.012 : 0.004);
    }
    if (b.beam) { b.beam.material.opacity = Math.max(0, 0.95 + b.t * 5); b.beam.scale.x = b.beam.scale.z = 1 + Math.sin(GS.time * 90) * 0.4; }
    if (b.t < -0.2) { GS.world.remove(b.mk); if (b.beam) GS.world.remove(b.beam); blastLight.color.setHex(0xff9040); GS.bolts.splice(i, 1); }
  }
}
function spawnBossProj(from, dir, speed, dmg, size, color) {
  const pr = poolGet(FX.projs, 80, () => { const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(mesh); return { mesh, vel: V3(), prev: V3() }; });
  pr.alive = true; pr.life = 3; pr.dmg = dmg; pr.src = null;
  pr.mesh.visible = true; pr.mesh.material.color.setHex(color);
  pr.mesh.position.copy(from); pr.vel.copy(dir).multiplyScalar(speed);
  pr.mesh.scale.set(size, size, size * 2.2); pr.mesh.lookAt(_v1.copy(from).add(dir));
  coopEv({ t: 'eshot', f: v3a(from), d: v3a(dir), s: speed, c: color, z: size, k: 'dragon' });
}
function updateDragon(e, dt) {
  const B = e.bs, cfg = e.cfg, P = e.parts;
  partTick(e, dt);
  for (const k in B.cd) B.cd[k] -= dt;
  const pp = V3(GS.tg.pos.x, GS.tg.pos.y + 1.2, GS.tg.pos.z);
  const toP = pp.clone().sub(e.headPos), distP = toP.length();
  if (e.pendingAlert > 0) { e.pendingAlert -= dt; if (e.pendingAlert <= 0) { e.pendingAlert = 0; e.alert = true; } }
  if (!e.alert && Math.hypot(toP.x, toP.z) < 60) e.alert = true;
  if (e.alert && !B.started) { B.started = true; B.engageT = GS.time; SFX.dragonRoar(); addFeed('청룡 기동 · 최종 목표 교전 개시', 'k'); }
  // 2페이즈
  const nodeHp = ['n1', 'n2', 'n3'].reduce((a, id) => a + (P[id].state === 'disabled' || P[id].state === 'destroyed' || !P[id].attached ? 0 : P[id].hp), 0);
  if (!B.phase2 && B.started && (P.core.hp < P.core.maxHp * 0.55 || nodeHp < 3 * P.n1.maxHp * 0.55)) {
    B.phase2 = true; SFX.dragonRoar(); addFeed('청룡 폭주 · 비행 속도와 낙뢰 강화 · 정찰형 증원', 'k');
    for (const [x, z] of [[-34, -34], [34, -34]]) { const s2 = spawnEnemy('scout', x, z, 0); s2.pendingAlert = 0.8; s2.home.set(x * 0.5, 0, z * 0.5); }
  }
  if (e.stunT > 0 && B.state !== 'crash') { B.state = 'dazed'; B.t = e.stunT; e.stunT = 0; B.wasDazed = true; }
  // 여의주 보호막 표시
  const shieldOn = partAlive(P.pearl), open = dragonNodesOpen(e);
  for (const id of ['n1', 'n2', 'n3']) { const q = P[id]; if (!q.attached || q.state === 'disabled' || q.state === 'destroyed' || q.flash > 0) continue;
    for (const m of q.meshes) if (m.userData.sub) m.material.emissive.setHex(0x5ff6ff).multiplyScalar(open ? 1.0 + 0.4 * Math.sin(GS.time * 14) : 0.12); }
  for (const id of ['n1', 'n2', 'n3']) if (P[id].shieldMesh) P[id].shieldMesh.visible = shieldOn && P[id].attached && P[id].state !== 'disabled' && P[id].state !== 'destroyed';
  if (P.pearl.glowSprite) P.pearl.glowSprite.material.opacity = shieldOn ? 0.55 + 0.25 * Math.sin(GS.time * 4) : 0;
  if (!B.berserk && !dragonWorking(e, 'head')) {
    B.berserk = true; SFX.dragonRoar(); addFeed('청룡 머리 파손 · 폭주 · 몸통 마디 탄막 강화', 'k'); popup('청룡 폭주', 'bad');
    B.cd.barrage = Math.min(B.cd.barrage, 1.5);
  }
  const fast = (B.phase2 ? 1.22 : 1) * (B.berserk ? 1.12 : 1) * (dragonWorking(e, 'fin') ? 1 : 0.8) * (1 - 0.12 * dragonNodesDown(e));
  let T = null, spd = 11 * fast, turn = 1.5 * (dragonWorking(e, 'fin') ? 1 : 0.7);
  const hp = e.headPos;
  B.t -= dt; B.markerA = 0;
  const pick = () => {
    const opts = [];
    if (dragonWorking(e, 'jaw') && B.cd.breath <= 0 && distP < 34) opts.push('breath');
    if (B.cd.storm <= 0) opts.push('storm');
    if (B.cd.dive <= 0) opts.push('dive');
    // 마디 탄막: 머리와 무관하게 몸통 동력 마디에서 발사. 머리를 잃으면 폭주해 더 자주 쓴다
    if (B.cd.barrage <= 0 && dragonNodesDown(e) < 3) { opts.push('barrage'); if (B.berserk) opts.push('barrage'); }
    if (!opts.length) { B.state = 'cruise'; B.t = rand(0.8, 1.5); return; }
    const s = opts[Math.floor(Math.random() * opts.length)];
    if (s === 'breath') { B.state = 'breath_wind'; B.t = 1.0; }
    else if (s === 'storm') { B.state = 'storm_wind'; B.t = 0.9; }
    else if (s === 'barrage') { B.state = 'barrage_wind'; B.t = 0.9; B.volley = 0; SFX.shock(); }
    else { B.state = 'dive_wind'; B.t = 1.3; B.secondDive = false; }
  };
  switch (B.state) {
    case 'cruise': {
      const R = 23, alt = 13;
      B.ang += (spd / R) * dt;
      T = V3(Math.cos(B.ang + 0.35) * R, alt + Math.sin(B.ang * 2) * 2.5, Math.sin(B.ang + 0.35) * R);
      if (B.t <= 0 && B.started) pick();
      break;
    }
    case 'dazed':
      T = hp.clone().add(e.headDir.clone().multiplyScalar(6)); T.y = Math.max(8, hp.y - 1); T.x += Math.sin(GS.time * 9) * 2;
      spd *= 0.55; if (B.t <= 0) { B.state = 'cruise'; B.t = 1; }
      break;
    case 'breath_wind': case 'breath': {
      const side = V3(-toP.z, 0, toP.x).normalize().multiplyScalar(Math.sin(B.ang) > 0 ? 1 : -1);
      T = pp.clone().add(toP.clone().setY(0).normalize().multiplyScalar(-19)).add(side.multiplyScalar(4)); T.y = 9.5;
      spd = B.state === 'breath' ? 4.5 : 8; turn = 2.6;
      e.mglow.material.opacity = B.state === 'breath_wind' ? 0.4 + 0.5 * (1 - Math.max(0, B.t)) : 0.95;
      if (B.state === 'breath_wind' && B.t <= 0) { B.state = 'breath'; B.t = B.phase2 ? 1.7 : 1.3; B.fireT = 0; SFX.breath(); }
      if (B.state === 'breath') {
        B.fireT -= dt;
        if (B.fireT <= 0) {
          B.fireT = 0.085;
          e.mouth.getWorldPosition(_v2);
          const aim = pp.clone().addScaledVector(GS.tg.vel, 0.35).sub(_v2).normalize();
          const sp = 0.06 * sensorMult(e);
          aim.add(V3(rand(-sp, sp), rand(-sp, sp), rand(-sp, sp))).normalize();
          spawnBossProj(_v2, aim, 40, 12, 0.22, 0x8af4ff);
        }
        if (B.t <= 0) { B.state = 'cruise'; B.t = rand(0.5, 1.1); B.cd.breath = B.phase2 ? 3.5 : 5; e.mglow.material.opacity = 0; }
      }
      break;
    }
    case 'storm_wind': {
      const R = 23; B.ang += (spd / R) * dt; T = V3(Math.cos(B.ang + 0.35) * R, 14, Math.sin(B.ang + 0.35) * R);
      for (const id of ['hornL', 'hornR']) if (dragonWorking(e, id)) for (const m of P[id].meshes) m.material.emissive.setRGB(0.4 + 0.4 * Math.sin(GS.time * 30), 0.8, 1);
      if (B.t <= 0) {
        const horns = ['hornL', 'hornR'].filter(id => dragonWorking(e, id)).length;
        const n = (horns ? 1 + horns * 2 : 2) + (B.phase2 ? 3 : 0);
        dragonStrike(GS.tg.pos.x + GS.tg.vel.x * 0.5, GS.tg.pos.z + GS.tg.vel.z * 0.5);
        for (let i = 1; i < n; i++) { const a = rand(0, Math.PI * 2), r = rand(3, 9); dragonStrike(GS.tg.pos.x + Math.cos(a) * r, GS.tg.pos.z + Math.sin(a) * r); }
        for (const id of ['hornL', 'hornR']) if (P[id].attached) updatePartVisual(P[id]);
        SFX.emp(); B.state = 'cruise'; B.t = rand(0.5, 1.1); B.cd.storm = (B.phase2 ? 3.6 : 5.5) * (horns ? 1 : 1.4);
      }
      break;
    }
    case 'barrage_wind': case 'barrage': {
      const R = 21; B.ang += (spd * 0.7 / R) * dt; T = V3(Math.cos(B.ang + 0.35) * R, 11, Math.sin(B.ang + 0.35) * R);
      const live = ['n1', 'n2', 'n3'].filter(id => dragonWorking(e, id));
      if (B.state === 'barrage_wind') {
        for (const id of live) if (Math.random() < 0.5) { P[id].meshes[0].getWorldPosition(_v1); burstSparks(_v1, UPY, 1, 0x5ff6ff, 3); }
        if (B.t <= 0) { B.state = 'barrage'; B.t = B.phase2 || B.berserk ? 1.6 : 1.2; B.fireT = 0; }
        break;
      }
      B.fireT -= dt;
      if (B.fireT <= 0) {
        B.fireT = B.berserk ? 0.16 : 0.22;
        for (const id of live) {
          P[id].meshes[0].getWorldPosition(_v2);
          const aim = pp.clone().addScaledVector(GS.tg.vel, 0.3).sub(_v2).normalize();
          const sp = 0.05; aim.add(V3(rand(-sp, sp), rand(-sp, sp), rand(-sp, sp))).normalize();
          spawnBossProj(_v2, aim, 30, 8, 0.2, 0x5ff6ff);
        }
        SFX.eshot('combat', hp.distanceTo(pp));
      }
      if (B.t <= 0) { B.state = 'cruise'; B.t = rand(0.5, 1.1); B.cd.barrage = (B.phase2 ? 5 : 7) * (B.berserk ? 0.55 : 1); }
      break;
    }
    case 'dive_wind':
      T = hp.clone().add(e.headDir.clone().setY(0).normalize().multiplyScalar(8)); T.y = 18; spd = 9;
      B.aim = pp.clone().addScaledVector(GS.tg.vel, 0.4); B.aim.y = 1.8;
      B.markerA = 0.25 + 0.3 * (1 - Math.max(0, B.t) / 1.3);
      if (B.t <= 0) { B.state = 'dive'; B.t = 3; B.hitDone = false; B.hitBy = new Set(); SFX.dragonRoar(); }
      break;
    case 'dive':
      T = B.aim.clone(); spd = 25 * (B.phase2 ? 1.1 : 1); turn = 2.6;
      B.markerA = 0.6;
      if (hp.y < 3 || hp.distanceTo(B.aim) < 3 || B.t <= 0) { B.state = 'skim'; B.t = B.phase2 ? 2.2 : 2.8; B.skimDir = e.headDir.clone().setY(0).normalize(); }
      break;
    case 'skim': {
      if (!B.skimDir) B.skimDir = e.headDir.clone().setY(0).normalize();
      T = hp.clone().addScaledVector(B.skimDir, 10); T.y = 1.9; spd = 15 * fast; turn = 0.8;
      const ahead = hp.clone().addScaledVector(B.skimDir, 5);
      const blocked = GS.boxes.some(b => b.maxY > 2.2 && hitsBoxXZ(b, ahead.x, ahead.z, 1.6)) || Math.hypot(ahead.x, ahead.z) > 33;
      if (B.t <= 0 || blocked) { B.state = 'climb'; B.t = 1.6; }
      break;
    }
    case 'climb':
      T = hp.clone().add(e.headDir.clone().setY(0).normalize().multiplyScalar(8)); T.y = 14; spd = 12; turn = 1.8;
      if (Math.hypot(T.x, T.z) > 28) T.multiplyScalar(0.7);
      if (B.t <= 0) { if (GS.HARD && !B.secondDive && B.started) { B.secondDive = true; B.state = 'dive_wind'; B.t = 0.9; addFeed('청룡 연속 강하', 'k'); } else { B.state = 'cruise'; B.t = rand(0.5, 1.1); B.cd.dive = B.phase2 ? 5 : 7; B.ang = Math.atan2(hp.z, hp.x) - 0.35; } }
      break;
    case 'downed':
      T = hp.clone().add(e.headDir.clone().setY(0).normalize().multiplyScalar(5)); T.y = 1.1; spd = 5; turn = 0.6;
      if (Math.random() < 0.3) { e.parts.head.meshes[0].getWorldPosition(_v1); burstSparks(_v1, UPY, 2, 0x6ac8ff, 3); }
      if (B.t <= 0) { B.state = 'climb'; B.t = 1.8; }
      break;
    case 'crash': {
      const c = V3(-hp.x, 0, -hp.z).normalize();
      T = hp.clone().add(e.headDir.clone().setY(0).normalize().multiplyScalar(6).add(c.multiplyScalar(2))); T.y = 0.9; spd = 15; turn = 1.4;
      if (Math.random() < 0.5) { const s = e.segPts[Math.floor(Math.random() * DR.segs)]; burstSparks(s, UPY, 3, 0xffa040, 5); }
      if (B.t <= 0) {
        const cause = B.crashCause === 'core' ? 'core' : 'shutdown';
        if (cause === 'core') for (let i = 0; i < DR.segs; i += 4) { spawnFlash(e.segPts[i], 3.5, 0.3, 0xffa050); burstSparks(e.segPts[i], UPY, 14, 0xffa040, 8); }
        killEnemy(e, cause); return;
      }
      break;
    }
  }
  // 경계 / 고도 제한
  if (T) {
    const rr = Math.hypot(T.x, T.z); if (rr > 30 && B.state !== 'crash') { T.x *= 30 / rr; T.z *= 30 / rr; }
    T.y = clamp(T.y, 0.9, 24);
    const want = T.sub(hp); const wl = want.length();
    if (wl > 0.01) {
      want.divideScalar(wl);
      const ang = e.headDir.angleTo(want), mx = turn * dt;
      if (ang > 1e-4) e.headDir.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(e.headDir, want).slerp(new THREE.Quaternion(), 1 - Math.min(1, mx / ang))).normalize();
    }
  }
  if (Math.hypot(hp.x, hp.z) > 34) { const back = V3(-hp.x, 0, -hp.z).normalize(); e.headDir.lerp(back, 0.08).normalize(); }
  hp.addScaledVector(e.headDir, spd * dt);
  hp.y = Math.max(0.9, hp.y);
  if (!e.trail.length || e.trail[0].distanceTo(hp) > 0.2) e.trail.unshift(hp.clone());
  dragonChain(e);
  // 몸통의 물결
  const wv = B.state === 'crash' || B.state === 'downed' ? 0 : 1;
  for (let i = 0; i < DR.segs; i++) e.segPts[i].y += Math.sin(GS.time * 2.4 - i * 0.45) * 0.25 * wv * Math.min(1, i / 4);
  applyDragonPose(e, hp, e.headDir, e.segPts);
  // 턱 / 눈
  if (P.jaw.attached) P.jaw.group.rotation.x = lerp(P.jaw.group.rotation.x, (B.state === 'breath' || B.state === 'breath_wind' || B.state === 'dive') ? 0.5 : 0.08 + Math.sin(GS.time * 1.3) * 0.04, Math.min(1, dt * 8));
  // 강하 경로 표시
  const mk = B.marker;
  if (B.markerA > 0 && B.aim) {
    const a0 = V3(hp.x, 0.05, hp.z), a1 = V3(B.aim.x, 0.05, B.aim.z), dd = a1.clone().sub(a0); const L = dd.length() + 14;
    dd.normalize(); mk.position.copy(a0).addScaledVector(dd, L / 2); mk.scale.set(1, L, 1); mk.rotation.set(-Math.PI / 2, 0, -Math.atan2(dd.x, dd.z) + Math.PI);
    mk.material.opacity = B.markerA * (0.7 + 0.3 * Math.sin(GS.time * 30));
  } else mk.material.opacity = 0;
  // 강하 · 저공 비행 충돌 피해
  if (B.state === 'dive' || B.state === 'skim') {
    B.hitBy = B.hitBy || new Set();
    for (const T of dmgTargets()) {
      if (B.hitBy.has(T)) continue;
      const tp = V3(T.pos.x, T.pos.y + 1.2, T.pos.z); let near = hp.distanceTo(tp);
      for (let i = 0; i < 5; i++) near = Math.min(near, e.segPts[i].distanceTo(tp));
      if (near < 3.0) { B.hitBy.add(T); B.hitDone = true; hurtTarget(T, dragonWorking(e, 'clawB') ? 44 : 27, hp.clone(), 'dive'); knockTarget(T, T.pos.x - hp.x, T.pos.z - hp.z, 10); }
    }
  }
}
// 거점 전시용: 공중에서 S자로 굽이치는 자세 (화면 가로로 몸통이 펼쳐짐)
function dragonCoilPose(d, cx, cz, t, cy = 0) {
  const pts = [], head = V3(cx - 2.6, 4.6 + cy + Math.sin(t * 1.1) * 0.25, cz - 1.4);
  const dir = V3(0.99, 0, -0.16).normalize(), perp = V3(0.16, 0, 0.99);
  const at = s => { const k = Math.min(1, s / 5);
    return head.clone().addScaledVector(dir, s).addScaledVector(perp, Math.sin(s * 0.24 - t * 1.5) * 1.8 * k)
      .add(V3(0, Math.sin(s * 0.3 - t * 1.9 + 1) * 1.7 * k - s * 0.025, 0)); };
  for (let i = 0; i < DR.segs; i++) pts.push(at(DR.neck + i * DR.gap));
  const hdir = V3(-0.95, -0.12, 0.3).normalize();
  applyDragonPose(d, head, hdir, pts);
}
function buildShrine() {
  setEnv({ sky: 0x6f7f84, fog: [45, 170], hemi: [0xdfe6e0, 0x3a3630, 1.5], sun: [0xffd8a8, 2.0, [-40, 45, 20]],
    ground: '#5e5b54', groundLine: 'rgba(30,28,24,.28)', size: [84, 84] });
  const W = 0x4c4a45, S = 0x76726a, R = 0x5a3a30;
  addBox(0, -42, 86, 2, 3, W); addBox(0, 42, 86, 2, 3, W); addBox(-42, 0, 2, 86, 3, W); addBox(42, 0, 2, 86, 3, W);
  // 중앙 탑
  addBox(0, 0, 7, 7, 1.2, S); addBox(0, 0, 4.4, 4.4, 3.2, 0x8a6a52, 1.2); addBox(0, 0, 7.6, 7.6, 0.45, R, 4.4);
  addBox(0, 0, 3.2, 3.2, 2.6, 0x8a6a52, 4.85); addBox(0, 0, 5.8, 5.8, 0.4, R, 7.45); addBox(0, 0, 0.5, 0.5, 2.4, 0xd9a441, 7.85);
  // 석등 기둥
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39, r = 17; addBox(Math.cos(a) * r, Math.sin(a) * r, 1.6, 1.6, 5.5, S); addBox(Math.cos(a) * r, Math.sin(a) * r, 2.4, 2.4, 0.4, R, 5.5); }
  // 무너진 담장 (엄폐)
  for (const [x, z, w, d] of [[-9, 22, 6, 0.8], [9, 22, 6, 0.8], [-26, 8, 0.8, 6], [26, 8, 0.8, 6], [-26, -10, 0.8, 6], [26, -12, 0.8, 6], [-10, -26, 6, 0.8], [10, -26, 6, 0.8], [0, 13, 4, 0.8], [-13, -4, 0.8, 4], [13, -4, 0.8, 4]])
    addBox(x, z, w, d, 2.4, W);
  for (const [x, z, w, d] of [[-5, 28, 3, 0.6], [5, 28, 3, 0.6], [-20, 20, 0.6, 3], [20, 20, 0.6, 3], [-20, -22, 0.6, 3], [20, -22, 0.6, 3]]) addBox(x, z, w, d, 1.1, S);
  for (const [x, z, st] of [[-30, 28, 1], [30, 28, 0], [-31, -30, 1], [31, -29, 1], [-6, -14, 0], [7, -15, 1]]) { crate(x, z, 0x6a5a40); if (st) crate(x, z, 0x5c4e38, 1.2, 1.2); }
  // 구름
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8ecea, transparent: true, opacity: 0.35, depthWrite: false }));
    c.scale.set(rand(10, 22), rand(2, 4), rand(8, 16)); c.position.set(rand(-80, 80), rand(34, 48), rand(-80, 80)); GS.world.add(c);
  }
  addExtraction(0, 34);
  addAmmoCrate(-5, 36, true); addAmmoCrate(5, 36, true); addAmmoCrate(-36, 0, true); addAmmoCrate(36, 0, true);
  spawnDragon(-20, 13, -12);
  return { spawn: V3(0, 0, 31), yaw: 0 };
}

export { DR, applyDragonPose, buildDragon, buildShrine, dragonCoilPose, dragonDown, dragonNodeEvent, dragonNodesOpen, dragonStrike, spawnBossProj, spawnDragon, updateBolts, updateDragon };
