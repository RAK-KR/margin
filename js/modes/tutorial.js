import * as THREE from 'three';
import { GS } from '../core/state.js?v=37';
import { $, V3, _v4, clamp, lerp, setHTML } from '../core/utils.js?v=37';
import { WEAPONS, bind, effW, keyLabel, maxReserve } from '../data/data.js?v=37';
import { writeSave } from '../core/save.js?v=37';
import { SFX } from '../core/audio.js?v=37';
import { controls, scene } from '../core/renderer.js?v=37';
import { addBox, crate, removeHittables } from '../world/world.js?v=37';
import { player } from '../player/playerState.js?v=37';
import { addExtraction, setEnv, showGun, spawnEnemy } from '../world/missions.js?v=37';
import { animateLegs } from '../enemies/ai.js?v=37';
import { animateRex, partTick, spawnBoss } from '../bosses/rex.js?v=37';
import { dragonCoilPose, spawnDragon } from '../bosses/dragon.js?v=37';
import { ROTORS, rotorsWorking, spawnDrone, updateDrone } from '../enemies/extra.js?v=37';
import { SPI, spawnMite, spawnSpider } from '../bosses/spider.js?v=37';
import { spiderPose } from './coop.js?v=37';
import { achUnlock } from '../meta/achievements.js?v=37';
import { addFeed, popup } from '../ui/hud.js?v=37';
import { goHub } from '../game/result.js?v=37';

// =====================================================================
//  훈련장 (튜토리얼)
// =====================================================================
function buildRange() {
  setEnv({ sky: 0x5a6470, fog: [40, 150], hemi: [0xdfe6ee, 0x3a3630, 1.5], sun: [0xfff0d8, 2.0, [-30, 40, 20]],
    ground: '#55574f', groundLine: 'rgba(220,230,240,.13)', size: [64, 64] });
  const W = 0x4a4d50;
  addBox(0, -32, 66, 2, 6, W); addBox(0, 32, 66, 2, 6, W); addBox(-32, 0, 2, 66, 6, W); addBox(32, 0, 2, 66, 6, W);
  for (const [x, z, w, d] of [[-12, 15, 3, 0.6], [12, 15, 3, 0.6], [-22, 2, 0.6, 3], [22, 0, 0.6, 3], [-24, -18, 3, 0.6], [24, -18, 3, 0.6]]) addBox(x, z, w, d, 1.1, 0x8a857c);
  for (const [x, z] of [[-26, 24], [26, 24]]) crate(x, z, 0x5a5f55);
  addExtraction(0, 24);
  return { spawn: V3(0, 0, 22), yaw: 0, bounds: { x: 30, z: 30 } };
}
const tutK = a => `<b class="acc mono">${keyLabel(bind(a))}</b>`;
const partGone = q => q && (q.state === 'disabled' || q.state === 'destroyed' || !q.attached);
function tutRobot(type, x, z, yaw) { const e = spawnEnemy(type, x, z, yaw, {}); e.tutPassive = true; e.noReward = true; return e; }
function tutMarker(x, z) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.55, 40), new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); GS.world.add(m); GS.run.tut.marker = m;
}
const tutE = () => GS.enemies.find(e => !e.dead && e.tutTarget) || GS.enemies.find(e => e.tutTarget);
const tutBoss = (e, k = 0.3) => { e.tutPassive = true; e.noReward = true; e.tutTarget = true; for (const q of Object.values(e.parts)) { q.maxHp *= k; q.hp = q.maxHp; q.brkMax *= k; q.brk = q.brkMax; } return e; };
// 훈련용 무기 지급 (훈련이 끝나면 원래 장비로 돌아감)
function tutGive(ids) {
  const all = [...ids, 'pistol'];
  for (const id of all) GS.run.wst[id] = GS.run.wst[id] || effW(id);
  GS.run.ws = all.map(id => ({ id, mag: GS.run.wst[id].mag, reserve: maxReserve(id) }));
  GS.run.cur = 0; GS.run.lastCur = all.length - 1; GS.run.reloadT = 0; GS.run.switchT = 0.35; showGun();
  addFeed(`훈련용 무기 지급 · ${ids.map(id => WEAPONS[id].name).join(', ')}`, 'p'); SFX.reload();
}
const TUT_STEPS = [
  { t: '이 게임에서 하는 일', info: true, d: () => `당신은 기계 부품을 회수하는 용병입니다. 한 번의 작전은 이렇게 흘러갑니다.<br>
    <b>① 출격</b> → <b>② 기계의 부위를 골라 부순다</b> → <b>③ 떨어진 부품을 줍는다</b> → <b>④ 탈출 지점으로 돌아간다</b> → <b>⑤ 거점에서 정산하고 상점에서 장비를 산다</b><br>
    번 돈으로 더 좋은 장비를 사서, 더 강한 기계와 보스를 상대합니다. 마지막 목표는 기계를 만들어 내는 곳을 찾아 멈추는 것입니다.` },
  { t: '이동과 시점', d: () => `${tutK('fwd')} ${tutK('left')} ${tutK('back')} ${tutK('right')} 로 이동하고 마우스로 둘러봅니다. ${tutK('sprint')} 를 누르고 있으면 달리고, ${tutK('jump')} 는 점프, ${tutK('crouch')} 는 앉기입니다.<br>앞쪽 바닥의 주황색 원까지 걸어가세요.`,
    setup: () => tutMarker(0, 8), goal: () => Math.hypot(player.pos.x, player.pos.z - 8) < 1.6 },
  { t: '부품의 상태와 값', d: `기계는 부위마다 따로 부서집니다. 부위의 상태는 네 단계입니다.<br>
    <b class="ok">정상</b> → <b class="acc">손상</b>(판매가가 조금 떨어짐) → <b class="weak">무력화</b>(기능이 멈추고 떨어져 나옴, 거의 온전한 값으로 회수) → <b class="bad">파괴</b>(값 0, 회수 불가)<br>
    빛나는 <b>보조 팔</b>을 쏴서 <b>무력화</b>시키세요. 무력화된 부품을 계속 쏘면 파괴되니 떨어지면 사격을 멈추세요. 조준선 아래에 부위 이름과 상태가 표시됩니다.`,
    setup: () => { tutRobot('combat', 0, -2, 0).tutTarget = true; }, hl: () => [tutE().parts.arm], goal: () => partGone(tutE().parts.arm) },
  { t: '부품 줍기와 가방', d: () => `떨어진 부품 위에 주황색 원이 생겼습니다. <b>밟고 지나가면 자동으로 줍습니다.</b><br>
    부품에는 무게가 있습니다. 가방이 절반을 넘으면 느려지고, 가득 차면 자동으로 줍지 않습니다. 가방이 넘치면 넘친 만큼 점점 더 느려집니다. 무거운 부품은 ${tutK('use')} 로 직접 줍고, ${tutK('drop')} 로 값어치가 낮은 부품을 버리거나 ${tutK('bag')} 가방 창에서 원하는 부품을 끌어서 버릴 수 있습니다. 버린 부품은 다시 주울 수 있습니다.<br>떨어진 부품을 주우세요.`,
    keep: true, goal: () => GS.run.loot.length > 0 },
  { t: '등 뒤 동력 장치', d: '로봇 등 뒤의 초록빛 <b>후면 동력 장치</b>를 맞히면 과부하로 바로 쓰러집니다. 정면보다 뒤를 노리는 것이 빠릅니다.<br>등을 돌린 전투형의 빛나는 동력 장치를 쏘세요. 쓰러진 로봇의 남은 부품도 떨어집니다.',
    setup: () => { tutRobot('combat', 0, -4, Math.PI).tutTarget = true; }, hl: () => [tutE().parts.power], goal: () => tutE().dead },
  { t: '센서 헤드', d: '머리의 <b>센서 헤드</b>를 무력화하면 적의 시야와 조준이 크게 무너집니다. 위험한 적은 먼저 눈을 가리세요.<br>빛나는 센서 헤드를 무력화하세요.',
    setup: () => { tutRobot('combat', 0, -4, 0).tutTarget = true; }, hl: () => [tutE().parts.head], goal: () => partGone(tutE().parts.head) },
  { t: '무장 해제', d: '<b>주 무장</b>을 무력화하면 그 적은 더 이상 쏘지 못합니다. 떨어진 무장은 비싸게 팔립니다.<br>빛나는 주 무장을 무력화하세요.',
    setup: () => { tutRobot('combat', 0, -4, 0).tutTarget = true; }, hl: () => [tutE().parts.weapon], goal: () => partGone(tutE().parts.weapon) },
  { t: '중장갑형 · 다리', d: '이제부터 더 강한 총을 빌려 드립니다. 숫자키나 마우스 휠로 바꿀 수 있습니다.<br>중장갑형의 정면 장갑판은 탄이 거의 먹히지 않습니다. 장갑 사이로 드러난 <b>다리</b>를 노리세요. 다리를 잃으면 느려지거나 움직이지 못합니다.<br>빛나는 다리 하나를 무력화하세요.',
    setup: () => { if (!GS.run.tut.gave1) { GS.run.tut.gave1 = true; tutGive(['carbine']); } tutRobot('heavy', 0, -5, 0).tutTarget = true; }, hl: () => [tutE().parts.legL, tutE().parts.legR], goal: () => partGone(tutE().parts.legL) || partGone(tutE().parts.legR) },
  { t: '드론형 · 로터', d: '드론은 로터 네 개로 떠 있습니다. <b>로터 두 개</b>를 부수면 추락하고, 추락한 자리 근처에 있으면 함께 다칩니다.<br>위를 보고 빛나는 로터를 쏘세요.',
    setup: () => { const d = spawnDrone(0, -3, 4.2); d.tutPassive = true; d.noReward = true; d.tutTarget = true; }, hl: () => ROTORS.map(k => tutE().parts[k]), goal: () => tutE().dead || tutE().falling },
  { t: '저격형 · 센서', d: '망루의 저격형은 붉은 조준선을 겨누고, 선이 굵어지면 쏩니다. 엄폐물 뒤로 숨거나 계속 움직이세요.<br><b>센서 헤드</b>를 맞히면 조준이 끊깁니다. 빛나는 센서를 무력화하세요.',
    setup: () => { tutRobot('sniper', 0, -8, 0).tutTarget = true; }, hl: () => [tutE().parts.head], goal: () => partGone(tutE().parts.head) },
  { t: '자폭 거미', wait: true, d: '거미 전차가 풀어놓는 <b>자폭 거미</b>는 달려와서 터집니다. 등에 붉게 빛나는 <b>폭약 탱크</b>를 쏘면 다가오기 전에 부술 수 있습니다.<br>준비되면 E를 누르세요. 앞쪽에서 세 마리가 천천히 다가옵니다. (훈련장에서는 쓰러지지 않습니다)',
    setup: () => { for (let i = 0; i < 3; i++) { const m = spawnMite(-8 + i * 8, -22); m.cfg = Object.assign({}, m.cfg, { speed: 2.6 }); m.tutTarget = true; } }, hl: () => GS.enemies.filter(e => e.mite && !e.dead).map(e => e.parts.core), goal: () => GS.enemies.filter(e => e.mite).every(e => e.dead) },
  { t: '보스전 준비', info: true, d: '이제 보스 세 종의 약점을 연습합니다. 보스는 큰 부위를 순서대로 무너뜨려야 하는 기계입니다. 실전의 보스는 훨씬 단단하고 쉬지 않고 공격합니다.<br>보스전에서 쓸 정밀 소총과 카빈을 빌려 드립니다. 정밀 소총은 우클릭 조준경으로 멀리 있는 약점을 정확히 맞힐 수 있습니다.',
    setup: () => { if (!GS.run.tut.gave2) { GS.run.tut.gave2 = true; tutGive(['rifle', 'carbine']); } } },
  { t: 'REX-09 · 다리 관절', d: '렉스는 <b>다리의 무릎 관절</b>을 무력화하면 실전에서 주저앉습니다. 주저앉은 동안 등의 동력로가 열립니다.<br>빛나는 무릎 관절이 있는 다리 하나를 무력화하세요.',
    setup: () => tutBoss(spawnBoss(0, -14, 0)), hl: () => [tutE().parts.legL, tutE().parts.legR], goal: () => partGone(tutE().parts.legL) || partGone(tutE().parts.legR) },
  { t: 'REX-09 · 동력로 해치', d: '<b>동력로 해치</b>를 파괴하면 동력로가 항상 드러나 마지막 공격이 쉬워집니다. 렉스 등 위쪽에 있습니다.<br>옆이나 뒤로 돌아가 빛나는 해치를 파괴하세요.', keep: true,
    hl: () => [tutE().parts.hatch], goal: () => partGone(tutE().parts.hatch) },
  { t: 'ARACHNE · 다리', d: '거미 전차는 <b>다리 세 개</b>를 잃으면 주저앉고, 몸 아래의 동력로가 드러납니다.<br>빛나는 다리를 세 개 부수세요.',
    setup: () => tutBoss(spawnSpider(0, -12, 0)), hl: () => ['sl1', 'sl2', 'sl3', 'sl4', 'sl5', 'sl6'].map(k => tutE().parts[k]), goal: () => tutE().bs.broken >= 3 },
  { t: 'ARACHNE · 동력로', d: '주저앉은 동안 몸 아래에서 주황빛으로 빛나는 <b>동력로</b>를 공격해 정지시키세요. 실전에서는 몇 초 뒤 다시 일어서니 그 전에 최대한 많이 쏴야 합니다.', keep: true,
    hl: () => [tutE().parts.reactor], goal: () => tutE().dead },
  { t: '청룡 · 여의주', d: '청룡은 입 앞의 <b>여의주</b>가 보호막을 만들어 몸의 동력 마디를 지킵니다. 여의주를 먼저 부수면 마디를 공격할 수 있습니다.<br>빛나는 여의주를 파괴하세요.',
    setup: () => tutBoss(spawnDragon(4, 4, -8)), hl: () => [tutE().parts.pearl], goal: () => partGone(tutE().parts.pearl) },
  { t: '탈출과 정산', d: () => `작전의 끝은 언제나 <b>탈출</b>입니다. 화면의 <b>◇ 표지</b>가 탈출 지점 방향과 거리를 알려 줍니다. 목표를 끝내고 탈출 지점에서 ${tutK('use')} 를 누르면, 주운 부품을 팝니다. 손상된 만큼 값이 깎여 정산되고, 계약금과 처치 보상이 더해집니다.<br>목표를 끝내기 전에도 ${tutK('use')} 를 길게 누르면 조기 탈출할 수 있지만, 계약금은 받지 못합니다.<br>탈출 지점으로 가서 ${tutK('use')} 를 눌러 훈련을 마치세요.`,
    setup: () => { GS.run.objDone = true; } },
];
function tutPassiveTick(e, dt) {
  e.alert = false; e.pendingAlert = 0;
  partTick(e, dt);
  if (e.laser) e.laser.visible = false;
  if (e.drone) {
    for (const d of e.discs) if (d.userData.part.attached) d.rotation.y += dt * (e.falling ? 6 : 42);
    if (e.falling || rotorsWorking(e) <= 2) { e.tutPassive = false; updateDrone(e, dt); }
    else { e.root.position.y = 4.2 + Math.sin(GS.time * 1.3) * 0.25; e.yaw += dt * 0.3; e.root.rotation.y = e.yaw; }
    return;
  }
  if (e.dragon) { dragonCoilPose(e, 4, -8, GS.time, -0.6); return; }
  if (e.spider) {
    const B = e.bs; e.moveSpeed = 0;
    e.H = lerp(e.H, B.state === 'collapse' ? 0.95 : SPI.standH, clamp(dt * 4, 0, 1));
    spiderPose(e, dt); return;
  }
  if (e.type === 'rex') { animateRex(e, dt); return; }
  animateLegs(e, 0, dt);
}
function tutClear() {
  for (const e of GS.enemies) {
    for (const q of Object.values(e.parts)) { if (q.attached) removeHittables(q.meshes); GS.world.remove(q.group); }
    e.dead = true; GS.world.remove(e.root);
    if (e.bs) { if (e.bs.marker) GS.world.remove(e.bs.marker); if (e.bs.marker2) GS.world.remove(e.bs.marker2); if (e.bs.beam) GS.world.remove(e.bs.beam); }
    if (e.laser) GS.world.remove(e.laser);
  }
  GS.enemies.length = 0; for (const f of GS.fallers) GS.world.remove(f.obj); GS.fallers.length = 0;
  for (const m of GS.missiles) { GS.world.remove(m.mesh); if (m.marker) GS.world.remove(m.marker); } GS.missiles.length = 0;
  if (GS.run.tut.marker) { GS.world.remove(GS.run.tut.marker); GS.run.tut.marker = null; }
  for (const l of GS.loots) GS.world.remove(l.obj, l.ring, l.beam); GS.loots.length = 0;
}
// ---- 투시 표지: 몸에 가려도 보이는 약점 표시 (매 프레임 다시 찍음) ----
const XRAY = { pool: [], n: 0, tex: {} };
// 마름모 + 아래 글자 (글자별로 한 번만 그림)
function xrayTex(label) {
  if (XRAY.tex[label]) return XRAY.tex[label];
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d');
  g.save(); g.translate(128, 56); g.strokeStyle = '#fff'; g.lineWidth = 8; g.shadowColor = '#000'; g.shadowBlur = 6;
  g.beginPath(); g.moveTo(0, -44); g.lineTo(44, 0); g.lineTo(0, 44); g.lineTo(-44, 0); g.closePath(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); g.restore();
  if (label) { g.font = "bold 34px 'Noto Sans KR', sans-serif"; g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 8; g.fillText(label, 128, 148); }
  return (XRAY.tex[label] = new THREE.CanvasTexture(c));
}
function xrayMark(pos, color, alpha = 1, size = 1, label = '') {
  let sp = XRAY.pool[XRAY.n];
  if (!sp) {
    sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    sp.renderOrder = 999; sp.center.set(0.5, 0.65); scene.add(sp); XRAY.pool.push(sp);
  }
  XRAY.n++; sp.visible = true; sp.position.copy(pos);
  const t = xrayTex(label); if (sp.material.map !== t) { sp.material.map = t; sp.material.needsUpdate = true; }
  sp.material.color.setHex(color); sp.material.opacity = alpha; sp.scale.set(0.11 * size * 1.6, 0.11 * size, 1);
}
function xrayPart(q, color, alpha, size, label = '') { if (!q || !q.attached || !q.meshes || !q.meshes[0]) return; q.meshes[0].getWorldPosition(_v4); xrayMark(_v4, color, alpha, size, label); }
function xrayFlush() { for (let i = XRAY.n; i < XRAY.pool.length; i++) XRAY.pool[i].visible = false; XRAY.n = 0; }
function tutHighlight(on) {
  const T = GS.run.tut, st = TUT_STEPS[T.i];
  const list = on && st && st.hl ? (() => { try { return st.hl().filter(q => q && q.attached && q.state !== 'destroyed' && q.state !== 'disabled'); } catch (e) { return []; } })() : [];
  for (const q of T.hlParts || []) if (!list.includes(q)) { for (const m of q.meshes) if (m.userData.baseE) m.material.emissive.copy(m.userData.baseE); }
  const k = 0.45 + 0.45 * Math.sin(GS.time * 7);
  for (const q of list) if (q.flash <= 0) for (const m of q.meshes) m.material.emissive.setRGB(0.15 * k, 0.85 * k, 0.55 * k);
  for (const q of list) xrayPart(q, 0x5cffb0, 0.55 + 0.4 * k, 0.9);
  T.hlParts = list;
}
function tutConfirm() {
  const T = GS.run.tut, st = TUT_STEPS[T.i];
  if (st.info) { tutNext(); return; }
  if (st.wait && !T.started) { T.started = true; if (st.setup) st.setup(); SFX.ui(); }
}
function tutNext(skip) {
  const T = GS.run.tut; if (T.i >= TUT_STEPS.length - 1) return;
  tutHighlight(false);
  const nx = TUT_STEPS[T.i + 1];
  if (!nx.keep || skip) tutClear();
  T.i++; T.okT = 0; T.started = false;
  if (skip && nx.keep) { const prev = TUT_STEPS[T.i - 1]; if (prev.setup) prev.setup(); }
  if (nx.setup && !nx.wait) nx.setup();
  for (const w of GS.run.ws) w.reserve = maxReserve(w.id);
  player.hp = player.maxHp; SFX.ui();
  if (skip) addFeed('훈련 단계 건너뜀', 'p');
}
function updateTutorial(dt) {
  const T = GS.run.tut, st = TUT_STEPS[T.i];
  if (T.okT > 0) { T.okT -= dt; if (T.okT <= 0) tutNext(); }
  else if (st.goal && (!st.wait || T.started) && st.goal()) { T.okT = 2.2; SFX.objective(); popup('좋습니다', 'ok'); addFeed(`훈련 ${T.i + 1} 완료 · ${st.t}`, 'd'); }
  tutHighlight(T.okT <= 0);
  if (T.marker) T.marker.material.opacity = 0.6 + 0.35 * Math.sin(GS.time * 5);
  for (const w of GS.run.ws) if (w.reserve !== Infinity && w.reserve < maxReserve(w.id) * 0.5) w.reserve = maxReserve(w.id);
  const last = T.i === TUT_STEPS.length - 1;
  setHTML($('tut'), `<div class="th"><span class="lbl">훈련 ${T.i + 1} / ${TUT_STEPS.length}</span><b>${st.t}</b></div><div>${typeof st.d === 'function' ? st.d() : st.d}</div>` +
    `<div class="tk dim">${T.okT > 0 ? '<span class="ok">완료 · 다음 단계로 넘어갑니다</span>' : st.info ? `<b class="acc">${keyLabel(bind('use'))} 를 눌러 계속</b> · ` : st.wait && !T.started ? `<b class="acc">${keyLabel(bind('use'))} 를 눌러 시작</b> · ` : ''}${T.okT > 0 || last ? '' : `${keyLabel(bind('skip'))} 이 단계 건너뛰기 · Esc 일시정지에서 훈련 종료`}</div>`);
}
function endTutorial(done) {
  const first = done && !GS.save.tutDone;
  if (done) { GS.save.tutDone = true; GS.save.stats.T.clears++; }
  writeSave(); controls.unlock(); GS.mouseDown = GS.rightDown = false;
  goHub();
  if (first) achUnlock('graduate');
}

export { TUT_STEPS, buildRange, endTutorial, tutConfirm, tutNext, tutPassiveTick, updateTutorial, xrayFlush, xrayPart };
