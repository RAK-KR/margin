import * as THREE from 'three';
import { GS } from '../core/state.js?v=30';
import { $, V3, _v1, _v2, angDiff, clamp, fmt, lerp, rand } from '../core/utils.js?v=30';
import { MISSIONS, STATE_KO, UK } from '../data/data.js?v=30';
import { SFX } from '../core/audio.js?v=30';
import { camera, scene } from '../core/renderer.js?v=30';
import { removeHittables } from '../world/world.js?v=30';
import { FX, UPY, blastLight, burstSparks, poolGet, projGeo, spawnDebris, spawnFlash, spawnTracer } from '../fx/effects.js?v=30';
import { updatePartVisual } from '../enemies/robot.js?v=30';
import { EYE, P_HEIGHT, curWeapon, player, raycaster } from '../player/playerState.js?v=30';
import { damagePlayer } from '../player/player.js?v=30';
import { spawnEnemy, startMission } from '../world/missions.js?v=30';
import { kd } from '../player/input.js?v=30';
import { launchThrowable } from '../combat/shooting.js?v=30';
import { detachPart, hitPart, partAlive, shatter } from '../combat/damage.js?v=30';
import { animateLegs } from '../enemies/ai.js?v=30';
import { animateRex, knockPlayer, markerGeo, partTick, shockGeo, spawnShock } from '../bosses/rex.js?v=30';
import { DR, applyDragonPose, dragonNodesOpen, dragonStrike } from '../bosses/dragon.js?v=30';
import { _box3, spawnDrone } from '../enemies/extra.js?v=30';
import { animateMite, legIK, spawnMite, spiderExposed } from '../bosses/spider.js?v=30';
import { extremeUnlocked, hardUnlocked } from './difficulty.js?v=30';
import { achEvent, killEnemy } from '../meta/achievements.js?v=30';
import { bagRoom, lootBeamGeo, lootRingGeo } from '../game/loot.js?v=30';
import { addFeed, popup, showHitmarker } from '../ui/hud.js?v=30';
import { endMission } from '../game/result.js?v=30';
import { renderHub } from '../ui/hub.js?v=30';

// =====================================================================
//  협동 모드 (2인 · 방장 권위 방식)
//  방장: 실제 게임 판정 전부 · 친구: 자기 이동/사격 입력을 보내고 방장이 보낸 상태를 그림
// =====================================================================
const COOP_BUILD = 'coop-3';
const COOP_MISSIONS = ['C', 'F', 'D', 'G'];
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NET = { role: null, peer: null, conn: null, code: '', status: 'off', err: '', inGame: false, rp: null, av: null,
  sendT: 0, fullT: 0, evq: [], outq: [], claims: [], partner: '', step: '', lastRecv: 0, remoteShot: false, remoteOc: false, mute: false, revT: 0 };
const isHost = () => NET.inGame && NET.role === 'host';
const isGuest = () => NET.inGame && NET.role === 'guest';
const coopOn = () => NET.inGame;
GS.tg = player;   // 지금 AI가 노리는 대상 (로컬 플레이어 또는 원격 플레이어 프록시)

function peerOpts() {
  const q = new URLSearchParams(location.search).get('peerhost');
  if (!q) return { debug: 0 };
  const [h, p] = q.split(':'); return { host: h, port: +p, path: '/', secure: false, debug: 0, config: { iceServers: [] } };
}
function loadPeerJs() {
  return new Promise((res, rej) => {
    if (window.Peer) return res();
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = () => window.Peer ? res() : rej(new Error('peer')); s.onerror = () => rej(new Error('load')); document.head.appendChild(s);
  });
}
function coopReset() {
  try { if (NET.conn) NET.conn.close(); } catch (e) { }
  try { if (NET.peer) NET.peer.destroy(); } catch (e) { }
  Object.assign(NET, { role: null, peer: null, conn: null, code: '', status: 'off', err: '', inGame: false, rp: null, evq: [], outq: [], partner: '' });
}
function coopFail(msg) { const r = NET.role; coopReset(); NET.err = msg; if (GS.state === 'hub') { GS.hubModal = 'coop'; renderHub(); } }
async function coopHost() {
  coopReset(); NET.role = 'host'; NET.status = 'starting'; renderHub();
  try { await loadPeerJs(); } catch (e) { return coopFail('네트워크 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  const open = (n) => {
    NET.code = Array.from({ length: 4 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
    const peer = new window.Peer('margin-coop-' + NET.code, peerOpts()); NET.peer = peer;
    peer.on('open', () => { NET.status = 'waiting'; if (GS.state === 'hub') renderHub(); });
    peer.on('connection', conn => {
      if (NET.conn && NET.conn.open && NET.status === 'connected') { try { conn.close(); } catch (e) { } return; }
      if (NET.conn) { const old = NET.conn; NET.conn = null; try { old.close(); } catch (e) { } }
      NET.err = ''; coopBind(conn);
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && n < 5) { try { peer.destroy(); } catch (e) { } open(n + 1); }
      else if (NET.status !== 'connected') coopFail('방을 만들지 못했습니다 (' + err.type + '). 잠시 후 다시 시도해 주세요.');
    });
    peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { } });
  };
  open(0);
}
async function coopJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { NET.err = '방 코드 4자리를 입력해 주세요.'; renderHub(); return; }
  coopReset(); NET.role = 'guest'; NET.code = code; NET.status = 'joining'; NET.step = '중계 서버에 접속하는 중'; renderHub();
  try { await loadPeerJs(); } catch (e) { return coopFail('네트워크 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  const peer = new window.Peer(peerOpts()); NET.peer = peer;
  const stepTo = t => { NET.step = t; if (GS.state === 'hub' && GS.hubModal === 'coop') renderHub(); };
  setTimeout(() => { if (NET.peer === peer && NET.status === 'joining' && !peer.open) coopFail('중계 서버에 접속하지 못했습니다. 인터넷 연결이나 방화벽(학교 · 회사 네트워크)을 확인해 주세요.'); }, 12000);
  peer.on('open', () => {
    stepTo('방을 찾는 중');
    const conn = peer.connect('margin-coop-' + code, { reliable: true, serialization: 'json' }); coopBind(conn);
    conn.on('iceStateChanged', st => {
      if (NET.status !== 'joining') return;
      if (st === 'checking') stepTo('방장 컴퓨터와 직접 연결하는 중');
      if (st === 'failed') coopFail('방은 찾았지만 직접 연결이 막혔습니다. 학교 · 회사 와이파이처럼 기기끼리 연결을 막는 네트워크일 수 있습니다. 한쪽이 휴대폰 데이터(핫스팟)로 바꾼 뒤 다시 시도해 주세요.');
    });
    setTimeout(() => { if (NET.peer === peer && NET.role === 'guest' && NET.status === 'joining') coopFail(`연결 시간이 초과되었습니다 (마지막 단계: ${NET.step}). 방장이 협동 창을 열어 둔 상태인지, 코드가 맞는지 확인한 뒤 다시 시도해 주세요.`); }, 20000);
  });
  peer.on('error', err => { if (NET.status !== 'connected') coopFail(err.type === 'peer-unavailable' ? '해당 코드의 방을 찾지 못했습니다. 코드를 다시 확인하고, 방장의 협동 창에 방 코드가 떠 있는지 확인해 주세요.' : err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' ? '중계 서버와 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.' : '연결 실패 (' + err.type + ')'); });
}
function coopBind(conn) {
  NET.conn = conn;
  conn.on('open', () => { NET.status = 'connected'; NET.err = ''; NET.lastRecv = GS.time; coopSend({ t: 'hello', b: COOP_BUILD }); SFX.ui(); if (GS.state === 'hub') renderHub(); });
  conn.on('data', d => { NET.lastRecv = GS.time; try { coopRecv(typeof d === 'string' ? JSON.parse(d) : d); } catch (e) { console.error('coop recv', e); } });
  const drop = () => {
    if (NET.role === 'host' && NET.status === 'waiting') { if (NET.conn === conn) NET.conn = null; NET.err = '친구의 접속 시도가 실패했습니다. 방은 그대로 열려 있으니 친구에게 다시 참가하라고 해 주세요.'; if (GS.state === 'hub') renderHub(); return; }
    if (NET.conn !== conn) return;
    coopLost();
  };
  conn.on('close', drop);
  conn.on('error', drop);
}
function coopSend(m) { try { if (NET.conn && NET.conn.open) NET.conn.send(m); } catch (e) { } }
function coopLeave() { coopSend({ t: 'bye' }); if (coopOn() && GS.state === 'mission') endMission('abandon'); coopReset(); if (GS.state === 'hub') renderHub(); }
function coopLost() {
  if (NET.status === 'off') return;
  const wasGuest = NET.role === 'guest', inMission = coopOn() && GS.state === 'mission';
  if (NET.role === 'host' && !inMission && NET.peer && !NET.peer.destroyed) {
    try { if (NET.conn) NET.conn.close(); } catch (e) { }
    NET.conn = null; NET.status = 'waiting'; NET.partner = ''; NET.inGame = false; NET.err = `동료와의 연결이 끊어졌습니다. 방(코드 ${NET.code})은 그대로 열려 있어 다시 참가할 수 있습니다.`;
    if (GS.state === 'hub') renderHub(); return;
  }
  coopReset(); NET.err = '동료와의 연결이 끊어졌습니다.';
  if (inMission) {
    if (wasGuest) { addFeed('방장 연결 끊김 · 임무 중단 (회수한 부품은 정산)', 'x'); endMission('extract'); }
    else { addFeed('동료 연결 끊김 · 혼자 계속 진행', 'x'); if (NET.av) { GS.world.remove(NET.av.g); NET.av = null; } }
  } else if (GS.state === 'hub') renderHub();
}
function coopLaunch(m) {
  if (NET.role !== 'host' || NET.status !== 'connected' || !COOP_MISSIONS.includes(m)) return;
  if (NET.partner && NET.partner !== COOP_BUILD) { NET.err = '두 사람의 게임 버전이 달라 출격할 수 없습니다. 둘 다 Ctrl+F5로 새로고침한 뒤 다시 연결해 주세요.'; renderHub(); return; }
  if (MISSIONS[m].extreme && !extremeUnlocked()) return;
  const h = !!GS.save.hardSel && hardUnlocked(m);
  NET.inGame = true; coopSend({ t: 'start', m, h }); GS.selectedMission = m; startMission(m, h);
}

// ---------------- 원격 플레이어 (모습 + 판정용 프록시) ----------------
function makeRemote() { return { remote: true, pos: V3(), vel: V3(), onGround: true, eye: EYE, height: P_HEIGHT, crouch: 0, hspeed: 0, hp: 100, mhp: 100, dn: false, out: false, downT: 0, yaw: 0, pitch: 0, w: 'pistol', tpos: V3(), shots: 0 }; }
function buildAvatar() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const add = (geo, c, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); parent.add(m); return m; };
  add(_box3(0.16, 0.8, 0.18), 0x2c3a46, -0.13, 0.4, 0); add(_box3(0.16, 0.8, 0.18), 0x2c3a46, 0.13, 0.4, 0);
  add(_box3(0.5, 0.62, 0.3), 0x3f8fd0, 0, 1.12, 0); add(_box3(0.54, 0.18, 0.34), 0x2a2d30, 0, 1.38, 0);
  const head = new THREE.Group(); head.position.set(0, 1.58, 0); body.add(head);
  add(_box3(0.3, 0.28, 0.3), 0x3a4752, 0, 0, 0, head);
  const visor = new THREE.Mesh(_box3(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x7ad8ff })); visor.position.set(0, 0.02, 0.16); head.add(visor);
  const arm = new THREE.Group(); arm.position.set(-0.3, 1.32, 0.05); body.add(arm);
  add(_box3(0.12, 0.12, 0.45), 0x3f8fd0, 0, -0.05, 0.2, arm);
  add(_box3(0.08, 0.12, 0.55), 0x1e1e1e, 0.02, 0.0, 0.5, arm);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(0.02, 0, 0.82); arm.add(flash);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,12,14,.75)'; x.fillRect(0, 8, 256, 48); x.fillStyle = '#7ad8ff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillText('동료', 128, 43);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  tag.scale.set(1.0, 0.25, 1); tag.position.set(0, 2.15, 0); g.add(tag);
  GS.world.add(g);
  return { g, body, head, arm, flash, tag };
}
function updateAvatar(dt) {
  const r = NET.rp, a = NET.av; if (!r || !a) return;
  a.g.position.lerp(r.tpos, clamp(dt * 14, 0, 1)); r.pos.copy(a.g.position);
  a.g.rotation.y = lerpAngle(a.g.rotation.y, r.yaw + Math.PI, clamp(dt * 14, 0, 1));
  a.arm.rotation.x = -r.pitch; a.head.rotation.x = -r.pitch * 0.6;
  const down = r.dn || r.out;
  a.body.rotation.x = lerp(a.body.rotation.x, down ? -1.45 : 0, clamp(dt * 6, 0, 1));
  a.body.position.y = lerp(a.body.position.y, down ? 0.25 : -r.crouch * 0.45, clamp(dt * 6, 0, 1));
  a.flash.material.opacity = Math.max(0, a.flash.material.opacity - dt * 18);
  a.tag.material.opacity = r.out ? 0.35 : 1;
}
function lerpAngle(a, b, k) { return a + angDiff(b, a) * k; }
function avatarMuzzle(out) { const a = NET.av; if (!a) return out.copy(NET.rp ? NET.rp.pos : player.pos); a.g.updateMatrixWorld(true); return a.flash.getWorldPosition(out); }
function avatarShotFx(wid, pts) {
  if (!NET.av) return; NET.av.flash.material.opacity = 1;
  const m = avatarMuzzle(V3()); SFX.eshot('combat', m.distanceTo(player.pos) * 0.6);
  for (const p of pts || []) spawnTracer(m, V3(p[0], p[1], p[2]), 0x9ad8ff, 0.06);
}

// ---------------- 대상 선택 · 피해 전달 ----------------
function coopTargets() {
  const t = [];
  if (!player.downed) t.push(player);
  if (isHost() && NET.rp && !NET.rp.dn && !NET.rp.out && NET.conn) t.push(NET.rp);
  return t;
}
function pickTarget(e, dt) {
  if (!isHost() || !NET.rp) return player;
  const c = coopTargets(); if (!c.length) return player; if (c.length === 1) return c[0];
  const ep = e.dragon ? e.headPos : e.root.position;
  if (!e.boss) return c.reduce((a, b) => Math.hypot(a.pos.x - ep.x, a.pos.z - ep.z) <= Math.hypot(b.pos.x - ep.x, b.pos.z - ep.z) ? a : b);
  e.tgtT = (e.tgtT || 0) - dt;
  if (e.tgt && c.includes(e.tgt) && e.tgtT > 0) return e.tgt;
  const ag = e.aggro || {};
  const score = p => (ag[p === player ? 'l' : 'r'] || 0) * 0.02 + 40 / (4 + Math.hypot(p.pos.x - ep.x, p.pos.z - ep.z)) + Math.random() * 2;
  e.tgt = c.reduce((a, b) => score(a) >= score(b) ? a : b); e.tgtT = rand(5, 8);
  for (const k in ag) ag[k] *= 0.5;
  return e.tgt;
}
function hurtTarget(T, d, from, src) {
  if (T === player || !T.remote) { damagePlayer(d, from, src); return; }
  if (T.dn || T.out) return;
  coopEv({ t: 'hurt', d: +d.toFixed(2), f: [from.x, from.y, from.z], s: src });
}
function knockTarget(T, dx, dz, p) { if (T === player || !T.remote) knockPlayer(dx, dz, p); else coopEv({ t: 'knock', dx, dz, p }); }
function dmgTargets() { return isHost() && NET.rp && NET.conn && !NET.rp.dn && !NET.rp.out ? [player, NET.rp] : [player]; }
// 친구 화면의 사격: 판정은 방장이 하고, 여기서는 맞은 위치 연출만
function guestRay(origin, dir, w) {
  raycaster.set(origin, dir); raycaster.far = w.range; raycaster.near = 0.05;
  const hits = raycaster.intersectObjects(GS.hittables, false);
  if (!hits.length) return { point: origin.clone().addScaledVector(dir, w.range), part: null };
  let first = null, last = null, cnt = 0, mult = 1; const seen = new Set();
  for (const h of hits) {
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
    const ud = h.object.userData, p = ud.part; last = h.point;
    if (!p) { if (!cnt) { burstSparks(h.point, n, 4, 0xd8d0c0, 3); spawnFlash(h.point, 0.18, 0.05, 0xddd6c8); } break; }
    if (seen.has(p)) continue; seen.add(p); if (!first) first = { h, p };
    const precise = p.precise || ud.hitMult > 1.2, armorish = p.type === 'armor';
    burstSparks(h.point, n, precise ? 9 : 6, precise ? 0xff9a3a : (armorish ? 0xe8e4d8 : 0xffc060), precise ? 7 : 5);
    spawnFlash(h.point, precise ? 0.5 : 0.32, 0.06, precise ? 0xffb060 : 0xfff0d0);
    if (!cnt) { const kind = precise ? 'weak' : armorish ? 'armor' : 'hit'; showHitmarker(kind); SFX.hit(kind); }
    const fall = w.falloff ? clamp(1 - (h.distance - w.falloff[0]) / (w.falloff[1] - w.falloff[0]), 0.25, 1) : 1;
    NET.claims.push({ i: eIdx(p.enemy), pid: p.id, mi: p.meshes.indexOf(h.object), pt: v3a(h.point), n: v3a(n), f: +fall.toFixed(3), m: +mult.toFixed(3), pr: w.pierce ? 1 : 0 });
    if (!w.pierce || ++cnt >= w.pierce) break; mult *= 0.7;
  }
  return first ? { point: first.h.point, part: first.p, mesh: first.h.object } : { point: last || origin.clone().addScaledVector(dir, w.range), part: null };
}
const hurtTg = (d, from, src) => hurtTarget(GS.tg, d, from, src);
const knockTg = (dx, dz, p) => knockTarget(GS.tg, dx, dz, p);

// ---------------- 이벤트 큐 ----------------
function coopEv(o) { if (isHost()) NET.evq.push(o); }
function coopOut(o) { if (isGuest()) NET.outq.push(o); }
const eIdx = e => GS.enemies.indexOf(e);
const v3a = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const av3 = a => V3(a[0], a[1], a[2]);

// ---------------- 방장: 상태 전송 ----------------
function snapEnemy(e, i) {
  const p = e.root.position, o = { i, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), r: +(e.yaw || 0).toFixed(3), a: e.alert ? 1 : 0 };
  const r2 = v => +v.toFixed(2);
  if (e.dragon) {
    const B = e.bs; const sp = []; for (const q of e.segPts) sp.push(r2(q.x), r2(q.y), r2(q.z));
    Object.assign(o, { s: B.state, p2: B.phase2 ? 1 : 0, mk: r2(B.markerA || 0), aim: B.aim ? v3a(B.aim) : null, mg: r2(e.mglow.material.opacity), hp: v3a(e.headPos), hd: v3a(e.headDir), sp });
  } else if (e.spider) {
    const B = e.bs; Object.assign(o, { s: B.state, H: r2(e.H), g: r2(e.gait), ms: r2(e.moveSpeed || 0), to: B.to ? v3a(B.to) : null, tr: r2(e.tubes.rotation.x), bk: B.broken, p2: B.phase2 ? 1 : 0 });
  } else if (e.mite) {
    Object.assign(o, { ms: r2(e.moveSpeed || 0), ar: e.armT > 0 ? 1 : 0 });
  } else if (e.drone) {
    Object.assign(o, { bx: r2(e.body.rotation.x), bz: r2(e.body.rotation.z), fa: e.falling ? 1 : 0, st: e.stunT > 0 ? 1 : 0 });
  } else if (e.type === 'rex') {
    const B = e.bs;
    Object.assign(o, { s: B.state, t: +(B.t || 0).toFixed(2), ms: +(B.moveSpeed || 0).toFixed(2), cr: B.crawl ? 1 : 0, p2: B.phase2 ? 1 : 0, mk: +(B.markerA || 0).toFixed(2),
      ld: v3a(B.laserDir), lk: B.laserLocked ? 1 : 0, le: B.laserEnd ? v3a(B.laserEnd) : null });
  } else { o.ms = +(e.moveSpeed || 0).toFixed(2); o.st = e.stunT > 0 ? 1 : 0; o.wp = e.parts.weapon && e.parts.weapon.attached ? +e.parts.weapon.group.rotation.x.toFixed(2) : 0; }
  return o;
}
function coopHostSend(dt) {
  NET.sendT -= dt; NET.fullT -= dt;
  if (NET.sendT > 0) return;
  NET.sendT = 0.05;
  const full = NET.fullT <= 0; if (full) NET.fullT = 1;
  const es = [], ps = [];
  GS.enemies.forEach((e, i) => {
    if (e.dead) return;
    es.push(snapEnemy(e, i));
    for (const id in e.parts) { const p = e.parts[id]; if ((p.nd || full) && p.attached) { ps.push([i, id, +p.hp.toFixed(1), +p.brk.toFixed(1), p.state]); p.nd = 0; } }
  });
  const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  coopSend({ t: 'snap', h: { p: v3a(player.pos), y: +eu.y.toFixed(3), x: +eu.x.toFixed(3), c: +player.crouch.toFixed(2), dn: player.downed ? 1 : 0, out: player.out ? 1 : 0,
    hp: Math.round(player.hp), mhp: player.maxHp, dt: +(GS.run.downT || 0).toFixed(1), w: curWeapon().id, sh: NET.hostShots || null }, e: es, p: ps, ev: NET.evq, ob: GS.run.objDone ? 1 : 0, fo: GS.run.focusT > 0 ? 1 : 0 });
  NET.evq = []; NET.hostShots = null;
}
function coopHostShotFx(pts) { if (!isHost()) return; NET.hostShots = (NET.hostShots || []).concat(pts.slice(0, 3)); }

// ---------------- 친구: 입력 전송 ----------------
function coopGuestSend(dt) {
  NET.sendT -= dt; if (NET.sendT > 0) return; NET.sendT = 0.05;
  const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  coopSend({ t: 'in', p: v3a(player.pos), v: [+player.vel.x.toFixed(2), +player.vel.z.toFixed(2)], y: +eu.y.toFixed(3), x: +eu.x.toFixed(3), c: +player.crouch.toFixed(2),
    og: player.onGround ? 1 : 0, hs: +player.hspeed.toFixed(2), hp: Math.round(player.hp), mhp: player.maxHp, dn: player.downed ? 1 : 0, out: player.out ? 1 : 0, dt: +(GS.run.downT || 0).toFixed(1),
    w: curWeapon().id, rm: +bagRoom().toFixed(2), ev: NET.outq });
  NET.outq = [];
}

// ---------------- 수신 ----------------
function coopRecv(m) {
  switch (m.t) {
    case 'hello': NET.partner = m.b; if (m.b !== COOP_BUILD) NET.err = '두 사람의 게임 버전이 다릅니다. 둘 다 Ctrl+F5로 새로고침한 뒤 다시 연결해 주세요.'; if (GS.state === 'hub') renderHub(); break;
    case 'bye': coopLost(); break;
    case 'start': if (NET.role === 'guest') { NET.inGame = true; GS.selectedMission = m.m; if (GS.state === 'mission') { GS.run = null; } startMission(m.m, !!m.h, true); } break;
    case 'snap': if (isGuest() && GS.state === 'mission') coopApplySnap(m); break;
    case 'in': if (isHost() && GS.state === 'mission') coopApplyInput(m); break;
  }
}
function coopApplyInput(m) {
  const r = NET.rp; if (!r) return;
  r.tpos.set(m.p[0], m.p[1], m.p[2]); r.vel.set(m.v[0], 0, m.v[1]); r.yaw = m.y; r.pitch = m.x; r.crouch = m.c; r.onGround = !!m.og; r.hspeed = m.hs;
  r.eye = lerp(EYE, 1.02, r.crouch); r.height = lerp(P_HEIGHT, 1.22, r.crouch);
  r.hp = m.hp; r.mhp = m.mhp; r.dn = !!m.dn; r.out = !!m.out; r.downT = m.dt; r.w = m.w; r.room = m.rm != null ? m.rm : 1e9;
  for (const ev of m.ev || []) {
    if (ev.t === 'shot') {
      NET.remoteShot = true; NET.remoteOc = !!ev.oc;
      const pts = ev.p || [];
      for (const c of ev.c || []) {
        const e = GS.enemies[c.i], p = e && !e.dead ? e.parts[c.pid] : null; if (!p || !p.attached) continue;
        const mesh = p.meshes[c.mi] || p.meshes[0];
        hitPart(p, mesh, av3(c.pt), av3(c.n), Object.assign({}, ev.w, { dmg: ev.w.dmg * c.m }), c.f, !!c.pr);
      }
      NET.remoteShot = false; NET.remoteOc = false;
      avatarShotFx(ev.w.id, pts);
      for (const e of GS.enemies) if (!e.dead && !e.alert && e.root.position.distanceTo(r.pos) < 11) e.pendingAlert = e.pendingAlert || rand(0.6, 1.2);
    } else if (ev.t === 'nade') { NET.remoteShot = true; launchThrowable(ev.k, av3(ev.f), av3(ev.v), !!ev.imp, ev.ex); NET.remoteShot = false; }
    else if (ev.t === 'focus') GS.run.focusT = Math.max(GS.run.focusT, 4);
    else if (ev.t === 'pick') { }
    else if (ev.t === 'fpick') { const l = GS.loots.find(x => x.lid === ev.lid); if (l && Math.hypot(l.x - r.pos.x, l.z - r.pos.z) <= l.r + 1) coopGrant(l); }
    else if (ev.t === 'rev') coopRevived();
    else if (ev.t === 'ex') coopTryExtract(true);
    else if (ev.t === 'leave') { r.out = true; addFeed('동료가 임무에서 이탈했습니다', 'x'); }
  }
}
function coopApplySnap(m) {
  for (const ev of m.ev || []) coopGuestEvent(ev);
  if (GS.state !== 'mission' || !GS.run) return;
  const r = NET.rp, h = m.h;
  if (r) { r.tpos.set(h.p[0], h.p[1], h.p[2]); r.yaw = h.y; r.pitch = h.x; r.crouch = h.c; r.dn = !!h.dn; r.out = !!h.out; r.hp = h.hp; r.mhp = h.mhp; r.downT = h.dt; r.w = h.w; if (h.sh) avatarShotFx(h.w, h.sh); }
  for (const s of m.e) { const e = GS.enemies[s.i]; if (e && !e.dead) { e.net = s; e.alert = !!s.a; } }
  for (const [i, id, hp, brk, st] of m.p) {
    const e = GS.enemies[i]; if (!e) continue; const p = e.parts[id]; if (!p || !p.attached) continue;
    const ch = p.state !== st || Math.abs(p.hp - hp) > 0.05;
    if (hp < p.hp - 0.05) { p.flash = 0.07; for (const mm of p.meshes) mm.material.emissive.setRGB(0.55, 0.38, 0.2); }
    p.hp = hp; p.brk = brk; p.state = st; if (ch && p.flash <= 0) updatePartVisual(p);
  }
  GS.run.focusT = m.fo ? Math.max(GS.run.focusT, 0.1) : GS.run.focusT;
}
function coopGuestEvent(ev) {
  const E = GS.enemies[ev.i], P = E && ev.pid ? E.parts[ev.pid] : null;
  switch (ev.t) {
    case 'spawn': { const e = spawnEnemy(ev.k, ev.x, ev.z, ev.r); e.pendingAlert = 0; e.alert = true; if (eIdx(e) !== ev.i) console.warn('coop spawn index mismatch', eIdx(e), ev.i); break; }
    case 'det': if (P && P.attached) detachPart(P, av3(ev.v), false); break;
    case 'sh': if (P && P.attached) shatter(P); break;
    case 'kill': if (E && !E.dead) killEnemy(E, ev.c); break;
    case 'loot': coopGuestLoot(ev); break;
    case 'unl': { const l = GS.loots.find(x => x.lid === ev.lid); if (l) { GS.loots.splice(GS.loots.indexOf(l), 1); GS.world.remove(l.obj, l.ring, l.beam); } break; }
    case 'got': {
      const l = GS.loots.find(x => x.lid === ev.lid); if (l) { GS.loots.splice(GS.loots.indexOf(l), 1); GS.world.remove(l.obj, l.ring, l.beam); }
      GS.run.loot.push(ev.l); SFX.pickup(); achEvent('pickup', { l: Object.assign({ p: P || { id: '', enemy: { type: ev.l.src } } }, ev.l) });
      addFeed(`회수 · ${ev.l.name} (${STATE_KO[ev.l.state]} ${Math.round(ev.l.cond * 100)}%) ${fmt(ev.l.val)} CR`, 'p'); break;
    }
    case 'mis': {
      const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: ev.c })); mesh.scale.set(ev.s[0], ev.s[1], ev.s[2]); const from = av3(ev.f), to = av3(ev.to); mesh.position.copy(from); GS.world.add(mesh);
      const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      marker.rotation.x = -Math.PI / 2; marker.position.copy(to); GS.world.add(marker);
      GS.missiles.push({ mesh, marker, from, to, t: 0, T: ev.T, h: ev.h, vis: true }); spawnFlash(from, 0.8, 0.08, 0xff9a50); SFX.missile(); break;
    }
    case 'shock': spawnShock(ev.x, ev.z); break;
    case 'bolt': dragonStrike(ev.x, ev.z); break;
    case 'spawnm': { const m = spawnMite(ev.x, ev.z); if (eIdx(m) !== ev.i) console.warn('coop mite index mismatch', eIdx(m), ev.i); break; }
    case 'spawnd': { const d = spawnDrone(ev.x, ev.z, ev.a); if (eIdx(d) !== ev.i) console.warn('coop drone index mismatch', eIdx(d), ev.i); break; }
    case 'boom': { const p = av3(ev.p), d = p.distanceTo(player.pos); SFX.explode(d); spawnFlash(p, ev.R * 1.1, 0.22, 0xffa050); burstSparks(p, UPY, 26, 0xffa040, 9); spawnDebris(p, 0x3a3630, 5, 5); blastLight.position.copy(p); blastLight.intensity = 80; GS.shake = Math.max(GS.shake, d < 12 ? 0.02 : 0.006); break; }
    case 'empfx': { const p = av3(ev.p); SFX.emp(); spawnFlash(p, ev.R * 1.3, 0.3, 0x6ac8ff); burstSparks(p, UPY, 30, 0x6ac8ff, 8);
      const ring = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: 0x6ac8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, Math.max(0.15, p.y), p.z); GS.world.add(ring); GS.fadeRings.push({ mesh: ring, t: 0, R: ev.R }); break; }
    case 'nade': NET.remoteShot = true; launchThrowable(ev.k, av3(ev.f), av3(ev.v), !!ev.imp, ev.ex); NET.remoteShot = false; break;
    case 'eshot': {
      const pr = poolGet(FX.projs, 80, () => { const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(mesh); return { mesh, vel: V3(), prev: V3() }; });
      const m = av3(ev.f), d = av3(ev.d);
      pr.alive = true; pr.life = 3; pr.dmg = 0; pr.src = null; pr.mesh.visible = true; pr.mesh.material.color.setHex(ev.c);
      pr.mesh.position.copy(m); pr.vel.copy(d).multiplyScalar(ev.s); pr.mesh.scale.set(ev.z, ev.z, ev.z * 3.5); pr.mesh.lookAt(_v1.copy(m).add(d)); spawnFlash(m, 0.4, 0.06, ev.c); SFX.eshot(ev.k, m.distanceTo(player.pos)); break;
    }
    case 'feed': addFeed(ev.s, ev.c); break;
    case 'pop': popup(ev.s, ev.c); break;
    case 'hurt': damagePlayer(ev.d, av3(ev.f), ev.s); break;
    case 'knock': knockPlayer(ev.dx, ev.dz, ev.p); break;
    case 'rev': coopRevived(); break;
    case 'obj':
      if (!GS.run.objDone) { GS.run.objDone = true; GS.run.bossKillT = ev.bt; GS.run.pistolOnly = Object.keys(GS.run.used).every(k => ['pistol', 'emp'].includes(k)); SFX.objective(); addFeed(`${GS.run.mission.target[0]} 격파 · 탈출 지점으로 귀환해 정산`, 'x'); }
      break;
    case 'end': coopEndLocal(ev.k); break;
    case 'sfx': if (SFX[ev.n]) SFX[ev.n](); break;
  }
}
function coopGuestLoot(ev) {
  const E = GS.enemies[ev.i], p = E && E.parts[ev.pid]; if (!p) return;
  const fi = GS.fallers.findIndex(f => f.obj === p.group); if (fi >= 0) GS.fallers.splice(fi, 1);
  if (p.attached) { p.attached = false; removeHittables(p.meshes); }
  GS.world.attach(p.group); p.group.position.set(ev.gp[0], ev.gp[1], ev.gp[2]); p.group.quaternion.set(ev.gq[0], ev.gq[1], ev.gq[2], ev.gq[3]);
  p.state = ev.state; p.flash = 0; updatePartVisual(p);
  const ring = new THREE.Mesh(lootRingGeo, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(ev.x, ev.y + 0.03, ev.z);
  const beam = new THREE.Mesh(lootBeamGeo, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(ev.x, ev.y + 1.2, ev.z); GS.world.add(ring, beam);
  GS.loots.push({ lid: ev.lid, p, obj: p.group, ring, beam, x: ev.x, y: ev.y, z: ev.z, cond: ev.cond, state: ev.state, r: ev.r, rs: ev.r / 2.3, name: ev.name, base: ev.base, val: ev.val, kg: ev.kg || 0 });
}

// ---------------- 친구 화면의 적 (방장 상태를 따라 그림) ----------------
function puppetUpdate(e, dt) {
  const s = e.net; if (e.dead) return;
  if (s) {
    const k = clamp(dt * 12, 0, 1);
    e.root.position.x = lerp(e.root.position.x, s.x, k); e.root.position.y = lerp(e.root.position.y, s.y, k); e.root.position.z = lerp(e.root.position.z, s.z, k);
    if (Math.hypot(e.root.position.x - s.x, e.root.position.z - s.z) > 6) e.root.position.set(s.x, s.y, s.z);
    e.yaw = lerpAngle(e.yaw, s.r, k); e.root.rotation.y = e.yaw;
  }
  if (e.spider) { puppetSpider(e, dt); return; }
  if (e.dragon) { puppetDragon(e, dt); return; }
  if (e.mite) { partTick(e, dt); e.armed = !!(s && s.ar); e.moveSpeed = s ? s.ms : 0; animateMite(e, e.moveSpeed, dt); return; }
  if (e.drone) {
    if (s) { e.body.rotation.x = s.bx; e.body.rotation.z = s.bz; e.falling = !!s.fa; e.stunT = s.st ? 0.2 : 0; }
    partTick(e, dt); for (const d of e.discs) if (d.userData.part.attached) d.rotation.y += dt * (e.falling ? 6 : 42);
    return;
  }
  if (e.type === 'rex') {
    const B = e.bs;
    if (s) {
      if (s.s !== B.state) {
        if (s.s === 'roar' || s.s === 'charge') SFX.roar(); else if (s.s === 'laser') SFX.laser(); else if (s.s === 'spin') SFX.missile();
        else if (s.s === 'recover' && B.state === 'bite') { B.bit = 0.35; SFX.brk(); }
        else if (s.s === 'stunned' || s.s === 'knockdown') { GS.shake = Math.max(GS.shake, 0.02); }
      }
      B.state = s.s; B.t = s.t; B.moveSpeed = s.ms; B.crawl = !!s.cr; B.phase2 = !!s.p2; B.markerA = s.mk; B.laserDir.set(s.ld[0], s.ld[1], s.ld[2]); B.laserLocked = !!s.lk; B.laserEnd = s.le ? av3(s.le) : null;
    }
    partTick(e, dt);
    if (B.state === 'laser' && B.laserEnd && Math.random() < 0.6) burstSparks(B.laserEnd, UPY, 3, 0xff8a40, 6);
    animateRex(e, dt);
    return;
  }
  partTick(e, dt);
  if (s) { e.stunT = s.st ? 0.2 : 0; if (e.parts.weapon && e.parts.weapon.attached) e.parts.weapon.group.rotation.x = s.wp; }
  e.moveSpeed = s ? s.ms : 0;
  animateLegs(e, e.moveSpeed, dt);
}

function puppetSpider(e, dt) {
  const s = e.net, B = e.bs, P = e.parts, pos = e.root.position;
  if (s) {
    if (s.s !== B.state) {
      const d = pos.distanceTo(player.pos);
      if (s.s === 'lunge' || (s.s === 'walk' && !B.seen)) SFX.spider();
      if (s.s === 'stomp' || s.s === 'land') { SFX.explode(d); GS.shake = Math.max(GS.shake, 0.03); spawnFlash(V3(pos.x, 0.3, pos.z), 5, 0.25, 0xffa050); spawnDebris(V3(pos.x, 0.2, pos.z), 0x5a554e, 8, 6); }
      if (s.s === 'collapse') { SFX.explode(d); GS.shake = Math.max(GS.shake, 0.03); }
      B.seen = true;
    }
    B.state = s.s; e.moveSpeed = s.ms; B.to = s.to ? av3(s.to) : null; e.tubes.rotation.x = s.tr; B.broken = s.bk; B.phase2 = !!s.p2;
    e.H = lerp(e.H, s.H, clamp(dt * 12, 0, 1)); e.gait = s.g;
  }
  partTick(e, dt);
  const mk = B.marker, mk2 = B.marker2; mk.material.opacity = 0; mk2.material.opacity = 0;
  if (B.state === 'stomp_wind') { mk.position.set(pos.x, 0.05, pos.z); mk.scale.setScalar(2.4); mk.material.opacity = 0.35 + 0.4 * Math.sin(GS.time * 30); }
  if ((B.state === 'lunge_wind' || B.state === 'lunge') && B.to) { mk2.position.set(B.to.x, 0.05, B.to.z); mk2.scale.setScalar(1.5); mk2.material.opacity = B.state === 'lunge' ? 0.7 : 0.4 + 0.4 * Math.sin(GS.time * 30); }
  spiderPose(e, dt);
}
function spiderPose(e, dt) {
  const B = e.bs, P = e.parts, pos = e.root.position;
  const lift = B.state === 'stomp_wind' ? { front: 2.4 } : B.state === 'lunge' ? { all: 1.4 } : null;
  const lb = e.legs.filter(L => L.side > 0 && !L.p.attached).length, rb = e.legs.filter(L => L.side < 0 && !L.p.attached).length;
  e.body.position.y = e.H + (B.state === 'walk' ? Math.sin(e.gait * 2) * 0.06 : 0);
  e.body.rotation.z = lerp(e.body.rotation.z, (rb - lb) * 0.06 + (B.state === 'dazed' || B.state === 'stunned' ? Math.sin(GS.time * 20) * 0.03 : 0), 0.08);
  e.body.rotation.x = lerp(e.body.rotation.x, B.state === 'stomp_wind' ? -0.18 : B.state === 'lunge_wind' ? 0.12 : 0, 0.12);
  for (const L of e.legs) {
    if (!L.p.attached) continue;
    const ph = e.gait + (L.group ? Math.PI : 0), moving = e.moveSpeed > 0.2 ? 1 : 0;
    let R = 3.6 + 0.45 * Math.sin(ph) * moving + (e.H < 1.5 ? 0.9 : 0), up = moving * Math.max(0, Math.cos(ph)) * 0.7;
    if (lift && lift.front && L.idx === 0) up = lift.front;
    if (lift && lift.all) up = lift.all;
    L.p.group.rotation.y = L.base + 0.16 * Math.sin(ph) * moving * (L.side > 0 ? -1 : 1);
    legIK(L, R, Math.max(0.3, e.H - 0.1 - up));
  }
  const ex = spiderExposed(e);
  if (P.reactor.attached && P.reactor.flash <= 0) P.reactor.meshes[0].material.emissive.setHex(0xff7a1a).multiplyScalar(ex ? 1.1 + 0.4 * Math.sin(GS.time * 14) : 0.25);
  if (P.head.attached && P.head.flash <= 0) for (const m of e.eyes) m.material.emissive.setHex(0xff3020).multiplyScalar(B.state === 'lunge_wind' || B.state === 'stomp_wind' ? 1.5 : 0.8);
  if (B.state === 'stunned' && Math.random() < 0.3) { _v1.copy(pos).setY(e.H); burstSparks(_v1, UPY, 3, 0x6ac8ff, 4); }
}
function puppetDragon(e, dt) {
  const s = e.net, B = e.bs, P = e.parts;
  partTick(e, dt);
  if (s) {
    if (s.s !== B.state) { if (s.s === 'breath') SFX.breath(); else if (s.s === 'dive' || s.s === 'crash') SFX.dragonRoar(); else if (s.s === 'storm_wind') SFX.emp(); }
    if (!B.seenRoar && s.s !== 'cruise') { B.seenRoar = true; SFX.dragonRoar(); }
    B.state = s.s; B.phase2 = !!s.p2; B.markerA = s.mk; B.aim = s.aim ? av3(s.aim) : null; e.mglow.material.opacity = s.mg;
    const k = clamp(dt * 14, 0, 1);
    e.headPos.lerp(_v2.set(s.hp[0], s.hp[1], s.hp[2]), k); e.headDir.lerp(_v2.set(s.hd[0], s.hd[1], s.hd[2]), k).normalize();
    for (let i = 0; i < DR.segs && i * 3 + 2 < s.sp.length; i++) e.segPts[i].lerp(_v1.set(s.sp[i * 3], s.sp[i * 3 + 1], s.sp[i * 3 + 2]), k);
  }
  const shieldOn = partAlive(P.pearl), open = dragonNodesOpen(e);
  for (const id of ['n1', 'n2', 'n3']) { const q = P[id]; if (!q.attached || q.state === 'disabled' || q.state === 'destroyed' || q.flash > 0) continue;
    for (const m of q.meshes) if (m.userData.sub) m.material.emissive.setHex(0x5ff6ff).multiplyScalar(open ? 1.0 + 0.4 * Math.sin(GS.time * 14) : 0.12); }
  for (const id of ['n1', 'n2', 'n3']) if (P[id].shieldMesh) P[id].shieldMesh.visible = shieldOn && P[id].attached && P[id].state !== 'disabled' && P[id].state !== 'destroyed';
  if (P.pearl.glowSprite) P.pearl.glowSprite.material.opacity = shieldOn ? 0.55 + 0.25 * Math.sin(GS.time * 4) : 0;
  applyDragonPose(e, e.headPos, e.headDir, e.segPts);
  if (P.jaw.attached) P.jaw.group.rotation.x = lerp(P.jaw.group.rotation.x, (B.state === 'breath' || B.state === 'breath_wind' || B.state === 'dive') ? 0.5 : 0.08 + Math.sin(GS.time * 1.3) * 0.04, Math.min(1, dt * 8));
  const mk = B.marker, hp = e.headPos;
  if (B.markerA > 0 && B.aim) {
    const a0 = V3(hp.x, 0.05, hp.z), a1 = V3(B.aim.x, 0.05, B.aim.z), dd = a1.clone().sub(a0); const L = dd.length() + 14;
    dd.normalize(); mk.position.copy(a0).addScaledVector(dd, L / 2); mk.scale.set(1, L, 1); mk.rotation.set(-Math.PI / 2, 0, -Math.atan2(dd.x, dd.z) + Math.PI);
    mk.material.opacity = B.markerA * (0.7 + 0.3 * Math.sin(GS.time * 30));
  } else mk.material.opacity = 0;
}
// ---------------- 쓰러짐 · 부활 · 탈출 ----------------
function coopDown() {
  if (player.downed) return;
  player.downed = true; player.hp = 0; GS.run.downT = 35; GS.mouseDown = GS.rightDown = false; GS.run.burstLeft = 0;
  addFeed('쓰러짐 · 동료가 다가와 E를 길게 누르면 일어납니다', 'x'); popup('쓰러짐', 'bad'); SFX.hurt();
  if (isHost()) coopEv({ t: 'feed', s: '동료 쓰러짐 · 다가가서 E를 길게 눌러 일으키세요', c: 'x' });
}
function coopRevived() {
  if (!player.downed || player.out || !GS.run) return;
  player.downed = false; player.hp = player.maxHp * 0.4; GS.run.iframeT = 1.5; player.lastHurt = GS.time;
  addFeed('동료가 일으켜 세웠습니다', 'p'); popup('부활', 'ok'); SFX.skill('nano');
}
function coopTick(dt) {
  if (!GS.run) return;
  // 쓰러진 상태 · 출혈
  if (player.downed && !player.out) {
    GS.run.downT -= dt;
    if (GS.run.downT <= 0) { player.out = true; addFeed('출혈 한계 · 이번 임무에서 이탈 (정산 시 사망 처리)', 'x'); if (isHost()) coopEv({ t: 'feed', s: '동료가 출혈 한계로 이탈했습니다', c: 'x' }); }
  }
  updateAvatar(dt);
  // 동료 부활
  const r = NET.rp;
  if (r && (r.dn && !r.out) && !player.downed && Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z) < 2.4 && kd('use')) {
    NET.revT += dt;
    if (NET.revT >= 2.5) { NET.revT = 0; if (isHost()) coopEv({ t: 'rev' }); else coopOut({ t: 'rev' }); r.dn = false; addFeed('동료를 일으켜 세웠습니다', 'p'); }
  } else NET.revT = 0;
  if (isHost()) {
    // 친구의 전리품 회수 (방장이 판정)
    if (r && !r.dn && !r.out) for (let i = GS.loots.length - 1; i >= 0; i--) {
      const l = GS.loots[i];
      if (Math.hypot(l.x - r.pos.x, l.z - r.pos.z) <= l.r && Math.abs(l.y - r.pos.y) <= 1.6 && (l.kg || 0) <= (r.room != null ? r.room : 1e9) + 1e-6) {
        coopGrant(l); if (r.room != null) r.room -= l.kg || 0;
      }
    }
    // 둘 다 쓰러지면 실패
    const meDown = player.downed || player.out, youDown = !r || !NET.conn || r.dn || r.out;
    if (meDown && youDown && GS.state === 'mission') { coopEv({ t: 'end', k: 'dead' }); coopHostSend(0.05); NET.sendT = 0; coopFlush(); endMission('dead'); return; }
    coopHostSend(dt);
  } else coopGuestSend(dt);
}
function coopGrant(l) {
  const i = GS.loots.indexOf(l); if (i < 0) return;
  GS.loots.splice(i, 1); GS.world.remove(l.obj, l.ring, l.beam);
  coopEv({ t: 'got', lid: l.lid, i: eIdx(l.p.enemy), pid: l.p.id, l: { name: l.name, base: l.base, val: l.val, cond: l.cond, state: l.state, src: l.p.enemy.type, kg: l.kg || 0 } });
}
function coopFlush() { if (isHost()) { NET.sendT = 0; NET.fullT = 1; coopHostSend(0); } }
function inZone(p) { return GS.extraction && Math.hypot(GS.extraction.x - p.x, GS.extraction.z - p.z) < GS.extraction.r + 0.6; }
function coopTryExtract(fromGuest) {
  if (isGuest()) { coopOut({ t: 'ex' }); popup('동료가 탈출 지점에 오면 함께 탈출합니다', 'dim'); return; }
  if (!GS.run.objDone) return;
  const r = NET.rp, partnerOk = !r || !NET.conn || r.out || r.dn || inZone(r.pos), meOk = player.out || player.downed || inZone(player.pos);
  if (partnerOk && meOk) { coopEv({ t: 'end', k: 'extract' }); coopFlush(); endMission(player.downed || player.out ? 'dead' : 'extract'); }
  else if (fromGuest) coopEv({ t: 'pop', s: '방장이 탈출 지점에 와야 합니다', c: 'dim' });
  else { popup('동료가 탈출 지점에 와야 합니다', 'dim'); coopEv({ t: 'feed', s: '방장이 탈출 지점에서 기다리는 중', c: 'x' }); }
}
function coopEndLocal(k) {
  if (GS.state !== 'mission') return;
  const dead = player.downed || player.out;
  endMission(k === 'dead' || dead ? 'dead' : k === 'abandon' ? 'extract' : k);
}
function coopHud() {
  const el = $('coopinfo'); if (!el) return;
  if (!coopOn() || !NET.rp) { el.classList.add('hidden'); return; }
  const r = NET.rp; el.classList.remove('hidden');
  el.innerHTML = !NET.conn ? '<span class="bad">동료 연결 끊김</span>' : r.out ? '<span class="bad">동료 이탈</span>' : r.dn ? `<span class="bad">동료 쓰러짐 · ${Math.ceil(r.downT)}초</span>` : `동료 체력 <span class="mono">${Math.round(r.hp)} / ${r.mhp}</span>`;
}
function coopPrompt() {
  if (!coopOn() || !GS.run) return '';
  if (player.out) return '<span class="bad">이번 임무에서 이탈했습니다 · 동료의 탈출을 기다리는 중</span>';
  if (player.downed) return `<span class="bad">쓰러짐 · 동료가 일으켜 줄 때까지 ${Math.ceil(GS.run.downT)}초</span>`;
  const r = NET.rp;
  if (r && r.dn && !r.out && Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z) < 2.4) return `<b>[${UK()} 길게]</b>동료 일으키기 ${NET.revT > 0 ? Math.round(NET.revT / 2.5 * 100) + '%' : ''}`;
  return '';
}
function coopModalHtml() {
  const st = NET.status, err = NET.err ? `<div class="bad" style="margin-top:12px;font-size:13px">${NET.err}</div>` : '';
  let body = '';
  if (st === 'off') body = `<div class="dim" style="font-size:13px;line-height:1.6">친구와 함께 보스 작전(렉스, 거미 전차, 청룡, 익스트림)에 들어갑니다. 방장의 컴퓨터가 게임을 진행하므로 방장은 게임 창을 내리지 마세요.</div>
      <div style="display:flex;gap:10px;margin-top:16px"><button class="primary" id="cohost">방 만들기</button></div>
      <div class="lbl" style="margin:20px 0 8px">참가하기</div>
      <div style="display:flex;gap:8px"><input id="cocode" maxlength="4" placeholder="방 코드 4자리" style="flex:1;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.3em;padding:10px;background:#111;border:1px solid var(--line);color:#efe9de"><button id="cojoin">참가</button></div>`;
  else if (st === 'starting' || st === 'joining') body = `<div class="dim">${st === 'starting' ? '방을 만드는 중…' : `방 <b class="mono">${NET.code}</b>에 연결하는 중… <span class="acc">${NET.step}</span>`}</div><div style="margin-top:16px"><button id="coleave">취소</button></div>`;
  else if (st === 'waiting') body = `<div class="lbl">방 코드</div><div class="mono acc" style="font-size:44px;letter-spacing:.35em;margin:6px 0 10px">${NET.code}</div>
      <div class="dim" style="font-size:13px;line-height:1.6">친구가 같은 주소에서 <b>협동 → 참가하기</b>에 이 코드를 입력하면 연결됩니다.</div><div style="margin-top:16px"><button id="coleave">방 닫기</button></div>`;
  else if (st === 'connected') body = NET.role === 'host'
    ? `<div class="ok" style="font-size:15px">동료 접속됨 · 방 <span class="mono">${NET.code}</span></div><div class="dim" style="font-size:13px;margin-top:8px;line-height:1.6">작전을 고르면 둘이 함께 들어갑니다. 협동에서는 보스의 내구도가 1.6배이고, 한 명이 쓰러지면 다른 한 명이 다가가 E를 길게 눌러 일으킬 수 있습니다.</div>
       <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">${COOP_MISSIONS.filter(m => !MISSIONS[m].extreme || extremeUnlocked()).map(m => `<button class="primary" data-colaunch="${m}">협동 출격 · ${MISSIONS[m].code} ${MISSIONS[m].name}${GS.save.hardSel && hardUnlocked(m) ? ' · 하드' : ''}</button>`).join('')}</div>
       <div style="margin-top:12px"><button id="coleave">연결 끊기</button></div>`
    : `<div class="ok" style="font-size:15px">방 <span class="mono">${NET.code}</span> 접속됨</div><div class="dim" style="font-size:13px;margin-top:8px">방장이 출격하면 자동으로 함께 작전에 들어갑니다. 그동안 상점에서 장비를 정비해도 됩니다.</div><div style="margin-top:16px"><button id="coleave">나가기</button></div>`;
  return `<div class="overlay" id="hmodal"><div class="sheet" style="width:min(520px,94vw)"><header><h2>협동</h2><span class="lbl">2인 · 보스 작전</span></header><div class="body">${body}${err}</div><div class="foot"><button class="primary" data-close>닫기</button></div></div></div>`;
}
function coopBindModal(H) {
  const b = id => H.querySelector('#' + id);
  if (b('cohost')) b('cohost').onclick = () => { NET.err = ''; coopHost(); };
  if (b('cojoin')) b('cojoin').onclick = () => { const v = b('cocode').value; NET.err = ''; coopJoin(v); };
  if (b('cocode')) b('cocode').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); coopJoin(e.target.value); } };
  if (b('coleave')) b('coleave').onclick = () => { coopLeave(); NET.err = ''; renderHub(); };
  H.querySelectorAll('[data-colaunch]').forEach(x => x.onclick = () => coopLaunch(x.dataset.colaunch));
}

export { NET, buildAvatar, coopBindModal, coopDown, coopEv, coopFlush, coopGuestSend, coopHost, coopHostShotFx, coopHud, coopJoin, coopLaunch, coopLeave, coopModalHtml, coopOn, coopOut, coopPrompt, coopTick, coopTryExtract, dmgTargets, eIdx, guestRay, hurtTarget, hurtTg, isGuest, isHost, knockTarget, knockTg, makeRemote, pickTarget, puppetUpdate, spiderPose, v3a };
