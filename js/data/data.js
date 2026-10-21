import { GS } from '../core/state.js?v=30';

// =====================================================================
//  데이터: 무기 / 장비 / 적 / 임무
// =====================================================================
const WEAPONS = {
  pistol: { id: 'pistol', name: 'P-9 기본 권총', price: 0, dmg: 20, interval: 0.2, auto: false, mag: 12, reserve: Infinity,
    reload: 1.1, hipSpread: 0.0045, adsSpread: 0.0008, moveSpread: 0.008, bloom: 0.002, bloomMax: 0.01,
    recoil: 0.022, recoilYaw: 0.004, kick: 1, adsFov: 58, armorMult: 0.6, precisionMult: 1.2, range: 110, moveMult: 1,
    desc: '시작 지급품. 탄약 걱정이 없고 정확하다. 장갑에는 약하다.' },
  carbine: { id: 'carbine', name: 'K-31 연사형 카빈', price: 3500, dmg: 14, interval: 0.085, auto: true, mag: 32, reserve: 192,
    reload: 1.9, hipSpread: 0.0075, adsSpread: 0.0025, moveSpread: 0.01, bloom: 0.0022, bloomMax: 0.022,
    recoil: 0.0105, recoilYaw: 0.006, kick: 0.6, adsFov: 54, armorMult: 0.5, precisionMult: 0.85, range: 90, moveMult: 0.97,
    desc: '높은 연사력과 큰 탄창. 탄약 소모가 많고 연사할수록 탄이 퍼진다.' },
  rifle: { id: 'rifle', name: 'LR-7 정밀 소총', price: 6500, dmg: 75, interval: 0.95, auto: false, mag: 5, reserve: 30,
    reload: 2.5, hipSpread: 0.022, adsSpread: 0.0, moveSpread: 0.028, bloom: 0, bloomMax: 0,
    recoil: 0.065, recoilYaw: 0.012, kick: 2.2, adsFov: 20, armorMult: 1.25, precisionMult: 1.6, range: 200, moveMult: 0.9, scope: true,
    desc: '조준경 장착. 약점과 장갑에 강하지만, 약한 부품은 한 발에 파괴될 수 있다.' },
  shotgun: { id: 'shotgun', name: 'SG-12 산탄총', price: 4500, dmg: 9, pellets: 8, pelletSpread: 0.045, interval: 0.75, auto: false, mag: 6, reserve: 42,
    reload: 2.6, hipSpread: 0.004, adsSpread: 0.002, moveSpread: 0.006, bloom: 0, bloomMax: 0,
    recoil: 0.05, recoilYaw: 0.01, kick: 2, adsFov: 60, armorMult: 0.55, precisionMult: 1.0, range: 45, falloff: [8, 30], moveMult: 0.97,
    desc: '산탄 8발. 근거리에서 큰 부위를 순식간에 무력화하지만, 거리가 멀어지면 위력이 크게 떨어진다.' },
  lmg: { id: 'lmg', name: 'M-60 경기관총', price: 8000, dmg: 15, interval: 0.1, auto: true, mag: 80, reserve: 240,
    reload: 4.6, hipSpread: 0.012, adsSpread: 0.006, moveSpread: 0.022, bloom: 0.0032, bloomMax: 0.034,
    recoil: 0.016, recoilYaw: 0.01, kick: 0.85, adsFov: 52, armorMult: 0.6, precisionMult: 0.8, range: 110, moveMult: 0.78,
    desc: '80발 탄띠로 오래 쏠 수 있다. 길게 쏠수록 탄이 크게 퍼지므로 끊어 쏴야 한다. 재장전이 길고, 들고 있으면 이동이 느려진다.' },
  amr: { id: 'amr', name: 'X-50 대물 저격총', price: 12000, dmg: 170, interval: 1.5, auto: false, mag: 4, reserve: 24,
    reload: 3.2, hipSpread: 0.03, adsSpread: 0.0, moveSpread: 0.04, bloom: 0, bloomMax: 0,
    recoil: 0.11, recoilYaw: 0.02, kick: 3, adsFov: 16, armorMult: 2.0, precisionMult: 1.4, range: 260, moveMult: 0.85, scope: true,
    desc: '장갑판을 한두 발에 뜯어내는 대형 표적용 저격총. 작은 로봇의 부품은 대부분 파괴된다.' },
};
Object.assign(WEAPONS, {
  smg: { id: 'smg', name: 'V-9 기관단총', price: 2800, dmg: 11, interval: 0.065, auto: true, mag: 30, reserve: 210,
    reload: 1.6, hipSpread: 0.009, adsSpread: 0.004, moveSpread: 0.006, bloom: 0.0018, bloomMax: 0.018,
    recoil: 0.007, recoilYaw: 0.006, kick: 0.45, adsFov: 58, armorMult: 0.4, precisionMult: 0.9, range: 70, moveMult: 1.08,
    desc: '가볍고 빠른 기관단총. 이동하며 쏘기 좋지만 장갑에는 거의 통하지 않는다.' },
  revolver: { id: 'revolver', name: 'R-44 리볼버', price: 2200, dmg: 46, interval: 0.42, auto: false, mag: 6, reserve: 48,
    reload: 2.1, hipSpread: 0.005, adsSpread: 0.0008, moveSpread: 0.012, bloom: 0, bloomMax: 0,
    recoil: 0.05, recoilYaw: 0.01, kick: 1.8, adsFov: 56, armorMult: 0.85, precisionMult: 1.5, range: 120, moveMult: 1,
    desc: '6연발 대구경 리볼버. 느리지만 한 발 한 발이 정확하고 약점에 강하다.' },
  burst: { id: 'burst', name: 'BR-3 점사 소총', price: 5500, dmg: 22, burst: 3, burstGap: 0.065, interval: 0.42, auto: false, mag: 30, reserve: 180,
    reload: 2.0, hipSpread: 0.005, adsSpread: 0.0012, moveSpread: 0.01, bloom: 0.001, bloomMax: 0.006,
    recoil: 0.009, recoilYaw: 0.004, kick: 0.7, adsFov: 46, armorMult: 0.75, precisionMult: 1.25, range: 150, moveMult: 0.97,
    desc: '한 번 당기면 3발 점사. 중거리 관절 사격에 특화된 소총.' },
  autoshotgun: { id: 'autoshotgun', name: 'AS-20 자동 산탄총', price: 9500, dmg: 8, pellets: 7, pelletSpread: 0.05, interval: 0.24, auto: true, mag: 12, reserve: 72,
    reload: 3.0, hipSpread: 0.004, adsSpread: 0.002, moveSpread: 0.006, bloom: 0.004, bloomMax: 0.02,
    recoil: 0.035, recoilYaw: 0.01, kick: 1.5, adsFov: 62, armorMult: 0.55, precisionMult: 1.0, range: 40, falloff: [7, 26], moveMult: 0.95,
    desc: '탄창식 자동 산탄총. 근거리 화력은 최강이지만 탄 소모가 크다.' },
  launcher: { id: 'launcher', name: 'GL-40 유탄발사기', price: 10500, dmg: 0, explosive: { r: 3.4, dmg: 130 }, projSpeed: 38, interval: 0.9, auto: false, mag: 4, reserve: 20,
    reload: 3.2, hipSpread: 0.004, adsSpread: 0.001, moveSpread: 0.008, bloom: 0, bloomMax: 0,
    recoil: 0.06, recoilYaw: 0.012, kick: 2.2, adsFov: 56, armorMult: 1, precisionMult: 1, range: 120, moveMult: 0.92,
    desc: '착탄 시 폭발해 범위 안의 모든 부위에 피해. 부품이 많이 부서져 수익은 낮다.' },
  railgun: { id: 'railgun', name: 'RG-1 레일건', price: 16000, dmg: 110, pierce: 3, charge: 1.4, interval: 0.45, auto: false, mag: 4, reserve: 28,
    reload: 3.0, hipSpread: 0.012, adsSpread: 0.0, moveSpread: 0.02, bloom: 0, bloomMax: 0,
    recoil: 0.06, recoilYaw: 0.012, kick: 2.4, adsFov: 34, armorMult: 1.4, precisionMult: 1.3, range: 250, moveMult: 0.9,
    desc: '누르고 있으면 충전, 놓으면 발사. 충전할수록 피해와 관통 수가 늘고, 완전 충전하면 굵은 전자기 빔이 최대 6개 부위를 꿰뚫는다.' },
});
const UTILS = {
  pouch: { id: 'pouch', name: '확장 탄약 주머니', price: 3000, desc: '주 무기 예비 탄약이 1.5배로 늘어난다.' },
  medkit: { id: 'medkit', name: '응급 키트', price: 3500, desc: '임무마다 2회, H 키로 최대 체력의 60%를 즉시 회복한다.' },
  regen: { id: 'regen', name: '재생 모듈', price: 4500, desc: '피격 후 체력 재생이 5초가 아니라 3초 만에 시작되고, 속도도 2배가 된다.' },
  radar: { id: 'radar', name: '전술 레이더', price: 3000, desc: '화면 왼쪽 아래에 반경 35m 안의 적 위치를 표시한다.' },
};
// 가방 · 무게
const BAGS = [
  { lvl: 0, name: '기본 배낭', cap: 25 },
  { lvl: 1, id: 'bag1', name: '전술 배낭', price: 4000, cap: 35, desc: '가방 용량 35kg. 부품을 더 많이 들고 나올 수 있다.' },
  { lvl: 2, id: 'bag2', name: '대형 배낭', price: 11000, cap: 50, desc: '가방 용량 50kg. 전술 배낭 보유 필요.' },
  { lvl: 3, id: 'bag3', name: '화물 외골격', price: 26000, cap: 70, desc: '가방 용량 70kg. 보스 부품도 여러 개 짊어진다. 대형 배낭 보유 필요.' },
];
const GUN_KG = { pistol: 0, revolver: 1, smg: 1.5, carbine: 2, shotgun: 2.5, burst: 2.5, rifle: 3, lmg: 6, autoshotgun: 3.5, launcher: 4, amr: 7, railgun: 6 };
const MAX_CARRY = 3;
function partKg(v) { return Math.round((0.5 + 0.03 * Math.min(v, 200) + 0.012 * Math.max(0, v - 200)) * 10) / 10; }
// 키 설정 (동작 · 이름 · 기본 키)
const KEYDEF = [
  ['fwd', '앞으로', 'KeyW'], ['back', '뒤로', 'KeyS'], ['left', '왼쪽', 'KeyA'], ['right', '오른쪽', 'KeyD'],
  ['sprint', '달리기', 'ShiftLeft'], ['jump', '점프', 'Space'], ['crouch', '앉기', 'KeyC'], ['reload', '재장전', 'KeyR'],
  ['use', '상호작용 · 무거운 부품 줍기', 'KeyE'], ['drop', '부품 버리기', 'KeyX'], ['swap', '이전 무기', 'KeyQ'], ['heal', '회복', 'KeyH'],
  ['w1', '무기 1', 'Digit1'], ['w2', '무기 2', 'Digit2'], ['w3', '무기 3', 'Digit3'], ['w4', '무기 4', 'Digit4'],
  ['sk1', '스킬 1', 'KeyF'], ['sk2', '스킬 2', 'KeyV'], ['nade', '투척', 'KeyG'], ['nadeSel', '투척물 전환', 'KeyT'], ['skip', '훈련 단계 건너뛰기', 'KeyN'],
];
function bind(a) { return (GS.save.binds && GS.save.binds[a]) || (KEYDEF.find(k => k[0] === a) || [])[2]; }
function keyLabel(c) {
  if (!c) return '-';
  const M = { Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Enter: 'Enter', Backspace: 'Back', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (M[c]) return M[c];
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (c.startsWith('Numpad')) return 'Num' + c.slice(6);
  return c;
}
const UK = () => keyLabel(bind('use'));
const utilOn = id => !!GS.save.utils[id] && !(GS.run && GS.run.mission && GS.run.mission.extreme);
// 이야기 · 무전 기록 (작전을 처음 완수하면 정산 화면에서 수신)
const STORY = {
  intro: '도시를 버린 기계들이 아직도 돌아다닌다. 거점은 부품을 사들이고, 용병은 기계를 사냥한다. 누가 그 기계를 만드는지는 아무도 묻지 않는다.',
  after: '근원지는 멈췄다. 거점은 이제 용병들이 직접 꾸려 간다. 남은 기계는 아직 많다.',
};
const LORE = {
  A: { n: 1, from: '회수반', text: '회수한 정찰형의 생산일이 지난주로 찍혀 있습니다. 도시가 버려진 건 6년 전인데요.' },
  B: { n: 2, from: '회수반', text: '생산 라인은 멈춰 있었지만 바닥의 기름이 아직 마르지 않았습니다. 누군가 최근까지 여기서 기계를 조립했습니다.' },
  E: { n: 3, from: '통신반', text: '중계탑이 보내던 신호를 잡았습니다. 목적지는 도시 북쪽 지하, 지도에 아무것도 없는 곳입니다.' },
  C: { n: 4, from: '회수반', text: 'REX-09 동력로에 \'M-0 생산분\'이라는 표식이 있습니다. 다른 기계들과 같은 표식입니다.' },
  F: { n: 5, from: '통신반', text: 'ARACHNE는 싸우는 내내 북쪽 지하로 전투 기록을 보내고 있었습니다. 누군가 우리를 보며 배우고 있습니다.' },
  D: { n: 6, from: '거점장', text: '그 신호는 잊게. 계약서에 없는 일이야. 부품이나 계속 가져오게.' },
  G: { n: 7, from: '발신자 불명', text: '거점장은 알고 있었다. 지하 공장 \'근원지\'의 좌표를 보낸다. 멈추고 싶다면 직접 가라.' },
};
const ENDING = [
  ['생산 코어가 멈췄다.'],
  ['꺼져 가는 화면에 코어의 마지막 기록이 떠올랐다.'],
  ['납품처: 용병 거점 · 목표: 회수 부품 수익률(MARGIN) 유지', 'q'],
  ['거점이 사들이던 부품은, 거점이 찍어낸 기계에서 나온 것이었다.'],
  ['그날 밤 거점장은 사라졌다. 거점은 용병들이 직접 꾸려 가기로 했다.'],
  ['도시에 새 기계는 더 이상 나오지 않는다.'],
  ['남은 기계는 아직 많다. 이제 그 일은 돈만을 위한 것이 아니다.'],
];
const SKILLS = {
  dash: { id: 'dash', name: '추진 대시', price: 3500, cd: 5, desc: '이동 방향으로 순간 돌진한다. 돌진 중 0.28초 무적.' },
  nano: { id: 'nano', name: '수리 나노봇', price: 4000, cd: 22, desc: '3초에 걸쳐 체력을 45 회복한다.' },
  shield: { id: 'shield', name: '에너지 실드', price: 6500, cd: 25, desc: '6초 동안 피해 80을 흡수하는 보호막을 두른다.' },
  overclock: { id: 'overclock', name: '약점 분석', price: 7000, cd: 30, desc: '8초 동안 모든 피해가 40% 증가한다. 수류탄과 유탄 포함.' },
  focus: { id: 'focus', name: '집중 (시간 감속)', price: 12000, cd: 40, desc: '4초 동안 적과 적의 탄환, 미사일이 40% 속도로 느려진다.' },
};
const MODS = {
  dmg: { id: 'dmg', name: '강화 탄약', prices: [3000, 7000, 14000], desc: '모든 무기의 피해량이 단계마다 8% 증가한다.', fx: l => `피해 +${l * 8}%` },
  recoil: { id: 'recoil', name: '반동 제어 장치', prices: [2500, 6000, 11000], desc: '반동과 탄퍼짐이 단계마다 15% 감소한다.', fx: l => `반동 -${l * 15}%` },
  reload: { id: 'reload', name: '신속 장전 장갑', prices: [2000, 5000], desc: '재장전 시간이 단계마다 15% 감소한다.', fx: l => `재장전 -${l * 15}%` },
  mag: { id: 'mag', name: '확장 탄창', prices: [3000, 8000], desc: '모든 무기의 탄창 용량이 단계마다 25% 증가한다.', fx: l => `탄창 +${l * 25}%` },
  move: { id: 'move', name: '경량 프레임', prices: [2500, 6500], desc: '이동 속도가 단계마다 7% 증가한다.', fx: l => `이동 +${l * 7}%` },
};
const CONSUMABLES = {
  emp: { id: 'emp', name: 'EMP 수류탄', price: 350, max: 3, desc: '반경 7m 안의 로봇을 3초간 완전히 정지시킨다. 보스는 2초 경직(동력로 노출) 후 15초간 내성.' },
  frag: { id: 'frag', name: '파편 수류탄', price: 250, max: 4, desc: '반경 5m 폭발. 범위 안 모든 부위에 피해를 주지만 부품이 잘 부서진다.' },
  stim: { id: 'stim', name: '회복 주사기', price: 250, max: 4, desc: 'H 키로 체력 50%를 즉시 회복한다. 응급 키트가 있으면 키트를 먼저 쓴다.' },
  ammo: { id: 'ammo', name: '탄약 보급 팩', price: 150, max: 3, desc: '주 무기 예비 탄약이 바닥나면 자동으로 사용되어 가득 채운다.' },
};
const GRENADES = ['emp', 'frag'];
function effW(id) {
  const b = WEAPONS[id], m = GS.save.mods, L = (GS.save.wlv && GS.save.wlv[id]) || 0, r = (1 - 0.15 * m.recoil) * (1 - 0.05 * L), dm = (1 + 0.08 * m.dmg) * (1 + 0.06 * L);
  return Object.assign({}, b, {
    dmg: b.dmg * dm, explosive: b.explosive ? { r: b.explosive.r, dmg: b.explosive.dmg * dm } : null,
    mag: Math.round(b.mag * (1 + 0.25 * m.mag) * (1 + 0.1 * L)), reload: b.reload * (1 - 0.15 * m.reload) * (1 - 0.05 * L),
    recoil: b.recoil * r, recoilYaw: b.recoilYaw * r, hipSpread: b.hipSpread * r, adsSpread: b.adsSpread * r, moveSpread: b.moveSpread * r,
    bloom: b.bloom * r, bloomMax: b.bloomMax * r, moveMult: b.moveMult * (1 + 0.07 * m.move) });
}
function W(id) { return GS.run.wst[id]; }
const maxReserve = id => WEAPONS[id].reserve * (GS.save.utils.pouch && id !== 'pistol' ? 1.5 : 1);
const ARMORS = [
  { lvl: 0, name: '기본 전투복', hp: 100, dr: 0 },
  { lvl: 1, id: 'armor1', name: '강화 방어복 Mk.I', price: 2800, hp: 150, dr: 0.10, desc: '세라믹 판을 덧댄 방어복.' },
  { lvl: 2, id: 'armor2', name: '강화 방어복 Mk.II', price: 7500, hp: 200, dr: 0.20, desc: '전면 복합 장갑. Mk.I 보유 필요.' },
  { lvl: 3, id: 'armor3', name: '중장 방어복 Mk.III', price: 14000, hp: 260, dr: 0.30, desc: '보스 대응용 중장 외골격. Mk.II 보유 필요.' },
];
const SALVAGES = [
  { lvl: 0, name: '없음', bonus: 0 },
  { lvl: 1, id: 'salv1', name: '회수 키트 Mk.I', price: 1500, bonus: 0.25, desc: '분해 공구 세트. 회수 부품 판매가 증가.' },
  { lvl: 2, id: 'salv2', name: '회수 키트 Mk.II', price: 5000, bonus: 0.5, desc: '정밀 분해 장비. Mk.I 보유 필요.' },
  { lvl: 3, id: 'salv3', name: '회수 키트 Mk.III', price: 11000, bonus: 0.8, desc: '현장 분해 드론. Mk.II 보유 필요.' },
];
// 상점 분류 / 노출 순서
const SHOP_CATS = ['무기', '무기 강화', '무기 개조', '스킬', '소모품', '방어복 · 회수', '가방', '보조 장비'];
const SHOP = [
  ...['revolver', 'smg', 'carbine', 'shotgun', 'burst', 'rifle', 'lmg', 'autoshotgun', 'launcher', 'amr', 'railgun'].map(id => ({ id, kind: 'weapon', cat: '무기' })),
  ...['pistol', 'revolver', 'smg', 'carbine', 'shotgun', 'burst', 'rifle', 'lmg', 'autoshotgun', 'launcher', 'amr', 'railgun'].map(id => ({ id: 'wlv_' + id, wid: id, kind: 'wlv', cat: '무기 강화' })),
  ...Object.keys(MODS).map(id => ({ id: 'mod_' + id, mid: id, kind: 'mod', cat: '무기 개조' })),
  ...Object.keys(SKILLS).map(id => ({ id, kind: 'skill', cat: '스킬' })),
  ...Object.keys(CONSUMABLES).map(id => ({ id, kind: 'cons', cat: '소모품' })),
  { id: 'armor1', kind: 'armor', lvl: 1, cat: '방어복 · 회수' }, { id: 'armor2', kind: 'armor', lvl: 2, cat: '방어복 · 회수' }, { id: 'armor3', kind: 'armor', lvl: 3, cat: '방어복 · 회수' },
  { id: 'bag1', kind: 'bag', lvl: 1, cat: '가방' }, { id: 'bag2', kind: 'bag', lvl: 2, cat: '가방' }, { id: 'bag3', kind: 'bag', lvl: 3, cat: '가방' },
  { id: 'salv1', kind: 'salvage', lvl: 1, cat: '방어복 · 회수' }, { id: 'salv2', kind: 'salvage', lvl: 2, cat: '방어복 · 회수' }, { id: 'salv3', kind: 'salvage', lvl: 3, cat: '방어복 · 회수' },
  ...Object.keys(UTILS).map(id => ({ id, kind: 'util', cat: '보조 장비' })),
];
GS.shopTab = '무기', GS.hubView = 'main', GS.hubModal = '';
const SLOT_KEYS = { get 0() { return keyLabel(bind('sk1')); }, get 1() { return keyLabel(bind('sk2')); } };

const PART_NAMES = { pearl: '여의주', hornL: '좌측 뿔', hornR: '우측 뿔', n1: '동력 마디 1', n2: '동력 마디 2', n3: '동력 마디 3', clawF: '앞발', clawB: '뒷발', fin: '꼬리 지느러미', jaw: '턱', podL: '좌측 미사일 포드', podR: '우측 미사일 포드', tail: '꼬리', chest: '흉부 장갑',
  hatch: '동력로 해치', reactor: '동력로', arms: '앞발',
  head: '센서 헤드', core: '몸체 코어', armor: '전면 장갑판', weapon: '주 무장', arm: '보조 팔',
  legL: '좌측 다리', legR: '우측 다리', power: '후면 동력 장치', shoulder: '어깨 장갑', guardL: '좌측 정강이 장갑', guardR: '우측 정강이 장갑' };
const PART_TYPE = { head: 'head', core: 'core', armor: 'armor', weapon: 'weapon', arm: 'arm', legL: 'leg', legR: 'leg',
  power: 'power', shoulder: 'armor', guardL: 'armor', guardR: 'armor',
  jaw: 'jaw', podL: 'pod', podR: 'pod', tail: 'tail', chest: 'armor', hatch: 'armor', reactor: 'power', arms: 'arm',
  pearl: 'pearl', hornL: 'horn', hornR: 'horn', armA: 'arm', armB: 'arm', armC: 'arm', n1: 'power', n2: 'power', n3: 'power', clawF: 'arm', clawB: 'arm', fin: 'fin' };
const PART_MULT = { head: 2.0, core: 1.0, armor: 1.0, weapon: 1.0, arm: 1.0, leg: 1.0, power: 1.8, jaw: 1.0, pod: 1.0, tail: 1.0, pearl: 1.5, horn: 1.2, fin: 1.0 };
const PRECISE = { head: true, power: true, pearl: true };
const STATE_KO = { intact: '정상', damaged: '손상', disabled: '무력화', destroyed: '파괴' };

const ETYPES = {
  scout: { name: '정찰형', speed: 5.0, turn: 6, radius: 0.42, detect: 26, prefDist: 11, burst: 3, burstGap: 0.12, cooldown: 1.7,
    leash: 12, reaction: 1.0, projSpeed: 36, projDmg: 7, projSize: 0.06, projColor: 0xffc04a, spread: 0.05, killReward: 30, scale: 1,
    parts: { head: { hp: 16, brk: 10, val: 40 }, core: { hp: 40, val: 90 }, armor: { hp: 14, val: 15 },
      weapon: { hp: 22, brk: 16, val: 80 }, arm: { hp: 18, brk: 12, val: 28 }, legL: { hp: 26, brk: 18, val: 34 },
      legR: { hp: 26, brk: 18, val: 34 }, power: { hp: 20, brk: 14, val: 58 } } },
  combat: { name: '전투형', speed: 3.1, turn: 3.6, radius: 0.55, detect: 32, prefDist: 14, burst: 1, burstGap: 0, cooldown: 0.62,
    leash: 10, reaction: 1.1, projSpeed: 31, projDmg: 11, projSize: 0.08, projColor: 0xff5a3a, spread: 0.04, killReward: 60, scale: 1,
    parts: { head: { hp: 34, brk: 20, val: 95 }, core: { hp: 110, val: 225 }, armor: { hp: 70, val: 45 },
      weapon: { hp: 55, brk: 40, val: 215 }, arm: { hp: 42, brk: 28, val: 68 }, legL: { hp: 60, brk: 40, val: 76 },
      legR: { hp: 60, brk: 40, val: 76 }, power: { hp: 50, brk: 35, val: 150 } } },
  heavy: { name: '중장갑형', speed: 1.8, turn: 1.5, radius: 0.85, detect: 34, prefDist: 12, burst: 4, burstGap: 0.16, cooldown: 3.0,
    windup: 0.75, leash: 5, reaction: 1.3, projSpeed: 21, projDmg: 18, projSize: 0.15, projColor: 0xff3a6a, spread: 0.045, killReward: 140, scale: 1.18,
    parts: { head: { hp: 60, brk: 40, val: 170 }, core: { hp: 220, val: 480 }, armor: { hp: 240, val: 115 },
      shoulder: { hp: 110, val: 60 }, guardL: { hp: 90, val: 40 }, guardR: { hp: 90, val: 40 },
      weapon: { hp: 110, brk: 80, val: 430 }, arm: { hp: 85, brk: 55, val: 140 }, legL: { hp: 120, brk: 90, val: 150 },
      legR: { hp: 120, brk: 90, val: 150 }, power: { hp: 70, brk: 60, val: 360 } } },
};
ETYPES.rex = { name: 'REX-09', speed: 4.6, turn: 1.25, radius: 3.7, detect: 40, reaction: 0, killReward: 600, scale: 1.6, leash: 99,
  parts: { head: { hp: 260, brk: 150, val: 600 }, jaw: { hp: 300, brk: 200, val: 700 }, podL: { hp: 180, brk: 120, val: 450 },
    podR: { hp: 180, brk: 120, val: 450 }, arms: { hp: 120, brk: 80, val: 250 }, tail: { hp: 420, brk: 260, val: 900 },
    legL: { hp: 1000, brk: 550, val: 600 }, legR: { hp: 1000, brk: 550, val: 600 }, core: { hp: 1800, val: 2200 },
    chest: { hp: 650, val: 300 }, hatch: { hp: 400, val: 200 }, reactor: { hp: 1550, brk: 700, val: 1800 } } };
ETYPES.dragon = { name: '청룡', title: '청룡 · 기계 용', radius: 1.4, scale: 1, killReward: 900, detect: 80, leash: 99, reaction: 0,
  parts: { head: { hp: 750, brk: 450, val: 700 }, jaw: { hp: 360, brk: 220, val: 650 }, hornL: { hp: 170, brk: 110, val: 380 }, hornR: { hp: 170, brk: 110, val: 380 },
    pearl: { hp: 850, brk: 420, val: 2400 }, clawF: { hp: 300, brk: 200, val: 520 }, clawB: { hp: 300, brk: 200, val: 520 },
    n1: { hp: 1650, brk: 560, val: 900 }, n2: { hp: 1650, brk: 560, val: 900 }, n3: { hp: 1650, brk: 560, val: 900 },
    fin: { hp: 280, brk: 180, val: 600 }, core: { hp: 4200, val: 3200 } } };
ETYPES.rex.title = 'REX-09 · 기계 티라노';
// 경제 조정: 부품 판매가 (일반 60% · 보스 40%)
for (const [k, f] of [['scout', 0.6], ['combat', 0.6], ['heavy', 0.6], ['rex', 0.4], ['dragon', 0.4]])
  for (const d of Object.values(ETYPES[k].parts)) d.val = Math.max(5, Math.round(d.val * f / 5) * 5);
const RDIM = {
  scout: { torso: [0.46, 0.4, 0.34], thigh: [0.13, 0.46, 0.15], shin: [0.11, 0.48, 0.13], foot: [0.2, 0.08, 0.3], legX: 0.15,
    head: [0.32, 0.22, 0.3], neck: 0.1, plate: [0.5, 0.44, 0.05], power: [0.28, 0.28, 0.14], shoulderR: 0.085,
    upper: [0.09, 0.24, 0.09], gun: { len: 0.45, r: 0.035, body: [0.11, 0.11, 0.28] }, util: [0.08, 0.26, 0.08], knee: 0.075,
    col: { main: 0xb3ad9c, dark: 0x45443f, acc: 0xd9a441, eye: 0xff6a2a }, antenna: true },
  combat: { torso: [0.62, 0.56, 0.42], thigh: [0.2, 0.42, 0.22], shin: [0.18, 0.42, 0.2], foot: [0.28, 0.1, 0.4], legX: 0.2,
    head: [0.28, 0.2, 0.28], neck: 0.1, plate: [0.68, 0.6, 0.08], power: [0.38, 0.4, 0.18], shoulderR: 0.13,
    upper: [0.14, 0.3, 0.14], gun: { len: 0.72, r: 0.055, body: [0.18, 0.18, 0.4] }, util: [0.12, 0.3, 0.12], knee: 0.11,
    col: { main: 0x7a8768, dark: 0x383d34, acc: 0xc4ad73, eye: 0xff3b2a } },
  heavy: { torso: [0.84, 0.66, 0.56], thigh: [0.3, 0.42, 0.32], shin: [0.28, 0.42, 0.3], foot: [0.4, 0.12, 0.5], legX: 0.28,
    head: [0.3, 0.18, 0.3], neck: 0.08, plate: [0.92, 0.74, 0.12], power: [0.46, 0.48, 0.22], shoulderR: 0.17,
    upper: [0.2, 0.3, 0.2], gun: { len: 0.8, r: 0.075, body: [0.3, 0.28, 0.55], twin: true }, util: [0.18, 0.32, 0.18], knee: 0.13,
    col: { main: 0x6a6e74, dark: 0x2c2e32, acc: 0xb05a36, eye: 0xff2a2a }, heavy: true },
};
// ---------------------------------------------------------------------
//  추가 적 · 임무 데이터 (드론형 · 저격형 · 중계탑 · 거미 전차)
// ---------------------------------------------------------------------
ETYPES.drone = { name: '드론형', speed: 6.2, turn: 5, radius: 0.55, detect: 34, prefDist: 12, burst: 4, burstGap: 0.1, cooldown: 2.1,
  leash: 18, reaction: 0.9, projSpeed: 34, projDmg: 6, projSize: 0.06, projColor: 0x7ad8ff, spread: 0.05, killReward: 40, scale: 1, hover: 4.6,
  parts: { head: { hp: 14, brk: 10, val: 30 }, core: { hp: 50, val: 70 }, weapon: { hp: 22, brk: 16, val: 50 }, power: { hp: 18, brk: 12, val: 40 },
    rotorFL: { hp: 12, brk: 10, val: 15 }, rotorFR: { hp: 12, brk: 10, val: 15 }, rotorBL: { hp: 12, brk: 10, val: 15 }, rotorBR: { hp: 12, brk: 10, val: 15 } } };
ETYPES.sniper = { name: '저격형', speed: 1.4, turn: 2.4, radius: 0.48, detect: 50, prefDist: 30, burst: 1, burstGap: 0, cooldown: 2.4, aimTime: 1.5,
  leash: 4, reaction: 1.2, projSpeed: 120, projDmg: 28, projSize: 0.07, projColor: 0xff3030, spread: 0.004, killReward: 80, scale: 1.05, sniper: true,
  parts: { head: { hp: 18, brk: 12, val: 40 }, core: { hp: 70, val: 90 }, armor: { hp: 30, val: 15 }, weapon: { hp: 40, brk: 30, val: 110 }, arm: { hp: 26, brk: 18, val: 25 },
    legL: { hp: 40, brk: 28, val: 30 }, legR: { hp: 40, brk: 28, val: 30 }, power: { hp: 30, brk: 22, val: 60 } } };
ETYPES.fcore = { name: '생산 코어', title: '근원지 · 생산 코어', radius: 6.6, scale: 1, killReward: 3000, detect: 70, leash: 99, reaction: 0,
  parts: { core: { hp: 1e6, val: 0 }, reactor: { hp: 1500, brk: 700, val: 2400 }, head: { hp: 520, brk: 300, val: 380 },
    podL: { hp: 480, brk: 260, val: 300 }, podR: { hp: 480, brk: 260, val: 300 },
    armA: { hp: 650, brk: 320, val: 420 }, armB: { hp: 650, brk: 320, val: 420 }, armC: { hp: 650, brk: 320, val: 420 } } };
ETYPES.mite = { name: '자폭 거미', radius: 0.45, scale: 1, killReward: 0, detect: 80, leash: 99, reaction: 0, speed: 7.0,
  parts: { core: { hp: 42, val: 0 } } };
ETYPES.relay = { name: '중계탑', radius: 1.2, scale: 1, killReward: 150, detect: 0, leash: 0, reaction: 0,
  parts: { armor: { hp: 260, val: 40 }, core: { hp: 320, val: 160 }, power: { hp: 140, brk: 100, val: 220 } } };
ETYPES.spider = { name: 'ARACHNE', title: 'ARACHNE · 거미 전차', radius: 2.4, scale: 1, killReward: 650, detect: 60, leash: 99, reaction: 0,
  parts: { head: { hp: 420, brk: 260, val: 260 }, turret: { hp: 520, brk: 320, val: 380 }, bay: { hp: 380, brk: 240, val: 300 },
    sl1: { hp: 620, brk: 420, val: 200 }, sl2: { hp: 620, brk: 420, val: 200 }, sl3: { hp: 620, brk: 420, val: 200 },
    sl4: { hp: 620, brk: 420, val: 200 }, sl5: { hp: 620, brk: 420, val: 200 }, sl6: { hp: 620, brk: 420, val: 200 },
    core: { hp: 3200, val: 900 }, reactor: { hp: 1800, brk: 750, val: 760 } } };
Object.assign(PART_NAMES, { rotorFL: '전방 좌측 로터', rotorFR: '전방 우측 로터', rotorBL: '후방 좌측 로터', rotorBR: '후방 우측 로터',
  turret: '박격포 포탑', bay: '드론 격납고', sl1: '좌측 앞다리', sl2: '좌측 가운뎃다리', sl3: '좌측 뒷다리', sl4: '우측 앞다리', sl5: '우측 가운뎃다리', sl6: '우측 뒷다리' });
Object.assign(PART_TYPE, { rotorFL: 'rotor', rotorFR: 'rotor', rotorBL: 'rotor', rotorBR: 'rotor', turret: 'turret', bay: 'bay',
  sl1: 'sleg', sl2: 'sleg', sl3: 'sleg', sl4: 'sleg', sl5: 'sleg', sl6: 'sleg' });
Object.assign(PART_MULT, { rotor: 1.4, turret: 1.0, bay: 1.0, sleg: 1.0 });
RDIM.sniper = { torso: [0.44, 0.5, 0.32], thigh: [0.12, 0.55, 0.13], shin: [0.1, 0.58, 0.12], foot: [0.18, 0.08, 0.3], legX: 0.14,
  head: [0.24, 0.2, 0.26], neck: 0.14, plate: [0.46, 0.46, 0.05], power: [0.26, 0.3, 0.12], shoulderR: 0.08,
  upper: [0.08, 0.26, 0.08], gun: { len: 1.3, r: 0.03, body: [0.09, 0.12, 0.5] }, util: [0.07, 0.26, 0.07], knee: 0.07,
  col: { main: 0x8c8f99, dark: 0x34363c, acc: 0x5a7fb0, eye: 0xff2a2a } };
const MISSIONS = {
  A: { id: 'A', code: 'OP-A', name: '폐기장 수색', diff: '낮음', contract: 400, partMult: 1.0,
    desc: '폐기장에 자리 잡은 정찰 기계를 정리하라. 첫 장비 마련에 적합하다.', enemies: '정찰형 5 · 전투형 2 · 드론형 1', rec: '기본 장비', target: ['정찰형 · 전투형', '폐기장 · 위협 등급 낮음'] },
  B: { id: 'B', code: 'OP-B', name: '공장 침투', diff: '높음', contract: 900, partMult: 1.3, req: 'A',
    desc: '가동 중인 조립 공장. 중장갑형은 정면 장갑이 두껍다. 측후방을 노려라. 안쪽 깊숙이 저격형이 자리 잡고 있다.', enemies: '전투형 4 · 중장갑형 2 · 저격형 1 · 드론형 1', rec: '카빈 또는 정밀 소총 · 방어복 Mk.I', target: ['중장갑형', '조립 공장 · 위협 등급 높음'] },
  E: { id: 'E', code: 'OP-C', name: '변전소 장악', diff: '높음', contract: 1300, partMult: 1.15, relays: true,
    desc: '적이 장악한 변전소. 중계탑 세 곳 주변의 구역 안에 머물러 점령하라. 점령을 시작하면 증원이 몰려오고, 구역 안에 적이 남아 있으면 점령이 멈춘다. 구역을 점령하면 그 중계탑도 정지한다. 망루의 저격형은 붉은 조준선이 굵어지기 전에 몸을 숨기거나 계속 움직여라.',
    enemies: '중계탑 3 · 저격형 2 · 전투형 3 + 증원 · 드론형', rec: '카빈 또는 기관총 · EMP · 파편 수류탄', target: ['구역 3곳 점령', '변전소 · 위협 등급 높음'] },
  C: { id: 'C', code: 'OP-X', name: '최종 작전 · 렉스 사냥', diff: '최상', contract: 2500, partMult: 1.0, req: 'B', boss: true,
    desc: '폐 조선소의 대형 기계 티라노. 돌진을 기둥에 박게 하거나 두 다리를 무너뜨려 등 뒤 동력로를 노출시켜라.', enemies: 'REX-09 기계 티라노 (+ 정찰형 증원)', rec: '상위 무기 · 방어복 Mk.II (숙련자는 기본 권총으로도 가능)', target: ['REX-09', '기계 티라노 · 위협 등급 최상'] },
  F: { id: 'F', code: 'OP-S', name: '최종 작전 II · 거미 전차', diff: '최상', contract: 2800, partMult: 1.0, boss: true,
    desc: '폐 채석장을 배회하는 6족 보행 전차. 다리를 부숴 주저앉히면 복부 뒤쪽 아래의 동력로가 드러난다. 도약 착지 직후에도 냉각구가 잠깐 열린다.',
    enemies: 'ARACHNE 거미 전차 (+ 드론 사출)', rec: '고화력 · 관통 무기, EMP (숙련자는 기본 권총으로도 가능)', target: ['ARACHNE', '거미 전차 · 위협 등급 최상'] },
  D: { id: 'D', code: 'OP-Z', name: '최종 작전 III · 청룡 격추', diff: '최상', contract: 3400, partMult: 1.0, boss: true,
    desc: '산정 폐사원 상공을 도는 기계 용. 여의주를 깨거나 앞발째 떨어뜨려 보호막을 벗기고, 몸통의 동력 마디 세 곳을 모두 정지시켜라.',
    enemies: '청룡 (공중)', rec: '연사 · 관통 무기, EMP (숙련자는 기본 권총으로도 가능)', target: ['청룡', '기계 용 · 위협 등급 최상'] },
  T: { id: 'T', code: 'TR', name: '훈련장 · 약점 연습', diff: '낮음', contract: 0, partMult: 0, tut: true,
    desc: '적마다 어디를 노려야 하는지 직접 쏴 보며 익힌다. 훈련장의 적은 반격하지 않고, 쓰러지지도 않는다.', enemies: '훈련용 표적', rec: '아무 장비', target: ['약점 훈련', '훈련장'] },
  G: { id: 'G', code: 'OP-EX', name: '익스트림 · 삼중 위협', diff: '최상', contract: 12000, partMult: 1.0, boss: true, extreme: true,
    desc: '폐 투기장에 세 보스가 동시에 투입된다. REX의 돌진, 거미의 도약과 포격, 청룡의 낙뢰가 한꺼번에 쏟아진다. 방어복과 보조 장비(응급 키트 · 재생 모듈 · 레이더)는 쓸 수 없다. 총과 탄약, 소모품, 스킬만으로 셋을 모두 격파하고 탈출하라.',
    enemies: 'REX-09 · ARACHNE · 청룡', rec: '상점 전 장비 · 무기 강화 (협동 권장)', target: ['삼중 위협', 'REX-09 · ARACHNE · 청룡'] },
  H: { id: 'H', code: 'OP-0', name: '최종 작전 · 근원지', diff: '최상', contract: 20000, partMult: 1.0, boss: true, final: true, req: 'G',
    desc: '도시 북쪽 지하의 공장 \'근원지\'. 기계를 찍어내는 생산 코어를 멈춰라. 조립 팔 세 개가 코어를 지키고, 생산 라인에서는 기계가 끝없이 조립되어 나온다. 팔을 모두 부수면 냉각구가 주기적으로 열린다. EMP는 코어를 잠시 멈춘다.',
    enemies: '생산 코어 · 조립 기계', rec: '상점 전 장비 · 무기 강화 · EMP · 단독 출격', target: ['생산 코어', '근원지 · 지하 공장'] },
};

export { ARMORS, BAGS, CONSUMABLES, ENDING, ETYPES, GRENADES, GUN_KG, KEYDEF, LORE, MAX_CARRY, MISSIONS, MODS, PART_MULT, PART_NAMES, PART_TYPE, PRECISE, RDIM, SALVAGES, SHOP, SHOP_CATS, SKILLS, SLOT_KEYS, STATE_KO, STORY, UK, UTILS, W, WEAPONS, bind, effW, keyLabel, maxReserve, partKg, utilOn };
