import * as THREE from 'three';
import { GS } from '../core/state.js?v=30';
import { $, V3, clamp, lerp, setHTML } from '../core/utils.js?v=30';
import { bind, keyLabel, maxReserve } from '../data/data.js?v=30';
import { writeSave } from '../core/save.js?v=30';
import { SFX } from '../core/audio.js?v=30';
import { controls } from '../core/renderer.js?v=30';
import { addBox, crate, removeHittables } from '../world/world.js?v=30';
import { player } from '../player/playerState.js?v=30';
import { addExtraction, setEnv, spawnEnemy } from '../world/missions.js?v=30';
import { animateLegs } from '../enemies/ai.js?v=30';
import { animateRex, partTick, spawnBoss } from '../bosses/rex.js?v=30';
import { dragonCoilPose, spawnDragon } from '../bosses/dragon.js?v=30';
import { rotorsWorking, spawnDrone, updateDrone } from '../enemies/extra.js?v=30';
import { SPI, spawnMite, spawnSpider } from '../bosses/spider.js?v=30';
import { spiderPose } from './coop.js?v=30';
import { achUnlock } from '../meta/achievements.js?v=30';
import { addFeed, popup } from '../ui/hud.js?v=30';
import { goHub } from '../game/result.js?v=30';

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
const TUT_STEPS = [
  { t: '이동과 시점', d: () => `${tutK('fwd')} ${tutK('left')} ${tutK('back')} ${tutK('right')} 로 이동하고 마우스로 둘러봅니다. ${tutK('sprint')} 를 누르고 있으면 달립니다. 앞쪽의 주황색 원까지 걸어가세요.`,
    setup: () => tutMarker(0, 8), goal: () => Math.hypot(player.pos.x, player.pos.z - 8) < 1.6 },
  { t: '등 뒤 동력 장치', d: '로봇은 부위마다 따로 부서집니다. 등 뒤의 초록빛 <b>후면 동력 장치</b>를 맞히면 과부하로 바로 쓰러집니다. 등을 돌린 전투형의 뒤쪽을 노리세요.',
    setup: () => { tutRobot('combat', 0, -4, Math.PI).tutTarget = true; }, goal: () => tutE().dead },
  { t: '센서 헤드', d: '머리의 <b>센서 헤드</b>를 무력화하면 적의 시야와 조준이 크게 무너집니다. 전투형의 센서 헤드를 무력화하세요.',
    setup: () => { tutRobot('combat', 0, -4, 0).tutTarget = true; }, goal: () => partGone(tutE().parts.head) },
  { t: '무장 해제', d: '<b>주 무장</b>을 무력화하면 공격을 못 하고, 떨어진 무장은 온전한 상태로 회수해 비싸게 팔 수 있습니다. 주 무장을 무력화하세요.',
    setup: () => { tutRobot('combat', 0, -4, 0).tutTarget = true; }, goal: () => partGone(tutE().parts.weapon) },
  { t: '중장갑형 · 다리', d: '중장갑형의 정면 장갑판은 탄이 거의 먹히지 않습니다. 장갑 사이로 드러난 <b>다리</b>를 노리세요. 다리 하나를 무력화하세요.',
    setup: () => { tutRobot('heavy', 0, -5, 0).tutTarget = true; }, goal: () => partGone(tutE().parts.legL) || partGone(tutE().parts.legR) },
  { t: '드론형 · 로터', d: '드론은 로터 네 개로 떠 있습니다. <b>로터 두 개</b>를 부수면 추락합니다. 위를 보고 로터를 쏘세요.',
    setup: () => { const d = spawnDrone(0, -3, 4.2); d.tutPassive = true; d.noReward = true; d.tutTarget = true; }, goal: () => tutE().dead || tutE().falling },
  { t: '저격형 · 센서', d: '망루의 저격형은 붉은 조준선이 굵어지면 쏩니다. 조준선을 따라가 <b>센서 헤드</b>를 맞히면 조준이 끊깁니다. 센서를 무력화하세요.',
    setup: () => { tutRobot('sniper', 0, -8, 0).tutTarget = true; }, goal: () => partGone(tutE().parts.head) },
  { t: '자폭 거미', d: '거미 전차가 풀어놓는 자폭 거미는 달려와서 터집니다. 등에 붉게 빛나는 <b>폭약 탱크</b>를 쏴서 다가오기 전에 부수세요. 훈련장에서는 쓰러지지 않습니다.',
    setup: () => { for (let i = 0; i < 3; i++) { const m = spawnMite(-8 + i * 8, -20); m.cfg = Object.assign({}, m.cfg, { speed: 3.2 }); m.tutTarget = true; } }, goal: () => GS.enemies.filter(e => e.mite).every(e => e.dead) },
  { t: 'REX-09 · 다리 관절', d: '렉스는 <b>다리의 무릎 관절</b>을 무력화하면 실전에서 주저앉고, 그동안 등 쪽 동력로를 노릴 수 있습니다. 다리 하나를 무력화하세요.',
    setup: () => { const b = spawnBoss(0, -14, 0); b.tutPassive = true; b.noReward = true; b.tutTarget = true; }, goal: () => partGone(tutE().parts.legL) || partGone(tutE().parts.legR) },
  { t: 'REX-09 · 동력로 해치', d: '<b>동력로 해치</b>를 파괴하면 동력로가 항상 드러납니다. 렉스 뒤쪽으로 돌아가 해치를 파괴하세요.', keep: true,
    goal: () => partGone(tutE().parts.hatch) },
  { t: 'ARACHNE · 다리', d: '거미 전차는 <b>다리 세 개</b>를 잃으면 주저앉고 아래쪽 동력로가 드러납니다. 다리 세 개를 부수세요.',
    setup: () => { const sp = spawnSpider(0, -12, 0); sp.tutPassive = true; sp.noReward = true; sp.tutTarget = true; }, goal: () => tutE().bs.broken >= 3 },
  { t: 'ARACHNE · 동력로', d: '주저앉은 동안 몸 아래에서 주황빛으로 빛나는 <b>동력로</b>를 공격해 정지시키세요. 실전에서는 몇 초 뒤 다시 일어섭니다.', keep: true,
    goal: () => tutE().dead },
  { t: '청룡 · 여의주', d: '청룡은 입 앞의 <b>여의주</b>가 보호막을 만들어 동력 마디를 지킵니다. 여의주부터 부수세요.',
    setup: () => { const d = spawnDragon(4, 4, -8); d.tutPassive = true; d.noReward = true; d.tutTarget = true; }, goal: () => partGone(tutE().parts.pearl) },
  { t: '훈련 완료', d: () => `실전에서는 부품을 밟으면 가방 여유만큼 자동으로 줍고, 무거운 부품은 ${tutK('use')} 로 직접 줍습니다. 출발 위치의 탈출 지점으로 돌아가 ${tutK('use')} 를 눌러 훈련을 마치세요.`,
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
}
function tutNext(skip) {
  const T = GS.run.tut; if (T.i >= TUT_STEPS.length - 1) return;
  const nx = TUT_STEPS[T.i + 1];
  if (!nx.keep || skip) tutClear();
  T.i++; T.okT = 0;
  if (skip && nx.keep) { const prev = TUT_STEPS[T.i - 1]; if (prev.setup) prev.setup(); }
  if (nx.setup) nx.setup();
  for (const w of GS.run.ws) w.reserve = maxReserve(w.id);
  player.hp = player.maxHp; SFX.ui();
  if (skip) addFeed('훈련 단계 건너뜀', 'p');
}
function updateTutorial(dt) {
  const T = GS.run.tut, st = TUT_STEPS[T.i];
  if (T.okT > 0) { T.okT -= dt; if (T.okT <= 0) tutNext(); }
  else if (st.goal && st.goal()) { T.okT = 1.4; SFX.objective(); popup('좋습니다', 'ok'); addFeed(`훈련 ${T.i + 1} 완료 · ${st.t}`, 'd'); }
  if (T.marker) T.marker.material.opacity = 0.6 + 0.35 * Math.sin(GS.time * 5);
  for (const w of GS.run.ws) if (w.reserve !== Infinity && w.reserve < maxReserve(w.id) * 0.5) w.reserve = maxReserve(w.id);
  const last = T.i === TUT_STEPS.length - 1;
  setHTML($('tut'), `<div class="th"><span class="lbl">훈련 ${T.i + 1} / ${TUT_STEPS.length}</span><b>${st.t}</b></div><div>${typeof st.d === 'function' ? st.d() : st.d}</div>` +
    `<div class="tk dim">${T.okT > 0 ? '<span class="ok">완료 · 다음 단계로 넘어갑니다</span>' : last ? '' : `${keyLabel(bind('skip'))} 이 단계 건너뛰기 · Esc 일시정지에서 훈련 종료`}</div>`);
}
function endTutorial(done) {
  const first = done && !GS.save.tutDone;
  if (done) { GS.save.tutDone = true; GS.save.stats.T.clears++; }
  writeSave(); controls.unlock(); GS.mouseDown = GS.rightDown = false;
  goHub();
  if (first) achUnlock('graduate');
}

export { TUT_STEPS, buildRange, endTutorial, tutNext, tutPassiveTick, updateTutorial };
