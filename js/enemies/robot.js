import * as THREE from 'three';
import { ETYPES, PART_MULT, PART_NAMES, PART_TYPE, PRECISE, RDIM } from '../data/data.js?v=37';

// =====================================================================
//  로봇 생성 (부위별 독립 메시)
// =====================================================================
function buildRobot(type) {
  const cfg = ETYPES[type], D = RDIM[type], C = D.col;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const parts = {};
  const footH = D.foot[1];
  const hipY = footH + D.shin[1] + 0.04 + D.thigh[1];
  const torsoY = hipY + 0.16 + D.torso[1] / 2, torsoTop = torsoY + D.torso[1] / 2;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function P(id, parent = body) {
    const def = cfg.parts[id]; const g = new THREE.Group(); g.name = id; parent.add(g);
    const type = PART_TYPE[id];
    const p = { id, type, name: PART_NAMES[id], group: g, meshes: [], maxHp: def.hp, hp: def.hp, brkMax: def.brk || 0, brk: def.brk || 0,
      val: def.val, state: 'intact', precise: !!PRECISE[type], mult: PART_MULT[type], protectedBy: [], flash: 0, attached: true,
      children: [], enemy: null };
    parts[id] = p; return p;
  }
  function M(p, geo, color, x, y, z, o = {}) {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (o.emissive) mat.emissive.setHex(o.emissive);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz;
    m.userData = { part: p, hitMult: o.hitMult || 1, exposed: !!o.exposed, sub: o.sub || null,
      base: new THREE.Color(color), baseE: new THREE.Color(o.emissive || 0) };
    p.group.add(m); p.meshes.push(m); return m;
  }
  // 다리 (엉덩이 관절 피벗)
  for (const side of [-1, 1]) {
    const id = side < 0 ? 'legR' : 'legL';
    const p = P(id); p.group.position.set(side * D.legX, hipY, 0);
    M(p, box(...D.thigh), C.main, 0, -D.thigh[1] / 2, 0);
    M(p, new THREE.SphereGeometry(D.knee * 1.15, 10, 8), 0x8a5a2a, 0, -D.thigh[1] - 0.02, D.thigh[2] * 0.32, { hitMult: 1.6, exposed: true, sub: '무릎 관절' });
    const shinY = -D.thigh[1] - 0.04 - D.shin[1] / 2;
    M(p, box(...D.shin), C.main, 0, shinY, 0);
    M(p, box(...D.foot), C.dark, 0, -hipY + footH / 2, 0.05);
    if (D.heavy) {
      const gid = side < 0 ? 'guardR' : 'guardL';
      const gp = P(gid, p.group);
      M(gp, box(D.shin[0] + 0.08, D.shin[1] * 0.78, 0.07), C.acc, 0, shinY - 0.03, D.shin[2] / 2 + 0.05);
      p.children.push(gp);
    }
  }
  // 몸체 코어 + 하부 프레임 + 코어 노출부
  const core = P('core');
  M(core, box(...D.torso), C.main, 0, torsoY, 0);
  M(core, box(D.torso[0] * 0.78, 0.2, D.torso[2] * 0.78), C.dark, 0, hipY + 0.06, 0, { hitMult: 0.6, sub: '하부 프레임' });
  M(core, box(D.torso[0] * 0.36, D.torso[1] * 0.36, 0.04), 0x331100, 0, torsoY, D.torso[2] / 2 + 0.02, { emissive: 0xff7a1a, hitMult: 1.5, sub: '코어 노출부' });
  // 전면 장갑판
  const ar = P('armor');
  M(ar, box(...D.plate), C.acc, 0, torsoY + 0.01, D.torso[2] / 2 + 0.05 + D.plate[2] / 2);
  core.protectedBy.push('armor');
  // 머리
  const hd = P('head');
  M(hd, new THREE.CylinderGeometry(0.06, 0.075, D.neck + 0.04, 8), C.dark, 0, torsoTop + D.neck / 2, 0);
  const hy = torsoTop + D.neck + D.head[1] / 2;
  M(hd, box(...D.head), C.main, 0, hy, 0);
  M(hd, box(D.head[0] * 0.8, D.head[1] * 0.3, 0.04), 0x220000, 0, hy + 0.01, D.head[2] / 2 + 0.015, { emissive: C.eye, sub: '광학 센서' });
  if (D.antenna) M(hd, new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), C.dark, 0.1, hy + 0.25, -0.05);
  // 후면 동력 장치
  const pw = P('power');
  M(pw, box(...D.power), C.dark, 0, torsoY + 0.02, -(D.torso[2] / 2 + D.power[2] / 2));
  M(pw, box(D.power[0] * 0.62, D.power[1] * 0.5, 0.04), 0x002211, 0, torsoY + 0.02, -(D.torso[2] / 2 + D.power[2] + 0.02), { emissive: 0x3dff9a, sub: '동력 셀' });
  // 주 무장 (오른팔, -X)
  const sx = -(D.torso[0] / 2 + D.shoulderR * 0.95);
  const wp = P('weapon'); wp.group.position.set(sx, torsoTop - D.shoulderR, 0);
  M(wp, new THREE.SphereGeometry(D.shoulderR, 10, 8), C.dark, 0, 0, 0);
  M(wp, box(...D.upper), C.main, 0, -D.upper[1] / 2 - 0.02, 0);
  const ey = -D.upper[1] - 0.04, G = D.gun;
  M(wp, box(...G.body), C.dark, 0, ey, G.body[2] / 2 - 0.06);
  const bz = G.body[2] - 0.06 + G.len / 2;
  if (G.twin) {
    M(wp, new THREE.CylinderGeometry(G.r, G.r, G.len, 8), 0x1e1e1e, -0.07, ey + 0.04, bz, { rx: Math.PI / 2 });
    M(wp, new THREE.CylinderGeometry(G.r, G.r, G.len, 8), 0x1e1e1e, 0.07, ey + 0.04, bz, { rx: Math.PI / 2 });
  } else M(wp, new THREE.CylinderGeometry(G.r, G.r, G.len, 8), 0x1e1e1e, 0, ey, bz, { rx: Math.PI / 2 });
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, ey + (G.twin ? 0.04 : 0), G.body[2] - 0.06 + G.len + 0.02); wp.group.add(muzzle);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3a6a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat); glow.position.copy(muzzle.position); wp.group.add(glow);
  if (D.heavy) {
    const sh = P('shoulder', wp.group);
    M(sh, box(D.shoulderR * 2.4, 0.12, D.shoulderR * 2.5), C.acc, -0.04, D.shoulderR + 0.03, 0.02);
    M(sh, box(0.08, D.shoulderR * 2, D.shoulderR * 2.5), C.acc, -D.shoulderR - 0.06, 0, 0.02);
    wp.children.push(sh);
  }
  // 보조 팔 (왼팔, +X)
  const am = P('arm'); am.group.position.set(-sx, torsoTop - D.shoulderR, 0);
  M(am, new THREE.SphereGeometry(D.shoulderR * 0.9, 10, 8), C.dark, 0, 0, 0);
  M(am, box(...D.util), C.main, 0, -D.util[1] / 2 - 0.02, 0);
  M(am, box(D.util[0] * 0.9, D.util[0] * 0.9, D.util[1] * 0.9), C.main, 0, -D.util[1] - 0.04, D.util[1] * 0.35);
  M(am, box(D.util[0] * 1.2, D.util[0] * 0.5, 0.1), C.dark, 0, -D.util[1] - 0.04, D.util[1] * 0.85);
  root.scale.setScalar(cfg.scale);
  return { root, body, parts, muzzle, glow, eyeY: hy * cfg.scale, coreY: torsoY * cfg.scale };
}

function updatePartVisual(p) {
  for (const m of p.meshes) {
    const mat = m.material, ud = m.userData;
    if (p.state === 'intact') { mat.color.copy(ud.base); mat.emissive.copy(ud.baseE); }
    else if (p.state === 'damaged') {
      const k = p.maxHp > 0 ? 1 - p.hp / p.maxHp : 0.5;
      mat.color.copy(ud.base).lerp(_DMG, k * 0.55); mat.emissive.copy(ud.baseE).multiplyScalar(1 - k * 0.5).lerp(_REDE, k * 0.3);
    } else { mat.color.copy(ud.base).lerp(_DIS, 0.78); mat.emissive.setRGB(0, 0, 0); }
  }
}
const _DMG = new THREE.Color(0x2e2018), _DIS = new THREE.Color(0x1d1d1d), _REDE = new THREE.Color(0x401000);

export { buildRobot, updatePartVisual };
