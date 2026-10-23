import * as THREE from 'three';
import { GS } from '../core/state.js?v=36';
import { V3, clamp } from '../core/utils.js?v=36';
import { WEAPONS } from '../data/data.js?v=36';
import { GLOW, vmRoot } from '../core/renderer.js?v=36';
import { curWeapon } from './playerState.js?v=36';
import { ACH, achGot } from '../meta/achievements.js?v=36';

// =====================================================================
//  1인칭 총기 모델
// =====================================================================
function gunMeshPrep(o) {
  o.userData.bc = o.material.color.getHex(); o.userData.be = o.material.emissive.getHex();
  o.userData.hand = o.userData.bc === 0x4a4238;
  const gp = o.geometry.parameters || {}, uv = o.geometry.attributes.uv;
  if (o.geometry.type === 'BoxGeometry' && uv) {
    const w = gp.width, h = gp.height, d = gp.depth, T = 0.07;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / T, uv.getY(i) * dims[f][1] / T); }
    uv.needsUpdate = true;
  } else if (uv) { for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * ((gp.height || 0.1) / 0.07)); uv.needsUpdate = true; }
}
function vmMat(c, e) { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); if (e) m.emissive.setHex(e); return m; }
function buildGun(id) {
  const g = new THREE.Group();
  const B = (w, h, d, c, x, y, z, rx = 0, e) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), vmMat(c, e)); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  const C = (r, l, c, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), vmMat(c)); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; };
  let muzzle, adsPos;
  if (id === 'pistol') {
    B(0.046, 0.05, 0.21, 0x2c2e31, 0, 0.03, -0.05);
    B(0.04, 0.032, 0.17, 0x3d4044, 0, -0.008, -0.04);
    B(0.042, 0.115, 0.05, 0x26272a, 0, -0.07, 0.035, 0.22);
    B(0.008, 0.012, 0.01, 0x111111, 0, 0.061, -0.145, 0, 0xffa040);
    B(0.03, 0.012, 0.012, 0x111111, 0, 0.061, 0.045);
    B(0.075, 0.085, 0.095, 0x4a4238, 0, -0.095, 0.06);
    muzzle = V3(0, 0.03, -0.17); adsPos = V3(0, -0.07, -0.5);
  } else if (id === 'carbine') {
    B(0.062, 0.085, 0.34, 0x3a3e35, 0, 0, -0.05);
    B(0.056, 0.062, 0.2, 0x4b5241, 0, 0.004, -0.29);
    C(0.012, 0.16, 0x1d1e20, 0, 0.012, -0.46);
    B(0.036, 0.13, 0.065, 0x2a2c2a, 0, -0.095, -0.07, 0.22);
    B(0.042, 0.075, 0.17, 0x2f312e, 0, -0.012, 0.19);
    B(0.022, 0.03, 0.06, 0x1a1a1a, 0, 0.058, 0.02);
    B(0.01, 0.028, 0.012, 0x1a1a1a, 0, 0.05, -0.36, 0, 0xffa040);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.085, 0.03);
    B(0.07, 0.07, 0.11, 0x4a4238, -0.01, -0.05, -0.27);
    muzzle = V3(0, 0.012, -0.55); adsPos = V3(0, -0.079, -0.5);
  } else if (id === 'smg') {
    B(0.05, 0.075, 0.24, 0x2a2b2e, 0, 0, -0.04);
    C(0.011, 0.12, 0x1b1c1e, 0, 0.01, -0.21);
    B(0.03, 0.12, 0.04, 0x1e1f21, 0, -0.08, -0.09);
    B(0.036, 0.1, 0.05, 0x26272a, 0, -0.07, 0.04, 0.2);
    B(0.03, 0.03, 0.16, 0x3a3c3e, 0, 0.0, 0.16);
    B(0.01, 0.014, 0.01, 0x111111, 0, 0.044, -0.15, 0, 0xffa040);
    B(0.075, 0.085, 0.095, 0x4a4238, 0, -0.08, 0.05);
    muzzle = V3(0, 0.01, -0.28); adsPos = V3(0, -0.052, -0.48);
  } else if (id === 'revolver') {
    C(0.014, 0.2, 0x2c2e31, 0, 0.03, -0.13);
    B(0.04, 0.02, 0.2, 0x3a3c3e, 0, 0.048, -0.13);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.06, 8), vmMat(0x45474b)); drum.rotation.x = Math.PI / 2; drum.position.set(0, 0.022, -0.01); g.add(drum);
    B(0.04, 0.05, 0.08, 0x2c2e31, 0, 0.02, 0.04);
    B(0.036, 0.11, 0.05, 0x5a3e28, 0, -0.06, 0.07, 0.3);
    B(0.008, 0.012, 0.01, 0x111111, 0, 0.062, -0.22, 0, 0xffa040);
    B(0.075, 0.085, 0.095, 0x4a4238, 0, -0.095, 0.08);
    muzzle = V3(0, 0.03, -0.24); adsPos = V3(0, -0.062, -0.46);
  } else if (id === 'burst') {
    B(0.06, 0.08, 0.36, 0x46423a, 0, 0, -0.05);
    B(0.05, 0.05, 0.2, 0x2e302c, 0, 0.004, -0.31);
    C(0.012, 0.18, 0x1d1e20, 0, 0.012, -0.48);
    C(0.02, 0.12, 0x1b1c1e, 0, 0.068, -0.03);
    B(0.034, 0.12, 0.06, 0x2a2c2a, 0, -0.09, -0.08, 0.15);
    B(0.042, 0.075, 0.17, 0x3a3630, 0, -0.012, 0.19);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.085, 0.03);
    B(0.07, 0.07, 0.11, 0x4a4238, -0.01, -0.05, -0.27);
    muzzle = V3(0, 0.012, -0.58); adsPos = V3(0, -0.068, -0.44);
  } else if (id === 'autoshotgun') {
    B(0.075, 0.095, 0.34, 0x2e3330, 0, 0, -0.06);
    C(0.018, 0.3, 0x1b1c1e, 0, 0.02, -0.36);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), vmMat(0x3d4236)); drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.08, -0.1); g.add(drum);
    B(0.045, 0.09, 0.2, 0x262826, 0, -0.02, 0.2);
    B(0.01, 0.012, 0.01, 0x111111, 0, 0.055, -0.46, 0, 0xffa040);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.085, 0.05);
    B(0.07, 0.07, 0.1, 0x4a4238, -0.01, -0.05, -0.32);
    muzzle = V3(0, 0.02, -0.52); adsPos = V3(0, -0.06, -0.48);
  } else if (id === 'railgun') {
    B(0.07, 0.08, 0.5, 0x2a2e36, 0, 0, -0.08);
    for (let i = 0; i < 4; i++) B(0.085, 0.03, 0.04, 0x1a2a3a, 0, 0.012, -0.2 - i * 0.09, 0, 0x2a7ac8);
    B(0.02, 0.02, 0.5, 0x8ad8ff, 0.03, 0.012, -0.36, 0, 0x2a6aa8); B(0.02, 0.02, 0.5, 0x8ad8ff, -0.03, 0.012, -0.36, 0, 0x2a6aa8);
    C(0.024, 0.14, 0x1b1c1e, 0, 0.072, -0.05);
    B(0.05, 0.1, 0.2, 0x262a30, 0, -0.03, 0.24);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.085, 0.06);
    B(0.07, 0.07, 0.1, 0x4a4238, -0.01, -0.05, -0.3);
    muzzle = V3(0, 0.012, -0.62); adsPos = V3(0, -0.084, -0.44);
  } else if (id === 'launcher') {
    C(0.042, 0.42, 0x3b3f33, 0, 0.01, -0.18);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 8), vmMat(0x2c2e2a)); drum.rotation.x = Math.PI / 2; drum.position.set(0, -0.02, 0.05); g.add(drum);
    B(0.04, 0.11, 0.05, 0x26272a, 0, -0.1, 0.12, 0.25);
    B(0.05, 0.08, 0.18, 0x3a3630, 0, -0.02, 0.24);
    B(0.06, 0.03, 0.02, 0x111111, 0, 0.065, -0.1, 0, 0xffa040);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.1, 0.13);
    B(0.07, 0.07, 0.1, 0x4a4238, -0.01, -0.06, -0.25);
    muzzle = V3(0, 0.01, -0.4); adsPos = V3(0, -0.07, -0.46);
  } else if (id === 'shotgun') {
    B(0.066, 0.08, 0.26, 0x2c2d2f, 0, 0, -0.02);
    C(0.017, 0.42, 0x1b1c1e, 0, 0.022, -0.34);
    C(0.014, 0.36, 0x26272a, 0, -0.016, -0.31);
    B(0.062, 0.05, 0.15, 0x6a4a2e, 0, -0.018, -0.3);
    B(0.046, 0.088, 0.21, 0x5e4128, 0, -0.02, 0.21);
    B(0.01, 0.01, 0.01, 0x111111, 0, 0.045, -0.54, 0, 0xffa040);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.08, 0.05);
    B(0.07, 0.07, 0.1, 0x4a4238, -0.01, -0.05, -0.3);
    muzzle = V3(0, 0.022, -0.56); adsPos = V3(0, -0.056, -0.5);
  } else if (id === 'lmg') {
    B(0.088, 0.11, 0.36, 0x3c4236, 0, 0, -0.04);
    B(0.055, 0.055, 0.26, 0x2a2c2a, 0, 0.012, -0.33);
    C(0.016, 0.42, 0x1b1c1e, 0, 0.012, -0.46);
    B(0.1, 0.11, 0.13, 0x4b5338, 0.075, -0.075, -0.05);
    B(0.05, 0.09, 0.2, 0x30332e, 0, -0.01, 0.22);
    B(0.03, 0.035, 0.05, 0x1a1a1a, 0, 0.073, 0.03);
    B(0.012, 0.03, 0.012, 0x1a1a1a, 0, 0.06, -0.42, 0, 0xffa040);
    B(0.012, 0.09, 0.012, 0x2a2c2a, 0.025, -0.04, -0.52); B(0.012, 0.09, 0.012, 0x2a2c2a, -0.025, -0.04, -0.52);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.09, 0.05);
    muzzle = V3(0, 0.012, -0.68); adsPos = V3(0, -0.088, -0.5);
  } else if (id === 'amr') {
    B(0.07, 0.09, 0.5, 0x3a3c3e, 0, 0, -0.04);
    C(0.017, 0.62, 0x1b1c1e, 0, 0.014, -0.58);
    B(0.05, 0.036, 0.09, 0x222324, 0, 0.014, -0.92);
    C(0.034, 0.28, 0x18191a, 0, 0.092, -0.06);
    B(0.045, 0.045, 0.012, 0x0a0a0a, 0, 0.092, -0.2, 0, 0x553311);
    B(0.05, 0.1, 0.24, 0x2e3032, 0, -0.025, 0.27);
    B(0.04, 0.09, 0.07, 0x222222, 0, -0.075, -0.03);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.09, 0.07);
    muzzle = V3(0, 0.014, -0.97); adsPos = V3(0, -0.092, -0.45);
  } else {
    B(0.056, 0.072, 0.4, 0x5a4b37, 0, 0, -0.04);
    C(0.012, 0.44, 0x1d1e20, 0, 0.012, -0.45);
    C(0.026, 0.22, 0x1b1c1e, 0, 0.074, -0.05);
    B(0.04, 0.04, 0.012, 0x0a0a0a, 0, 0.074, -0.165, 0, 0x553311);
    B(0.012, 0.03, 0.012, 0x222222, 0.035, 0.02, 0.06);
    B(0.046, 0.095, 0.23, 0x4d3f2e, 0, -0.025, 0.23);
    B(0.03, 0.06, 0.06, 0x222222, 0, -0.06, -0.02);
    B(0.075, 0.085, 0.1, 0x4a4238, 0, -0.085, 0.05);
    B(0.07, 0.07, 0.11, 0x4a4238, -0.01, -0.05, -0.26);
    muzzle = V3(0, 0.012, -0.68); adsPos = V3(0, -0.074, -0.4);
  }
  // 총구 화염
  const fl = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ map: GLOW, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const fs = ['rifle', 'amr', 'shotgun', 'autoshotgun', 'revolver', 'launcher'].includes(id) ? 0.24 : id === 'railgun' ? 0.3 : 0.14;
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(fs, fs), fm); p.rotation.y = i * Math.PI / 3; fl.add(p); }
  const fl2 = new THREE.Mesh(new THREE.PlaneGeometry(0.06, id === 'rifle' ? 0.3 : 0.18), fm); fl2.rotation.x = Math.PI / 2; fl2.position.z = -0.06; fl.add(fl2);
  // 정조준 위치 자동 계산: 총의 가장 높은 부분이 조준점보다 아래 오른쪽에 오게 해서 목표를 가리지 않음
  if (!WEAPONS[id].scope) {
    const bb = new THREE.Box3().setFromObject(g);
    adsPos = V3(0.07 - bb.min.x * 0.5, -bb.max.y - 0.068, -0.56);
  }
  fl.position.copy(muzzle); fl.visible = false; g.add(fl);
  g.children.forEach(o => { if (o.isMesh) gunMeshPrep(o); });
  g.userData = { muzzle, adsPos, flash: fl };
  g.visible = false; vmRoot.add(g);
  return g;
}
const GUNS = {}; for (const id of Object.keys(WEAPONS)) GUNS[id] = buildGun(id);

// =====================================================================
//  총기 스킨
// =====================================================================
// 테마: pal = 몸체(b) · 어두운 금속(d) · 손잡이/개머리(f) · 발광(acc), tex = 무늬, emi = 빛나는 무늬
const SKIN_THEMES = {
  rex:    { name: '티라노 화석', boss: 'REX-09', pal: { b: 0xd8cab0, d: 0x5e3c26, f: 0x8c5c34, acc: 0xff6a1a }, tex: 'scale', deco: 'rex', desc: '뼈처럼 바랜 비늘 무늬, 총구 아래 송곳니와 등 위 골판.' },
  spider: { name: '아라크네', boss: 'ARACHNE', pal: { b: 0x1f1f25, d: 0x0e0e12, f: 0x2a171c, acc: 0xff1e3c }, tex: 'carbon', emi: 'web', emiK: 0.55, deco: 'spider', desc: '탄소 섬유 몸체에 붉은 거미줄, 옆구리의 모래시계 문양과 여섯 개의 다리.' },
  dragon: { name: '청룡', boss: '청룡', pal: { b: 0x1a6a70, d: 0xd0a030, f: 0x123f44, acc: 0x6af6ff }, tex: 'dscale', emi: 'dedge', emiK: 0.35, deco: 'dragon', desc: '청옥빛 비늘과 금빛 테두리, 금 뿔 두 개와 총구 아래 빛나는 여의주.' },
  core:   { name: '근원지', boss: '생산 코어', pal: { b: 0x2c323a, d: 0x14181d, f: 0x1e2832, acc: 0x66d8ff }, tex: 'plate', emi: 'circuit', emiK: 0.9, deco: 'core', desc: '하늘색 회로가 흐르는 장갑판, 총열을 감싸고 도는 에너지 고리.' },
  trio:   { name: '삼중 위협', boss: 'REX · ARACHNE · 청룡', pal: { b: 0x18181b, d: 0xcaa23c, f: 0x232326, acc: 0xffcf5a }, tex: 'carbon', emi: 'chevron', emiK: 0.45, deco: 'trio', desc: '무광 검정에 금 장식, 세 보스를 뜻하는 세 개의 보석.' },
  gold:   { name: '장인의 금장', boss: '무기 강화', pal: { b: 0xd9aa3e, d: 0x3d2c14, f: 0x6c3f1e, acc: 0xfff0b0 }, tex: 'engrave', deco: 'gold', desc: '덩굴 조각을 새긴 순금 몸체.' },
  rexC:    { name: '카오스 · 티라노', chaos: 0xff4a10, base: 'rex', desc: '검게 탄 화석 사이로 용암빛 균열이 맥박친다. 송곳니와 골판도 달아오른다.' },
  spiderC: { name: '카오스 · 아라크네', chaos: 0xff1040, base: 'spider', desc: '핏빛 균열과 떠다니는 파편, 붉게 타오르는 여섯 다리.' },
  dragonC: { name: '카오스 · 청룡', chaos: 0x30e8ff, base: 'dragon', desc: '먹빛 비늘 틈으로 번개가 흐르고, 여의주가 쉬지 않고 빛난다.' },
  lord:    { name: '카오스 · 군주', chaos: 0xffb020, base: 'lord', desc: '티라노의 송곳니, 청룡의 뿔, 세 보스의 보석을 두른 흑금. 카오스를 모두 넘어선 자의 총.' },
};
const ALL_GUNS = Object.keys(WEAPONS);
// 스킨: 어떤 테마를 어떤 총에 (all = 모든 총 세트)
const SKINS = {
  rex_pistol: { theme: 'rex', guns: ['pistol'] }, rex_shotgun: { theme: 'rex', guns: ['shotgun'] },
  spider_pistol: { theme: 'spider', guns: ['pistol'] }, spider_smg: { theme: 'spider', guns: ['smg'] },
  dragon_pistol: { theme: 'dragon', guns: ['pistol'] }, dragon_rifle: { theme: 'dragon', guns: ['rifle'] },
  trio_burst: { theme: 'trio', guns: ['burst'] }, trio_amr: { theme: 'trio', guns: ['amr'] }, trio_pistol: { theme: 'trio', guns: ['pistol'] },
  core_railgun: { theme: 'core', guns: ['railgun'] }, core_lmg: { theme: 'core', guns: ['lmg'] },
  gold_all: { theme: 'gold', guns: 'all' },
  rexC_all: { theme: 'rexC', guns: 'all' }, spiderC_all: { theme: 'spiderC', guns: 'all' }, dragonC_all: { theme: 'dragonC', guns: 'all' }, lord_all: { theme: 'lord', guns: 'all' },
};
const skinFits = (sid, gid) => { const k = SKINS[sid]; return !!k && (k.guns === 'all' || k.guns.includes(gid)); };
const skinAch = sid => ACH.find(a => a.skin === sid);
const skinOwned = sid => { const a = skinAch(sid); return !!a && achGot(a.id); };
const skinsFor = gid => Object.keys(SKINS).filter(sid => skinFits(sid, gid));
function skinSel(gid) { const sid = GS.save.skinSel && GS.save.skinSel[gid]; return sid && skinOwned(sid) && skinFits(sid, gid) ? sid : ''; }

// ---- 무늬 (캔버스로 그려 반복) ----
const SKIN_TEX = {};
function skinTex(kind) {
  if (SKIN_TEX[kind]) return SKIN_TEX[kind];
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const emi = ['web', 'dedge', 'circuit', 'chevron', 'crack'].includes(kind);
  g.fillStyle = emi ? '#000' : '#fff'; g.fillRect(0, 0, N, N);
  const line = (w, col) => { g.lineWidth = w; g.strokeStyle = col; };
  if (kind === 'scale') {         // 겹친 반달 비늘
    for (let r = -1; r < 6; r++) for (let q = -1; q < 6; q++) {
      const x = q * 28 + (r % 2 ? 14 : 0), y = r * 22;
      g.fillStyle = r % 2 ? '#ece6dc' : '#f7f3ec'; g.beginPath(); g.arc(x, y, 15, 0, Math.PI); g.fill();
      line(3, '#8d7a62'); g.beginPath(); g.arc(x, y, 15, 0.1, Math.PI - 0.1); g.stroke();
    }
  } else if (kind === 'carbon') { // 탄소 섬유 짜임
    for (let y = 0; y < N; y += 16) for (let x = 0; x < N; x += 16) { const o = ((x + y) / 16) % 2; g.fillStyle = o ? '#cfcfcf' : '#a8a8a8'; g.fillRect(x, y, 16, 16); g.fillStyle = o ? '#e4e4e4' : '#bcbcbc'; g.fillRect(x + (o ? 0 : 3), y + (o ? 3 : 0), o ? 16 : 10, o ? 10 : 16); }
  } else if (kind === 'dscale') { // 마름모 비늘
    for (let y = -16; y < N + 16; y += 16) for (let x = -16; x < N + 16; x += 24) {
      const ox = (y / 16) % 2 ? 12 : 0;
      g.fillStyle = (x + y) % 48 ? '#e6e6e6' : '#d2d2d2'; g.beginPath(); g.moveTo(x + ox, y - 10); g.lineTo(x + ox + 12, y); g.lineTo(x + ox, y + 10); g.lineTo(x + ox - 12, y); g.closePath(); g.fill();
      line(2, '#ffffff'); g.stroke();
    }
  } else if (kind === 'plate') {  // 장갑판 이음새
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, N, N); line(3, '#7a7a7a');
    g.strokeRect(4, 4, 58, 56); g.strokeRect(66, 4, 58, 26); g.strokeRect(66, 34, 58, 26); g.strokeRect(4, 66, 120, 58);
    g.fillStyle = '#9a9a9a'; for (const [x, y] of [[10, 10], [56, 10], [10, 54], [56, 54], [10, 72], [118, 72], [10, 118], [118, 118]]) { g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); }
  } else if (kind === 'engrave') { // 덩굴 조각
    g.fillStyle = '#fbf3e0'; g.fillRect(0, 0, N, N); line(2.5, '#9c7a38');
    for (let k = 0; k < 4; k++) { g.beginPath(); for (let t = 0; t <= 1.001; t += 0.02) { const x = t * N, y = 32 * k + 16 + Math.sin(t * Math.PI * 4 + k) * 9; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      for (let t = 0.0625; t < 1; t += 0.125) { const x = t * N, y = 32 * k + 16 + Math.sin(t * Math.PI * 4 + k) * 9; g.beginPath(); g.arc(x + 4, y - 5, 4, 0, Math.PI * 1.5); g.stroke(); } }
  } else if (kind === 'web') {    // 발광: 거미줄
    line(2, '#fff'); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 92, 64 + Math.sin(a) * 92); g.stroke(); }
    for (let r = 12; r < 92; r += 14) { g.beginPath(); for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI * 2, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r; k ? g.quadraticCurveTo(64 + Math.cos(a - 0.39) * r * 0.82, 64 + Math.sin(a - 0.39) * r * 0.82, x, y) : g.moveTo(x, y); } g.stroke(); }
  } else if (kind === 'dedge') {  // 발광: 비늘 테두리
    line(1.5, '#fff');
    for (let y = -16; y < N + 16; y += 16) for (let x = -16; x < N + 16; x += 24) { const ox = (y / 16) % 2 ? 12 : 0; g.beginPath(); g.moveTo(x + ox, y - 10); g.lineTo(x + ox + 12, y); g.lineTo(x + ox, y + 10); g.lineTo(x + ox - 12, y); g.closePath(); g.stroke(); }
  } else if (kind === 'circuit') { // 발광: 회로
    line(2.5, '#fff'); const R = (a, b) => a + Math.floor(Math.random() * (b - a));
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let k = 0; k < 14; k++) { let x = Math.floor(rnd() * 8) * 16 + 8, y = Math.floor(rnd() * 8) * 16 + 8; g.beginPath(); g.moveTo(x, y);
      for (let st = 0; st < 4; st++) { if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * 16; else y += (rnd() < 0.5 ? -1 : 1) * 16; g.lineTo(x, y); } g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
  } else if (kind === 'chevron') { // 발광: 금 셰브런
    line(3, '#fff'); for (let y = 8; y < N; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y + 14); g.lineTo(64, y); g.lineTo(96, y + 14); g.lineTo(128, y); g.stroke(); }
  } else if (kind === 'crack') {  // 발광: 균열
    let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let k = 0; k < 7; k++) { let x = rnd() * N, y = rnd() * N, a = rnd() * 6.28; line(1.5 + rnd() * 2.5, '#fff'); g.beginPath(); g.moveTo(x, y);
      for (let st = 0; st < 9; st++) { a += (rnd() - 0.5) * 1.4; x += Math.cos(a) * 11; y += Math.sin(a) * 11; g.lineTo(x, y);
        if (rnd() < 0.25) { const bx = x, by = y; let b = a + (rnd() < 0.5 ? 1 : -1); g.moveTo(bx + Math.cos(b) * 9, by + Math.sin(b) * 9); g.lineTo(bx, by); } } g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  const rp = { circuit: 0.45, web: 0.4, chevron: 0.55, crack: 0.5, dedge: 1, scale: 1, carbon: 1.4, dscale: 1, plate: 0.6, engrave: 0.7 }[kind] || 1; t.repeat.set(rp, rp);
  return (SKIN_TEX[kind] = t);
}

// ---- 총 크기 정보 (손 · 총구 화염 제외) ----
const _gib = new THREE.Box3();
function gunInfo(g) {
  const bb = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9 };
  for (const o of g.children) { if (!o.isMesh || o.userData.bc === undefined || o.userData.hand) continue;
    o.geometry.computeBoundingBox(); o.updateMatrix(); const b = _gib.copy(o.geometry.boundingBox).applyMatrix4(o.matrix);
    bb.minX = Math.min(bb.minX, b.min.x); bb.maxX = Math.max(bb.maxX, b.max.x);
    bb.minY = Math.min(bb.minY, b.min.y); bb.maxY = Math.max(bb.maxY, b.max.y);
    bb.minZ = Math.min(bb.minZ, b.min.z); bb.maxZ = Math.max(bb.maxZ, b.max.z); }
  const mz = g.userData.muzzle || { x: 0, y: 0.01, z: bb.minZ };
  bb.my = mz.y; bb.mz = mz.z; bb.len = bb.maxZ - bb.minZ; bb.hw = Math.max(0.02, (bb.maxX - bb.minX) / 2); bb.mid = (bb.minZ + bb.maxZ) / 2;
  return bb;
}

// ---- 장식 ----
function skinDeco(g, kind, pal, chaos, fx) {
  const D = new THREE.Group(); D.name = 'skinDeco'; g.add(D);
  const I = gunInfo(g);
  const mat = (c, e = 0, k = 1) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); if (e) { m.emissive.setHex(e); m.emissiveIntensity = k; } return m; };
  const glowM = c => mat(0x111111, c, 1.2);
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); D.add(o); return o; };
  const hot = chaos ? chaos : 0, boneC = chaos ? 0x2a2a2e : 0xf2ead8;
  const pulse = o => { o.material.userData.k0 = o.material.emissiveIntensity; if (fx) fx.pulse.push(o.material); return o; };
  if (kind === 'rex' || kind === 'lord') {
    const lordK = kind === 'lord';
    // 송곳니: 총구 아래로 두 줄
    const n = clamp(Math.round((I.mid - I.minZ) / 0.034), 3, 9), tm = mat(boneC, hot, 0.9);
    for (let i = 0; i < n; i++) { const z = I.minZ + 0.02 + i * 0.034, big = i === 0 || i === n - 1; for (const sx of [-1, 1]) {
      const t = add(new THREE.ConeGeometry(big ? 0.009 : 0.006, big ? 0.04 : 0.026, 5), tm, sx * Math.min(I.hw * 0.55, 0.016), I.my - 0.026 - (big ? 0.012 : 0.006), z, Math.PI, 0, sx * 0.12); if (hot) pulse(t); } }
    // 등 골판
    const k = lordK ? 0 : 5, pm = mat(chaos ? 0x1a1a1c : pal.d, hot ? hot : 0, 0.7);
    for (let i = 0; i < k; i++) { const u = i / (k - 1), h = 0.016 + 0.016 * Math.sin(u * Math.PI); const z = I.mid + 0.02 - u * (I.mid - I.minZ - 0.06);
      const pl = add(new THREE.BoxGeometry(0.006, h, h), pm, 0, I.maxY + h * 0.35, z, Math.PI / 4); if (hot) pulse(pl); }
    // 눈
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.004, 0.009, 0.016), glowM(chaos || pal.acc), sx * (I.hw + 0.002), I.my + 0.006, I.minZ + 0.035);
  }
  if (kind === 'spider') {
    const lm = mat(chaos ? 0x16161a : 0x15151a, hot, 0.5), jm = glowM(chaos || pal.acc);
    for (let i = 0; i < 3; i++) { const z = I.mid - 0.05 + i * 0.05; for (const sx of [-1, 1]) {
      const x0 = sx * (I.hw + 0.004), y0 = I.my - 0.005;
      const a = add(new THREE.BoxGeometry(0.007, 0.007, 0.06), lm, x0 + sx * 0.022, y0 + 0.022, z, 0, sx * (1.05 - i * 0.25), 0); a.rotation.order = 'YXZ'; a.rotation.x = -0.6; if (hot) pulse(a);
      add(new THREE.SphereGeometry(0.006, 6, 4), jm, x0 + sx * 0.042, y0 + 0.04, z + (i - 1) * 0.012);
      const b = add(new THREE.BoxGeometry(0.006, 0.006, 0.06), lm, x0 + sx * 0.055, y0 + 0.012, z + (i - 1) * 0.02, 0, sx * (1.05 - i * 0.25), 0); b.rotation.order = 'YXZ'; b.rotation.x = 0.9; if (hot) pulse(b);
    } }
    // 모래시계 문양
    for (const sx of [-1, 1]) for (const up of [1, -1]) { const c = add(new THREE.ConeGeometry(0.011, 0.016, 3), glowM(chaos || pal.acc), sx * (I.hw + 0.003), I.my - 0.02 + up * 0.008, I.mid + 0.03, 0, 0, Math.PI / 2 * sx + (up > 0 ? Math.PI : 0)); c.rotation.x = up > 0 ? 0 : Math.PI; }
    // 눈 무리
    for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.004, 6, 4), glowM(chaos || pal.acc), (i % 2 ? 1 : -1) * 0.008, I.maxY + 0.003 - (i > 1 ? 0.006 : 0), I.minZ + 0.06 + (i > 1 ? 0.01 : 0));
  }
  if (kind === 'dragon' || kind === 'lord') {
    const gm = mat(chaos ? 0x2a2418 : 0xe0b040, chaos ? hot : 0x3a2600, chaos ? 0.6 : 1);
    // 뿔 두 개 (뒤로 휘어짐)
    const hz = I.mid - I.len * 0.12;
    for (const sx of [-1, 1]) { const h1 = add(new THREE.ConeGeometry(0.008, 0.045, 6), gm, sx * (I.hw * 0.7), I.maxY + 0.012, hz, -1.15, 0, -sx * 0.45); if (hot) pulse(h1);
      const h2 = add(new THREE.ConeGeometry(0.005, 0.028, 6), gm, sx * (I.hw * 0.7 + 0.008), I.maxY + 0.026, hz + 0.026, -1.75, 0, -sx * 0.6); if (hot) pulse(h2); }
    if (kind === 'dragon') {
      // 수염: 총구 양옆에서 뒤로 흐름
      for (const sx of [-1, 1]) { const w1 = add(new THREE.BoxGeometry(0.004, 0.004, 0.07), mat(0xe8c060, chaos || 0x6a4a10, 0.6), sx * (I.hw + 0.012), I.my + 0.004, I.minZ + 0.05, 0.15, sx * 0.35, 0); pulse(w1);
        const w2 = add(new THREE.BoxGeometry(0.003, 0.003, 0.06), mat(0xe8c060, chaos || 0x6a4a10, 0.6), sx * (I.hw + 0.03), I.my - 0.006, I.minZ + 0.11, 0.35, sx * 0.1, 0); pulse(w2); }
      // 여의주 + 발톱
      const pr = add(new THREE.SphereGeometry(0.018, 14, 10), mat(0x0a2a30, chaos || pal.acc, 1.4), 0, I.my - 0.045, I.minZ + 0.06); pulse(pr);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(new THREE.ConeGeometry(0.004, 0.022, 4), gm, Math.cos(a) * 0.016, I.my - 0.03 + Math.sin(a) * 0.006, I.minZ + 0.06 + Math.sin(a) * 0.012, 0.2, 0, Math.PI + Math.cos(a) * 0.6); }
      // 등지느러미
      for (let i = 0; i < 3; i++) add(new THREE.ConeGeometry(0.008, 0.024, 3), gm, 0, I.maxY + 0.01, I.mid + (i - 1) * 0.05, -0.4, 0, 0);
    }
  }
  if (kind === 'core') {
    for (let i = 0; i < 3; i++) { const r = add(new THREE.TorusGeometry(0.03 + i * 0.006, 0.0035, 6, 28), mat(0x0a1a22, chaos || pal.acc, 1.3), 0, I.my, I.minZ + 0.05 + i * Math.min(0.07, I.len * 0.12), 0.25, 0, 0); pulse(r); if (fx) fx.spin.push([r, 1.5 + i * 0.7]); }
    const cb = add(new THREE.BoxGeometry(0.012, 0.02, 0.04), mat(0x0a1a22, pal.acc, 1.5), I.hw + 0.006, I.my - 0.01, I.mid); pulse(cb);
  }
  if (kind === 'trio' || kind === 'lord') {
    const gems = [0xff6a1a, 0xff1e3c, 0x6af6ff];
    for (const sx of [-1, 1]) gems.forEach((c, i) => { const o = add(new THREE.OctahedronGeometry(0.008), mat(0x111111, c, 1.4), sx * (I.hw + 0.004), I.my - 0.004, I.mid - 0.03 + i * 0.03); pulse(o); });
    add(new THREE.BoxGeometry(0.012, 0.005, I.len * 0.3), mat(chaos ? 0x2a2418 : 0xd4a83a, chaos ? hot : 0x2a1a00, 0.5), 0, I.maxY + 0.003, I.minZ + I.len * 0.22);
  }
  if (kind === 'gold') {
    add(new THREE.TorusGeometry(0.02, 0.005, 6, 20), mat(0xe8c050, 0x3a2600), 0, I.my, I.mz + 0.012);
  }
  if (chaos) {
    // 떠다니는 파편
    for (let i = 0; i < 6; i++) { const o = add(new THREE.OctahedronGeometry(0.006 + (i % 3) * 0.002), mat(0x0a0a0a, chaos, 1.6), 0, I.my, I.mid); pulse(o);
      if (fx) fx.orbit.push([o, I.mid, I.my, 0.06 + (i % 3) * 0.015, i / 6 * Math.PI * 2, 0.9 + (i % 2) * 0.6, I.len * 0.35]); }
  }
  return D;
}

// ---- 적용 / 해제 ----
const SKIN_FX = new Map();
function applySkin(g, gid, sid) {
  const old = g.getObjectByName('skinDeco'); if (old) g.remove(old);
  for (const o of g.children) { if (!o.isMesh || o.userData.bc === undefined) continue; const m = o.material;
    m.color.setHex(o.userData.bc); m.emissive.setHex(o.userData.be || 0); m.map = null; m.emissiveMap = null; m.emissiveIntensity = 1; m.needsUpdate = true; }
  SKIN_FX.delete(g); g.userData.skin = sid || '';
  const K = sid && SKINS[sid]; if (!K) return;
  const T = SKIN_THEMES[K.theme], chaos = T.chaos || 0, B = chaos ? (SKIN_THEMES[T.base] || SKIN_THEMES.trio) : T;
  const pal = chaos ? { b: 0x17171a, d: 0x0b0b0d, f: 0x1c1416, acc: chaos } : T.pal;
  const fx = { pulse: [], spin: [], orbit: [], chaos: !!chaos };
  const texK = chaos ? (T.base === 'rex' ? 'scale' : T.base === 'dragon' ? 'dscale' : 'carbon') : T.tex, emiK = chaos ? 'crack' : T.emi;
  for (const o of g.children) { if (!o.isMesh || o.userData.bc === undefined || o.userData.hand) continue; const m = o.material, bc = o.userData.bc;
    if (o.userData.be) { m.color.setHex(0x111111); m.emissive.setHex(pal.acc); continue; }   // 가늠쇠 등 원래 빛나던 점
    const r = (bc >> 16) & 255, gg = (bc >> 8) & 255, b = bc & 255, lum = (r + gg + b) / 3;
    const role = r > gg + 14 && r > 70 ? 'f' : lum < 0x26 ? 'd' : 'b';
    m.color.setHex(pal[role]); if (texK) m.map = skinTex(texK);
    if (emiK && role !== 'f') { m.emissiveMap = skinTex(emiK); m.emissive.setHex(pal.acc); m.emissiveIntensity = chaos ? 1 : (T.emiK || 0.5); m.userData.k0 = m.emissiveIntensity; fx.pulse.push(m); }
    m.needsUpdate = true; }
  skinDeco(g, chaos ? T.base : T.deco, pal, chaos, fx);
  SKIN_FX.set(g, fx);
}
// 1인칭 총에 저장된 스킨 입히기
function applySavedSkins() { for (const id of ALL_GUNS) if ((GUNS[id].userData.skin || '') !== skinSel(id)) applySkin(GUNS[id], id, skinSel(id)); }
// 매 프레임: 발광 맥박 · 고리 회전 · 파편 공전
function updateSkinFX(dt) {
  if (!GS.run) return; const g = GUNS[curWeapon().id], fx = SKIN_FX.get(g); if (!fx) return;
  const k = fx.chaos ? 0.75 + 0.55 * Math.sin(GS.time * 5.2) + 0.2 * Math.sin(GS.time * 17) : 0.8 + 0.35 * Math.sin(GS.time * 3);
  for (const m of fx.pulse) m.emissiveIntensity = k * (m.userData && m.userData.k0 || 1);
  for (const [o, sp] of fx.spin) o.rotation.z += dt * sp;
  for (const [o, cz, cy, r, a0, sp, span] of fx.orbit) { const a = a0 + GS.time * sp; o.position.set(Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, cz + Math.sin(a * 0.5) * span * 0.5); o.rotation.x += dt * 3; o.rotation.y += dt * 2; }
}
const HIP_POS = V3(0.21, -0.2, -0.6);

export { ALL_GUNS, GUNS, HIP_POS, SKINS, SKIN_THEMES, applySavedSkins, applySkin, skinAch, skinOwned, skinSel, skinsFor, updateSkinFX };
