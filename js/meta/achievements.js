import * as THREE from 'three';
import { GS } from '../core/state.js?v=35';
import { $, V3, angDiff, fmt, rand } from '../core/utils.js?v=35';
import { LORE, MISSIONS, MODS, WEAPONS } from '../data/data.js?v=35';
import { writeSave } from '../core/save.js?v=35';
import { SFX } from '../core/audio.js?v=35';
import { camera } from '../core/renderer.js?v=35';
import { removeHittables } from '../world/world.js?v=35';
import { UPY, blastLight, burstSparks, spawnDebris, spawnFlash } from '../fx/effects.js?v=35';
import { player } from '../player/playerState.js?v=35';
import { capZones } from '../world/missions.js?v=35';
import { legFactor } from '../combat/damage.js?v=35';
import { NET, coopEv, eIdx, isGuest } from '../modes/coop.js?v=35';
import { createLoot } from '../game/loot.js?v=35';
import { addFeed, popup } from '../ui/hud.js?v=35';
import { WLV_MAX } from '../ui/hub.js?v=35';

// =====================================================================
//  업적
// =====================================================================
const ACH_CATS = ['전투', '회수', '보스', '성장', '기상천외'];
const ACH_GROUPS = [
  ['기본 전투', ['first_blood', 'kills100', 'disarm15', 'legs10', 'sensor50', 'acc100', 'drone30', 'mite20', 'counterSnipe', 'relayFast', 'emp4', 'focus3', 'frag3', 'pacifist']],
  ['부품 회수', ['parts50', 'parts500', 'perfect8', 'junk', 'haul40', 'speed5', 'loreAll']],
  ['REX-09', ['rex', 'rexPistol', 'rexCore', 'rexCrawl', 'rexWall', 'hardRex', 'roadkill3']],
  ['ARACHNE', ['spider', 'spiderPistol', 'spiderLegs', 'hardSpider', 'underSpider']],
  ['청룡', ['dragon', 'dragonPistol', 'pearl', 'barber', 'hardDragon', 'lightning3']],
  ['종합 · 하드 · 최종', ['both', 'trio', 'hardFirst', 'hardAll', 'hardPistol', 'extreme', 'extremeCoop', 'extremePistol', 'ending']],
  ['성장 · 장비', ['graduate', 'wlvMax', 'wlvAll', 'shop30', 'allguns', 'maxmods', 'rich', 'broke']],
];
// 같은 종류의 단계형 업적은 한 줄로 (앞 단계를 달성하면 다음 단계가 보임)
const ACH_CHAINS = [['first_blood', 'kills100'], ['parts50', 'parts500'], ['wlvMax', 'wlvAll'], ['hardFirst', 'hardAll']];
const ACH = [
  // 전투
  { id: 'first_blood', cat: '전투', name: '첫 수확', desc: '기계를 처음으로 처치한다.', cr: 50 },
  { id: 'kills100', cat: '전투', name: '고철 생산 라인', desc: '누적 100기를 처치한다.', cr: 450, prog: () => [GS.save.kills + (GS.run ? GS.run.kills : 0), 100] },
  { id: 'disarm15', cat: '전투', name: '무장 해제 전문가', desc: '적의 주 무장을 무력화해 분리하기 15회.', cr: 250, prog: () => [GS.save.ach.c.disarm || 0, 15] },
  { id: 'legs10', cat: '전투', name: '다리 수집가', desc: '로봇 한 기의 두 다리를 모두 무력화하기 10회.', cr: 250, prog: () => [GS.save.ach.c.legs || 0, 10] },
  { id: 'sensor50', cat: '전투', name: '센서 저격수', desc: '센서 헤드를 무력화하거나 파괴하기 50회.', cr: 250, prog: () => [GS.save.ach.c.sensor || 0, 50] },
  { id: 'emp4', cat: '전투', name: 'EMP 도미노', desc: 'EMP 한 번으로 로봇 4기 이상을 정지시킨다.', cr: 200 },
  { id: 'focus3', cat: '전투', name: '시간 도둑', desc: '집중 스킬 한 번이 유지되는 동안 3기를 처치한다.', cr: 250 },
  { id: 'frag3', cat: '전투', name: '수류탄 외교', desc: '한 임무에서 파편 수류탄으로 3기를 처치한다.', cr: 200 },
  { id: 'acc100', cat: '전투', name: '한 발도 허투루', desc: '20발 이상 쏘고 명중률 100%로 탈출한다. (산탄 · 유탄 제외)', cr: 450 },
  // 회수
  { id: 'parts50', cat: '회수', name: '고물상 개업', desc: '부품 50개를 회수한다.', cr: 150, prog: () => [GS.save.ach.c.parts || 0, 50] },
  { id: 'parts500', cat: '회수', name: '고물상 체인점', desc: '부품 500개를 회수한다.', cr: 900, prog: () => [GS.save.ach.c.parts || 0, 500] },
  { id: 'perfect8', cat: '회수', name: '무결점 해체', desc: '부품 8개 이상을 모두 상태 100%로 들고 탈출한다.', cr: 450 },
  { id: 'junk', cat: '회수', name: '폐품 감별사', desc: '상태 10% 이하의 부품을 굳이 회수한다.', cr: 100 },
  { id: 'haul40', cat: '회수', name: '적재 초과', desc: '미정산 부품 40개를 들고 탈출한다.', cr: 300 },
  { id: 'speed5', cat: '회수', name: '광속 회수', desc: '10초 안에 부품 5개를 회수한다.', cr: 150 },
  // 보스
  { id: 'rex', cat: '보스', name: '멸종 2회차', desc: 'REX-09를 격파한다.', cr: 600 },
  { id: 'rexPistol', cat: '보스', name: '공룡 사냥에 권총', desc: '기본 권총만으로 REX-09를 격파한다.', cr: 1500 },
  { id: 'rexCore', cat: '보스', name: '티라노 재활용', desc: 'REX-09에서 떨어진 부품 8개 이상을 들고 탈출한다.', cr: 450 },
  { id: 'rexCrawl', cat: '보스', name: '하체 붕괴', desc: 'REX-09의 두 다리를 완전히 망가뜨려 기어 다니게 만든다.', cr: 300 },
  { id: 'rexWall', cat: '보스', name: '기둥 박치기 3연속', desc: '한 전투에서 REX-09를 기둥에 세 번 들이받게 한다.', cr: 350 },
  { id: 'dragon', cat: '보스', name: '용 사냥꾼', desc: '청룡을 격파한다.', cr: 900 },
  { id: 'dragonPistol', cat: '보스', name: '용 잡는 권총', desc: '기본 권총만으로 청룡을 격파한다.', cr: 2200 },
  { id: 'pearl', cat: '보스', name: '여의주 도둑', desc: '상태 90% 이상의 여의주를 회수한다.', cr: 600 },
  { id: 'barber', cat: '보스', name: '청룡 이발소', desc: '한 전투에서 청룡의 양쪽 뿔을 온전히 떼어 낸다.', cr: 350 },
  { id: 'both', cat: '보스', name: '용과 공룡', desc: 'REX-09와 청룡을 모두 격파한다.', cr: 900 },
  { id: 'spider', cat: '보스', name: '거미 퇴치', desc: 'ARACHNE를 격파한다.', cr: 700 },
  { id: 'spiderPistol', cat: '보스', name: '권총 한 자루 vs 다리 여섯 개', desc: '기본 권총만으로 ARACHNE를 격파한다.', cr: 1600 },
  { id: 'spiderLegs', cat: '보스', name: '다리 여섯 개 수거', desc: '한 전투에서 ARACHNE의 다리 여섯 개를 모두 무너뜨린다.', cr: 600 },
  { id: 'trio', cat: '보스', name: '최종 작전 완수', desc: '세 보스를 모두 격파한다.', cr: 1500 },
  // 성장
  { id: 'drone30', cat: '전투', name: '대공 사격', desc: '드론형을 30기 격추한다.', cr: 300, prog: () => [GS.save.ach.c.drones || 0, 30] },
  { id: 'mite20', cat: '전투', name: '해충 방제', desc: '자폭 거미를 터지기 전에 20기 부순다.', cr: 500, prog: () => [GS.save.ach.c.mites || 0, 20] },
  { id: 'counterSnipe', cat: '전투', name: '역저격', desc: '조준선을 겨누고 있는 저격형의 센서를 부숴 저격을 끊는다.', cr: 250 },
  { id: 'relayFast', cat: '전투', name: '정전 사고', desc: '변전소에서 출격 150초 안에 구역 3곳을 모두 점령한다.', cr: 400 },
  { id: 'hardFirst', cat: '보스', name: '지옥의 문턱', desc: '하드 모드 작전을 처음으로 완수한다.', cr: 500 },
  { id: 'hardRex', cat: '보스', name: '멸종 3회차', desc: '하드 모드로 REX-09를 격파한다.', cr: 1500 },
  { id: 'hardSpider', cat: '보스', name: '독거미 사냥꾼', desc: '하드 모드로 ARACHNE를 격파한다.', cr: 1800 },
  { id: 'hardDragon', cat: '보스', name: '용의 비늘을 벗기다', desc: '하드 모드로 청룡을 격파한다.', cr: 2400 },
  { id: 'hardAll', cat: '보스', name: '모든 작전 · 하드', desc: '여섯 작전을 모두 하드 모드로 완수한다.', cr: 4000, prog: () => [Object.values(MISSIONS).filter(m => !m.extreme && !m.tut && !m.final && GS.save.stats[m.id] && GS.save.stats[m.id].hard).length, Object.values(MISSIONS).filter(m => !m.extreme && !m.tut && !m.final).length] },
  { id: 'extreme', cat: '보스', name: '삼중 위협 제압', desc: '익스트림 작전을 완수한다.', cr: 5000 },
  { id: 'extremeCoop', cat: '보스', name: '둘이라서 다행', desc: '협동으로 익스트림 작전을 완수한다.', cr: 2000 },
  { id: 'ending', cat: '보스', name: '근원 차단', desc: '최종 작전에서 생산 코어를 멈추고 탈출한다.', cr: 10000 },
  { id: 'loreAll', cat: '회수', name: '무전 수집가', desc: '무전 기록 7개를 모두 받는다.', cr: 1500, prog: () => [Object.keys(LORE).filter(k => GS.save.lore[k]).length, Object.keys(LORE).length] },
  { id: 'graduate', cat: '성장', name: '훈련 수료', desc: '훈련장의 모든 단계를 마치고 탈출한다.', cr: 1500 },
  { id: 'wlvMax', cat: '성장', name: '장인의 총', desc: '총 한 자루를 5단계까지 강화한다.', cr: 800 },
  { id: 'wlvAll', cat: '성장', name: '완전 무장', desc: '모든 총을 5단계까지 강화한다.', cr: 6000, prog: () => [Object.keys(WEAPONS).filter(k => (GS.save.wlv[k] || 0) >= WLV_MAX).length, Object.keys(WEAPONS).length] },
  { id: 'shop30', cat: '성장', name: '쇼핑 중독', desc: '상점에서 30번 구매한다.', cr: 250, prog: () => [GS.save.ach.c.buys || 0, 30] },
  { id: 'allguns', cat: '성장', name: '무기고', desc: '모든 무기를 보유한다.', cr: 900, prog: () => [Object.keys(WEAPONS).filter(k => GS.save.weapons[k]).length, Object.keys(WEAPONS).length] },
  { id: 'maxmods', cat: '성장', name: '풀 개조', desc: '무기 개조를 모든 단계까지 마친다.', cr: 900, prog: () => [Object.values(MODS).reduce((a, m) => a + GS.save.mods[m.id], 0), Object.values(MODS).reduce((a, m) => a + m.prices.length, 0)] },
  { id: 'rich', cat: '성장', name: '부자 용병', desc: '보유 자금 100,000 CR을 달성한다.', cr: 600, prog: () => [Math.min(GS.save.credits, 100000), 100000] },
  // 기상천외 (숨김)
  { id: 'leave10', cat: '기상천외', hidden: true, hint: '출근하자마자...', name: '칼퇴근', desc: '출격 10초 안에 조기 탈출한다.', cr: 50 },
  { id: 'zeroPay', cat: '기상천외', hidden: true, hint: '돈이 목적이 아니다.', name: '자원봉사', desc: '정산 금액 0 CR로 탈출한다.', cr: 50 },
  { id: 'broke', cat: '기상천외', hidden: true, hint: '쇼핑은 계획적으로.', name: '텅장', desc: '구매 후 보유 자금이 50 CR 이하가 된다.', cr: 50 },
  { id: 'selfnade5', cat: '기상천외', hidden: true, hint: '던진 건 돌아온다.', name: '내 수류탄은 나를 사랑해', desc: '자기 폭발에 다섯 번 휘말린다.', cr: 100, prog: () => [GS.save.ach.c.selfnade || 0, 5] },
  { id: 'lightning3', cat: '기상천외', hidden: true, hint: '하늘이 유독 나만 노린다.', name: '피뢰침 체질', desc: '한 임무에서 낙뢰에 세 번 맞는다.', cr: 150 },
  { id: 'roadkill3', cat: '기상천외', hidden: true, hint: '공룡 전용 횡단보도는 없다.', name: '로드킬 단골', desc: '한 전투에서 REX-09의 돌진에 세 번 치인다.', cr: 150 },
  { id: 'deathRich', cat: '기상천외', hidden: true, hint: '가방이 너무 무거웠다.', name: '죽음의 회계사', desc: '미정산 부품 3,000 CR 이상을 들고 사망한다.', cr: 100 },
  { id: 'soClose', cat: '기상천외', hidden: true, hint: '집이 바로 저기였는데.', name: '한 걸음만 더', desc: '탈출 지점 5m 안에서 사망한다.', cr: 100 },
  { id: 'teabag', cat: '기상천외', hidden: true, hint: '쓰러진 기계에게 예의를...?', name: '고인 모독', desc: '처치 직후 5초 안에 잔해 옆에서 열 번 앉았다 일어난다.', cr: 100 },
  { id: 'spin', cat: '기상천외', hidden: true, hint: '세상이 빙글빙글.', name: '회전목마', desc: '10초 안에 시점을 열 바퀴 돌린다.', cr: 100 },
  { id: 'moon', cat: '기상천외', hidden: true, hint: '오늘따라 하늘이 예쁘다.', name: '달 보는 저격수', desc: '정조준한 채로 하늘을 10초 동안 올려다본다.', cr: 100 },
  { id: 'pacifist', cat: '기상천외', hidden: true, hint: '총은 장식이다.', name: '무기는 거들 뿐', desc: '총을 한 발도 쏘지 않은 임무에서 수류탄으로 적을 처치한다.', cr: 200 },
  { id: 'jump500', cat: '기상천외', hidden: true, hint: '바닥이 뜨겁다.', name: '토끼 용병', desc: '누적 500번 점프한다.', cr: 150, prog: () => [GS.save.ach.c.jumps || 0, 500] },
  { id: 'walk5k', cat: '기상천외', hidden: true, hint: '운동은 전장에서.', name: '산책하는 용병', desc: '누적 5km를 이동한다.', cr: 250, prog: () => [Math.floor(GS.save.ach.c.dist || 0), 5000] },
  { id: 'overtime', cat: '기상천외', hidden: true, hint: '퇴근은 언제?', name: '야근 수당', desc: '한 임무에 15분 이상 머문다.', cr: 200 },
  { id: 'miss95', cat: '기상천외', hidden: true, hint: '탄약상의 VIP.', name: '총알 기부 천사', desc: '300발 이상 쏘고 명중률 5% 이하로 탈출한다.', cr: 100 },
  { id: 'dodge', cat: '기상천외', hidden: true, hint: '종이 한 장.', name: '종이 한 장 차이', desc: '대시 무적 시간으로 보스의 공격을 흘려 낸다.', cr: 200 },
  { id: 'crushed', cat: '기상천외', hidden: true, hint: '하늘에서 무언가 떨어진다.', name: '추락 주의', desc: '격추한 드론의 잔해에 깔린다.', cr: 150 },
  { id: 'underSpider', cat: '기상천외', hidden: true, hint: '가장 안전한 곳은 어디일까.', name: '등잔 밑', desc: 'ARACHNE의 몸 아래에서 10초 동안 버틴다.', cr: 250 },
  { id: 'hardPistol', cat: '기상천외', hidden: true, hint: '하드 모드에서도 그 권총을?', name: '광기의 사수', desc: '하드 모드 보스를 혼자서 기본 권총만으로 격파한다.', cr: 3000 },
  { id: 'extremePistol', cat: '기상천외', hidden: true, hint: '세 마리를 권총 한 자루로?', name: '전설의 권총잡이', desc: '익스트림 작전을 혼자 기본 권총만으로 완수한다.', cr: 9000 },
  { id: 'tank300', cat: '기상천외', hidden: true, hint: '아프지만 괜찮아.', name: '인간 방패', desc: '한 임무에서 피해를 300 이상 받고도 살아서 탈출한다.', cr: 250 },
];
const ACH_BY = Object.fromEntries(ACH.map(a => [a.id, a]));
let achQueue = [];
function achGot(id) { return !!GS.save.ach.done[id]; }
function achUnlock(id) {
  const a = ACH_BY[id]; if (!a || achGot(id)) return false;
  GS.save.ach.done[id] = Date.now(); GS.save.credits += a.cr; writeSave();
  achQueue.push(a); showAchToasts();
  return true;
}
function achCount(key, n = 1) { GS.save.ach.c[key] = (GS.save.ach.c[key] || 0) + n; return GS.save.ach.c[key]; }
function showAchToasts() {
  const box = $('toasts'); if (!box) return; box.classList.toggle('hubpos', GS.state !== 'mission');
  // 동시에 최대 3개까지만 띄우고 나머지는 앞의 알림이 사라지면 순서대로 표시
  while (achQueue.length && box.querySelectorAll('.toast:not(.out)').length < 3) {
    const a = achQueue.shift();
    const d = document.createElement('div'); d.className = 'toast' + (a.hidden ? ' secret' : '');
    d.innerHTML = `<div class="lbl">${a.hidden ? '기상천외 업적 달성' : '업적 달성'}</div><b>${a.name}</b><span class="mono acc">+${fmt(a.cr)} CR</span><div class="dim">${a.desc}</div>`;
    box.appendChild(d); SFX.achievement();
    setTimeout(() => { d.classList.add('out'); showAchToasts(); }, 3800); setTimeout(() => d.remove(), 4400);
  }
  if (GS.state === 'hub') { const v = document.querySelector('#hub .credits .v'); if (v) v.textContent = fmt(GS.save.credits) + ' CR'; }
}
function achCheckGrowth() {
  if (Object.keys(WEAPONS).some(k => (GS.save.wlv[k] || 0) >= WLV_MAX)) achUnlock('wlvMax');
  if (Object.keys(WEAPONS).every(k => (GS.save.wlv[k] || 0) >= WLV_MAX)) achUnlock('wlvAll');
  if ((GS.save.ach.c.buys || 0) >= 30) achUnlock('shop30');
  if (Object.keys(WEAPONS).every(k => GS.save.weapons[k])) achUnlock('allguns');
  if (Object.values(MODS).every(m => GS.save.mods[m.id] >= m.prices.length)) achUnlock('maxmods');
  if (GS.save.credits >= 100000) achUnlock('rich');
}
// 임무 중 이벤트
function achEvent(type, d = {}) {
  if (!GS.run || GS.run.mission.tut) return;
  const A = GS.run.ac || (GS.run.ac = { frag: 0, picks: [], crouch: [], lightning: 0, roadkill: 0, rexWall: 0, horns: 0, dmg: 0, focusKills: 0, spinT: 0, spinSum: 0, moonT: 0, lastKill: null });
  switch (type) {
    case 'kill': {
      const e = d.e;
      achUnlock('first_blood');
      if (e.mite) { if (d.cause !== 'blast' && d.cause !== 'shutdown') { GS.save.ach.c.mites = (GS.save.ach.c.mites || 0) + 1; if (GS.save.ach.c.mites >= 20) achUnlock('mite20'); } break; }
      if (GS.save.kills + GS.run.kills >= 100) achUnlock('kills100');
      if (e.lastHit === 'frag') { if (++A.frag >= 3) achUnlock('frag3'); if (GS.run.shots === 0) achUnlock('pacifist'); }
      if (GS.run.focusT > 0 && ++A.focusKills >= 3) achUnlock('focus3');
      if (e.type === 'rex') achUnlock('rex');
      if (e.type === 'dragon') achUnlock('dragon');
      if (e.type === 'spider') achUnlock('spider');
      if (e.type === 'drone' && achCount('drones') >= 30) achUnlock('drone30');
      if (achGot('rex') && achGot('dragon')) achUnlock('both');
      if (achGot('rex') && achGot('dragon') && achGot('spider')) achUnlock('trio');
      A.lastKill = { t: GS.time, x: e.dragon ? e.headPos.x : e.root.position.x, z: e.dragon ? e.headPos.z : e.root.position.z }; A.crouch = [];
      break;
    }
    case 'part': {
      const p = d.p, e = p.enemy;
      if (d.ev === 'disabled' && p.type === 'weapon') { if (achCount('disarm') >= 15) achUnlock('disarm15'); }
      if ((d.ev === 'disabled' || d.ev === 'destroyed') && p.type === 'head' && !e.boss) { if (achCount('sensor') >= 50) achUnlock('sensor50'); }
      if (d.ev === 'disabled' && p.type === 'leg' && !e.boss && legFactor(e) === 0) { if (achCount('legs') >= 10) achUnlock('legs10'); }
      if (d.ev === 'disabled' && p.type === 'horn' && e.dragon && ++A.horns >= 2) achUnlock('barber');
      if ((d.ev === 'disabled' || d.ev === 'destroyed') && p.type === 'sleg' && !p.counted && (A.sleg = (A.sleg || 0) + 1) >= 6) achUnlock('spiderLegs');
      if ((d.ev === 'disabled' || d.ev === 'destroyed') && p.type === 'head' && e.cfg.sniper && e.aimT > 0) achUnlock('counterSnipe');
      break;
    }
    case 'pickup': {
      const l = d.l;
      const n = achCount('parts'); if (n >= 50) achUnlock('parts50'); if (n >= 500) achUnlock('parts500');
      if (l.cond <= 0.1) achUnlock('junk');
      if (l.p.id === 'pearl' && l.cond >= 0.9) achUnlock('pearl');
      A.picks.push(GS.time); A.picks = A.picks.filter(t => GS.time - t <= 10); if (A.picks.length >= 5) achUnlock('speed5');
      break;
    }
    case 'hurt': {
      A.dmg += d.d;
      if (d.src === 'self' && achCount('selfnade') >= 5) achUnlock('selfnade5');
      if (d.src === 'lightning' && ++A.lightning >= 3) achUnlock('lightning3');
      if (d.src === 'charge' && ++A.roadkill >= 3) achUnlock('roadkill3');
      if (d.src === 'crash') achUnlock('crushed');
      break;
    }
    case 'iframe': if (['bite', 'tail', 'charge', 'dive', 'laser', 'lightning', 'missile', 'shock', 'stomp', 'lunge'].includes(d.src)) achUnlock('dodge'); break;
    case 'relays': if (d.t <= 150) achUnlock('relayFast'); break;
    case 'rexWall': if (++A.rexWall >= 3) achUnlock('rexWall'); break;
    case 'rexCrawl': achUnlock('rexCrawl'); break;
    case 'emp': if (d.n >= 4) achUnlock('emp4'); break;
    case 'focus': A.focusKills = 0; break;
    case 'jump': if (achCount('jumps') >= 500) achUnlock('jump500'); break;
    case 'crouch': {
      const k = A.lastKill;
      if (k && GS.time - k.t <= 5 && Math.hypot(player.pos.x - k.x, player.pos.z - k.z) < 6) { A.crouch.push(GS.time); if (A.crouch.length >= 10) achUnlock('teabag'); }
      break;
    }
    case 'end': {
      const k = d.kind, el = GS.time - GS.run.startT;
      if (el >= 900) achUnlock('overtime');
      if (k === 'extract') {
        if (!GS.run.objDone && el < 10) achUnlock('leave10');
        if (d.total === 0) achUnlock('zeroPay');
        if (GS.run.loot.length >= 8 && GS.run.loot.every(l => l.cond >= 0.999)) achUnlock('perfect8');
        if (GS.run.loot.length >= 40) achUnlock('haul40');
        if (GS.run.loot.filter(l => l.src === 'rex').length >= 8) achUnlock('rexCore');
        const multi = ['shotgun', 'autoshotgun', 'launcher', 'railgun'].some(w => GS.run.used[w]);
        if (!multi && GS.run.shots >= 20 && GS.run.shotsHit >= GS.run.shots) achUnlock('acc100');
        if (GS.run.shots >= 300 && GS.run.shotsHit / GS.run.shots <= 0.05) achUnlock('miss95');
        if (A.dmg >= 300) achUnlock('tank300');
        if (GS.run.objDone && GS.run.mission.extreme) { achUnlock('extreme'); if (GS.run.coop) achUnlock('extremeCoop'); else if (GS.run.pistolOnly) achUnlock('extremePistol'); }
        if (GS.run.objDone && GS.run.hard) { achUnlock('hardFirst'); if (GS.run.mission.boss) achUnlock({ C: 'hardRex', F: 'hardSpider', D: 'hardDragon' }[GS.run.mission.id]);
          if (Object.values(MISSIONS).every(m => m.extreme || m.tut || m.final || (GS.save.stats[m.id] && GS.save.stats[m.id].hard))) achUnlock('hardAll'); if (GS.run.mission.boss && GS.run.pistolOnly && !GS.run.coop) achUnlock('hardPistol'); }
        if (GS.run.objDone && GS.run.mission.boss && GS.run.pistolOnly && !GS.run.coop) { const pk = { C: 'rexPistol', D: 'dragonPistol', F: 'spiderPistol' }[GS.run.mission.id]; if (pk) achUnlock(pk); }
      }
      if (k === 'dead') {
        if (GS.run.loot.reduce((a, l) => a + l.val, 0) >= 3000) achUnlock('deathRich');
        if (GS.extraction && Math.hypot(GS.extraction.x - player.pos.x, GS.extraction.z - player.pos.z) < 5) achUnlock('soClose');
      }
      achCheckGrowth();
      break;
    }
  }
}
// 매 프레임: 이동 거리 · 회전 · 하늘 보기
function achTick(dt) {
  if (!GS.run || GS.run.mission.tut) return;
  if (GS.run && GS.run.boss && GS.run.boss.spider && !GS.run.boss.dead) {
    const A0 = GS.run.ac || (GS.run.ac = { frag: 0, picks: [], crouch: [], lightning: 0, roadkill: 0, rexWall: 0, horns: 0, dmg: 0, focusKills: 0, spinT: 0, spinSum: 0, moonT: 0, lastKill: null });
    const b = GS.run.boss, under = Math.hypot(player.pos.x - b.root.position.x, player.pos.z - b.root.position.z) < 2.4 && b.H > 2;
    A0.underT = under ? (A0.underT || 0) + dt : 0; if (A0.underT >= 10) achUnlock('underSpider');
  }
  if (!GS.run) return;
  const A = GS.run.ac || (achEvent('noop'), GS.run.ac);
  if (player.onGround && player.hspeed > 0.5) { const v = achCount('dist', player.hspeed * dt); if (v >= 5000) achUnlock('walk5k'); }
  const eu = _achEu.setFromQuaternion(camera.quaternion, 'YXZ');
  if (A.prevYaw !== undefined) {
    if (GS.time - A.spinT > 10) { A.spinT = GS.time; A.spinSum = 0; }
    A.spinSum += Math.abs(angDiff(eu.y, A.prevYaw));
    if (A.spinSum >= Math.PI * 20) achUnlock('spin');
  }
  A.prevYaw = eu.y;
  if (GS.ads > 0.8 && eu.x > 1.25) { A.moonT += dt; if (A.moonT >= 10) achUnlock('moon'); } else A.moonT = 0;
}
const _achEu = new THREE.Euler();

function killEnemy(e, cause) {
  if (e.dead) return;
  if (e.mite) {
    coopEv({ t: 'kill', i: eIdx(e), c: cause }); NET.mute = true;
    e.dead = true; GS.run.kills++; GS.run.killsByType.mite = (GS.run.killsByType.mite || 0) + 1;
    achEvent('kill', { e, cause });
    if (cause !== 'blast') { const c = e.root.position.clone(); c.y += 0.4; SFX.brk(); spawnFlash(c, 1.2, 0.12, 0xff7a3a); burstSparks(c, UPY, 12, 0xff7a3a, 5); spawnDebris(c, 0x2a2826, 3, 3); }
    for (const p of Object.values(e.parts)) { p.attached = false; removeHittables(p.meshes); }
    GS.world.remove(e.root); NET.mute = false; return;
  }
  if (e.spider) for (const m of GS.enemies) if (m.mite && !m.dead) killEnemy(m, 'shutdown');
  if (e.fcore) for (const m of GS.enemies) if (!m.dead && m.minion) killEnemy(m, 'shutdown');
  coopEv({ t: 'kill', i: eIdx(e), c: cause }); NET.mute = true;
  e.dead = true; e.glow.material.opacity = 0;
  GS.run.kills++; GS.run.killReward += e.noReward ? 0 : e.cfg.killReward; GS.run.killsByType[e.type] = (GS.run.killsByType[e.type] || 0) + 1;
  achEvent('kill', { e, cause });
  e.root.updateMatrixWorld(true);
  const center = V3(); e.root.localToWorld(center.set(0, e.coreY / e.cfg.scale, 0));
  const dist = center.distanceTo(player.pos);
  if (cause === 'shutdown') {
    SFX.shutdown(); burstSparks(center, UPY, 10, 0x3dff9a, 3);
    addFeed(`${e.cfg.name} 정지 · 동력 차단 (코어 보존) +${e.noReward ? 0 : e.cfg.killReward}`, 'k');
  } else {
    SFX.explode(dist); spawnFlash(center, 2.6, 0.25, 0xffa050); burstSparks(center, UPY, 26, 0xffa040, 9);
    blastLight.position.copy(center); blastLight.intensity = 90;
    addFeed(`${e.cfg.name} 처치 · ${cause === 'core' ? '코어 파괴' : cause === 'crash' ? '추락' : '동력 과부하'} +${e.noReward ? 0 : e.cfg.killReward}`, 'k');
    if (e.boss) { for (let i = 0; i < 4; i++) { const v = center.clone().add(V3(rand(-3, 3), rand(-1, 2), rand(-3, 3))); spawnFlash(v, 4, 0.35, 0xffa050); burstSparks(v, UPY, 20, 0xffa040, 10); } GS.shake = Math.max(GS.shake, 0.04); }
  }
  popup(cause === 'shutdown' ? '동력 차단 · 정지' : '처치', 'bad');
  // 남은 부위를 분리 → 전리품
  const power = cause === 'shutdown' ? 1.2 : 3.5;
  const order = Object.values(e.parts).sort((a, b) => (a.type === 'armor' ? 0 : 1) - (b.type === 'armor' ? 0 : 1));
  const wp = V3();
  for (const p of order) {
    if (!p.attached || p.state === 'destroyed') continue;
    if (e.fcore && p.id === 'core') { removeHittables(p.meshes); continue; }
    p.group.getWorldPosition(wp);
    const v = V3(wp.x - center.x, 0, wp.z - center.z); if (v.lengthSq() < 1e-4) v.set(rand(-1, 1), 0, rand(-1, 1));
    v.normalize().multiplyScalar(power * rand(0.6, 1.2)); v.y = power * rand(0.5, 1.0);
    detachPartSingle(p, v);
  }
  if (e.bs && e.bs.marker) GS.world.remove(e.bs.marker);
  if (e.bs && e.bs.marker2) GS.world.remove(e.bs.marker2);
  if (e.laser) GS.world.remove(e.laser);
  if (e.bs && e.bs.beam) GS.world.remove(e.bs.beam);
  if (!e.fcore) GS.world.remove(e.root);
  NET.mute = false;
  checkObjective();
}
// 사망 시: 자식 부위는 각자 분리 (중첩 그룹 처리)
function detachPartSingle(p, vel) {
  if (!p.attached) return;
  p.attached = false;
  removeHittables(p.meshes);
  GS.world.attach(p.group);
  GS.fallers.push({ obj: p.group, vel: vel.clone(), ang: V3(rand(-5, 5), rand(-5, 5), rand(-5, 5)), t: 0, onLand: () => createLoot(p) });
}
function checkObjective() {
  if (isGuest()) return;
  if (GS.run.mission.tut) return;
  if (GS.run.mission.boss) {
    if (!GS.run.objDone && GS.run.boss && GS.enemies.filter(o => o.boss).every(o => o.dead)) {
      GS.run.bossKillT = GS.time - (GS.run.boss.bs.engageT || GS.run.startT);
      GS.run.pistolOnly = Object.keys(GS.run.used).every(k => ['pistol', 'emp'].includes(k));
      GS.run.objDone = true; SFX.objective(); NET.mute = true; addFeed(`${GS.run.mission.target[0]} 격파 · 탈출 지점으로 귀환해 정산`, 'x'); NET.mute = false; coopEv({ t: 'obj', bt: GS.run.bossKillT }); }
    return;
  }
  if (GS.run.mission.relays) {
    if (!GS.run.objDone && capZones.length && capZones.every(z => z.done)) {
      GS.run.objDone = true; GS.run.relayT = GS.time - GS.run.startT; SFX.objective(); addFeed('구역 3곳 점령 완료 · 탈출 지점으로 귀환해 정산', 'x'); achEvent('relays', { t: GS.run.relayT });
    }
    return;
  }
  if (!GS.run.objDone && GS.run.kills >= GS.run.total) {
    GS.run.objDone = true; SFX.objective();
    addFeed('목표 완료 · 탈출 지점으로 귀환해 정산', 'x');
  }
}

export { ACH, ACH_BY, ACH_CHAINS, ACH_GROUPS, achCheckGrowth, achCount, achEvent, achGot, achTick, achUnlock, checkObjective, killEnemy };
