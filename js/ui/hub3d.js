import * as THREE from 'three';
import { GS } from '../core/state.js?v=32';
import { V3, _v1, lerp, rand } from '../core/utils.js?v=32';
import { buildRobot } from '../enemies/robot.js?v=32';
import { buildCore } from '../bosses/core.js?v=32';
import { buildRex } from '../bosses/rex.js?v=32';
import { buildDragon, dragonCoilPose } from '../bosses/dragon.js?v=32';
import { buildDrone } from '../enemies/extra.js?v=32';
import { SPI, buildSpider, legIK } from '../bosses/spider.js?v=32';

// =====================================================================
//  거점 3D 배경 (격납고 + 임무별 대상 기계)
// =====================================================================
const hubScene = new THREE.Scene();
hubScene.background = new THREE.Color(0x0a0b0c);
hubScene.fog = new THREE.Fog(0x0a0b0c, 16, 52);
const hubCam = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
const HUB = { shows: {}, cur: '', fade: 0, camPos: V3(), camLook: V3(), built: false };
const HUB_FRAME = {
  A: { cam: V3(-5.2, 2.3, 10.5), look: V3(-1.5, 1.25, 0), light: 1, aim: V3(1, 1, 0), cone: 0.42 },
  B: { cam: V3(-5.4, 2.5, 11.2), look: V3(-1.6, 1.55, 0), light: 1, aim: V3(1, 1.4, 0), cone: 0.42 },
  C: { cam: V3(-15, 6.2, 34), look: V3(-5.2, 6.0, -1), light: 1.9, aim: V3(-1.5, 5.5, -1), cone: 0.62 },
  D: { cam: V3(-15, 4.6, 34), look: V3(-1.6, 5.0, -2), light: 1.8, aim: V3(3, 4.5, -4), cone: 0.62 },
  E: { cam: V3(-5.4, 2.6, 11.2), look: V3(-1.6, 1.7, 0), light: 1, aim: V3(1, 1.6, 0), cone: 0.45 },
  F: { cam: V3(-13, 5.4, 25), look: V3(-3.2, 3.0, -1), light: 1.7, aim: V3(0.5, 2.5, -1), cone: 0.6 },
  G: { cam: V3(-16, 7.5, 40), look: V3(-2.5, 5.0, -4), light: 2.0, aim: V3(1, 4, -3), cone: 0.75 },
  H: { cam: V3(-14, 6.5, 34), look: V3(-2.5, 5.2, -3), light: 2.0, aim: V3(1, 5, -3), cone: 0.72 },
};
function buildHubScene() {
  if (HUB.built) return; HUB.built = true;
  hubScene.add(new THREE.HemisphereLight(0x9a948a, 0x14110e, 0.55));
  const key = new THREE.SpotLight(0xffc27a, 520, 60, 0.42, 0.6, 1.5); key.position.set(-7, 13, 11); key.target.position.set(1, 1, 0);
  hubScene.add(key, key.target); HUB.key = key;
  const rim = new THREE.SpotLight(0xdad4ca, 260, 40, 0.6, 0.7, 1.6); rim.position.set(8, 9, -9); rim.target.position.set(1, 2, 0);
  hubScene.add(rim, rim.target); HUB.rim = rim;
  HUB.eye = new THREE.PointLight(0xff3020, 0, 14, 1.6); hubScene.add(HUB.eye);
  const under = new THREE.PointLight(0xe8a33d, 18, 9, 1.6); under.position.set(1.2, 0.3, 0); hubScene.add(under); HUB.under = under;
  // 바닥 격자
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#141516'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  g.strokeStyle = 'rgba(232,163,61,.14)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(20, 20); tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; hubScene.add(floor);
  // 받침대 + 발광 링
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.22, 48), new THREE.MeshLambertMaterial({ color: 0x1d1f21 }));
  ped.position.set(1.2, 0.11, 0); hubScene.add(ped);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.25, 64), new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(1.2, 0.235, 0); hubScene.add(ring); HUB.ring = ring;
  // 격납고 벽 · 기둥 · 경고 줄무늬
  const wallMatH = new THREE.MeshLambertMaterial({ color: 0x1a1b1d });
  const back = new THREE.Mesh(new THREE.BoxGeometry(70, 22, 1), wallMatH); back.position.set(0, 11, -16); hubScene.add(back);
  for (const x of [-18, -6, 8, 20]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.6, 22, 1.6), new THREE.MeshLambertMaterial({ color: 0x222427 })); col.position.set(x, 11, -14.6); hubScene.add(col);
  }
  const sc = document.createElement('canvas'); sc.width = 128; sc.height = 16; const sg = sc.getContext('2d');
  for (let i = -2; i < 12; i++) { sg.fillStyle = i % 2 ? '#e8a33d' : '#151515'; sg.beginPath(); sg.moveTo(i * 16, 16); sg.lineTo(i * 16 + 16, 16); sg.lineTo(i * 16 + 32, 0); sg.lineTo(i * 16 + 16, 0); sg.fill(); }
  const stex = new THREE.CanvasTexture(sc); stex.wrapS = THREE.RepeatWrapping; stex.repeat.set(12, 1); stex.colorSpace = THREE.SRGBColorSpace;
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(70, 0.5), new THREE.MeshLambertMaterial({ map: stex })); stripe.position.set(0, 0.3, -15.45); hubScene.add(stripe);
  // 먼지
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rand(-14, 14); pos[i * 3 + 1] = rand(0, 12); pos[i * 3 + 2] = rand(-12, 10); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  HUB.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xbfae90, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
  hubScene.add(HUB.dust);
  // 임무별 전시 기계
  const face = (r, x, z, cam, off = 0) => { r.position.set(x, 0.22, z); r.rotation.y = Math.atan2(cam.x - x, cam.z - z) + off; };
  const A = new THREE.Group(), sA = buildRobot('scout'), cA = buildRobot('combat');
  face(sA.root, 0.2, 0.6, HUB_FRAME.A.cam, -0.35); face(cA.root, 2.2, -0.9, HUB_FRAME.A.cam, -0.55); A.add(sA.root, cA.root);
  const B = new THREE.Group(), hB = buildRobot('heavy'); face(hB.root, 1.2, 0, HUB_FRAME.B.cam, -0.5); B.add(hB.root);
  const C = new THREE.Group(), rC = buildRex(); face(rC.root, 2.2, -1.5, HUB_FRAME.C.cam, -1.25); C.add(rC.root);
  const D = new THREE.Group(), dD = buildDragon(); dragonCoilPose(dD, 1.2, 0, 0); D.add(dD.root);
  const E = new THREE.Group(), snE = buildRobot('sniper'), drE = buildDrone(); face(snE.root, 2.0, -0.8, HUB_FRAME.E.cam, -0.45); drE.root.position.set(-0.2, 2.6, 1.0); drE.root.rotation.y = 0.9; E.add(snE.root, drE.root);
  const F = new THREE.Group(), spF = buildSpider(); spF.root.position.set(1.2, 0.22, -1.2); spF.root.rotation.y = Math.atan2(HUB_FRAME.F.cam.x - 1.2, HUB_FRAME.F.cam.z + 1.2) - 0.55; F.add(spF.root);
  const G = new THREE.Group(), rG = buildRex(), sG = buildSpider(), dG = buildDragon();
  face(rG.root, -5.5, -3, HUB_FRAME.G.cam, -1.0); sG.root.position.set(7.5, 0.22, -2); sG.root.rotation.y = -0.9; G.add(rG.root, sG.root, dG.root);
  const Hg = new THREE.Group(), cH = buildCore(); cH.root.position.set(1.2, 0.22, -3); cH.root.scale.setScalar(0.62); Hg.add(cH.root);
  HUB.shows = { H: { g: Hg, bots: [], fcore: cH }, G: { g: G, bots: [], rex: rG, spider: sG, dragon: dG, dx: -9, dz: -7, dy: 5.5 }, A: { g: A, bots: [sA, cA] }, B: { g: B, bots: [hB] }, C: { g: C, bots: [rC], rex: rC }, D: { g: D, bots: [], dragon: dD }, E: { g: E, bots: [snE], drone: drE }, F: { g: F, bots: [], spider: spF } };
  rC.root.updateMatrixWorld(true); const eyeM = rC.parts.head.meshes.find(m => m.userData.sub === '광학 센서');
  eyeM.getWorldPosition(HUB.eye.position); HUB.eye.position.add(V3(-1.2, 0.6, 1.6));
  for (const k in HUB.shows) { HUB.shows[k].g.visible = false; hubScene.add(HUB.shows[k].g); }
  const f = HUB_FRAME.A; HUB.camPos.copy(f.cam); HUB.camLook.copy(f.look);
}
function hubShow(id) {
  buildHubScene();
  if (HUB.cur === id) return;
  for (const k in HUB.shows) HUB.shows[k].g.visible = k === id;
  HUB.cur = id; HUB.fade = 0;
}
function updateHub3D(dt) {
  buildHubScene();
  const f = HUB_FRAME[HUB.cur] || HUB_FRAME.A;
  HUB.fade = Math.min(1, HUB.fade + dt * 1.6);
  const fl = HUB.fade < 0.35 ? (Math.random() < 0.5 ? 0.2 : 1) * HUB.fade / 0.35 : 1;   // 조명 점등 깜빡임
  HUB.key.intensity = 520 * f.light * fl; HUB.rim.intensity = 260 * f.light * fl; HUB.under.intensity = 18 * fl;
  HUB.ring.material.opacity = 0.45 + 0.25 * Math.sin(GS.time * 2);
  HUB.key.target.position.lerp(f.aim, Math.min(1, dt * 3)); HUB.key.angle = lerp(HUB.key.angle, f.cone, Math.min(1, dt * 3));
  HUB.eye.intensity = HUB.cur === 'C' ? (40 + 25 * Math.sin(GS.time * 3)) * fl : 0;
  HUB.camPos.lerp(f.cam, Math.min(1, dt * 3)); HUB.camLook.lerp(f.look, Math.min(1, dt * 3));
  hubCam.position.copy(HUB.camPos).add(_v1.set(Math.sin(GS.time * 0.23) * 0.35, Math.sin(GS.time * 0.31) * 0.12, 0));
  hubCam.lookAt(HUB.camLook);
  // 먼지
  const a = HUB.dust.geometry.attributes.position;
  for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.12; if (y > 12) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(GS.time * 0.5 + i) * dt * 0.05); }
  a.needsUpdate = true;
  // 대기 동작
  const show = HUB.shows[HUB.cur]; if (!show) return;
  if (show.fcore) { show.fcore.arms.rotation.y = GS.time * 0.3; show.fcore.reactorM.material.emissive.setHex(0x66d8ff).multiplyScalar(0.6 + 0.4 * Math.sin(GS.time * 3)); }
  show.bots.forEach((b, i) => {
    const t = GS.time + i * 1.7;
    b.body.position.y = Math.sin(t * 1.6) * 0.02;
    if (b.parts.head && b.parts.head.group && !show.rex) b.parts.head.group.rotation.y = Math.sin(t * 0.5) * 0.45;
    if (b.parts.weapon && b.parts.weapon.group) b.parts.weapon.group.rotation.x = -0.15 + Math.sin(t * 0.7) * 0.06;
  });
  if (show.drone) { const d = show.drone; for (const m of d.discs) m.rotation.y += dt * 40; d.root.position.y = 2.6 + Math.sin(GS.time * 1.4) * 0.12; d.body.rotation.z = Math.sin(GS.time * 0.9) * 0.08; }
  if (show.spider) {
    const sp = show.spider, t = GS.time; sp.body.position.y = SPI.standH + Math.sin(t * 1.1) * 0.06;
    const lift = (t % 8) > 6.6 ? Math.sin(((t % 8) - 6.6) / 1.4 * Math.PI) * 2 : 0;
    for (const L of sp.legs) legIK(L, 3.6 + Math.sin(t * 0.8 + L.idx) * 0.08, SPI.standH - 0.1 - (L.idx === 0 ? lift : 0));
    sp.tubes.rotation.x = -0.25 + Math.sin(t * 0.5) * 0.15;
    for (const m of sp.eyes) m.material.emissive.setHex(0xff3020).multiplyScalar(0.7 + 0.3 * Math.sin(t * 3) + lift * 0.4);
  }
  if (show.dragon) {
    const d = show.dragon; dragonCoilPose(d, show.dx ?? 1.2, show.dz ?? 0, GS.time, show.dy || 0);
    d.parts.jaw.group.rotation.x = 0.1 + Math.max(0, Math.sin(GS.time * 0.7)) * 0.35;
    d.mglow.material.opacity = Math.max(0, Math.sin(GS.time * 0.7)) * 0.7;
    if (d.parts.pearl.glowSprite) d.parts.pearl.glowSprite.material.opacity = 0.5 + 0.25 * Math.sin(GS.time * 3);
  }
  if (show.rex) {
    const P = show.rex.parts, t = GS.time;
    P.head.group.rotation.x = -0.12 + Math.sin(t * 0.6) * 0.08;
    const roar = (t % 9) > 7.6 ? Math.sin(((t % 9) - 7.6) / 1.4 * Math.PI) : 0;
    P.jaw.group.rotation.x = 0.06 + roar * 0.5; P.head.group.rotation.x -= roar * 0.35;
    P.tail.group.rotation.y = Math.sin(t * 0.8) * 0.22;
    show.rex.body.position.y = Math.sin(t * 1.1) * 0.05;
    for (const m of P.head.meshes) if (m.userData.sub === '광학 센서') m.material.emissive.setHex(0xff3020).multiplyScalar(0.7 + 0.3 * Math.sin(t * 3) + roar);
  }
}

export { hubCam, hubScene, hubShow, updateHub3D };
