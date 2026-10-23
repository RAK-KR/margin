import * as THREE from 'three';
import { GS } from '../core/state.js?v=37';
import { $, clamp, fmt, setText } from '../core/utils.js?v=37';
import { ARMORS, BAGS, CONSUMABLES, GRENADES, GUN_KG, KEYDEF, LORE, MAX_CARRY, MISSIONS, MODS, SALVAGES, SHOP, SHOP_CATS, SKILLS, SLOT_KEYS, UTILS, WEAPONS, bind, keyLabel } from '../data/data.js?v=37';
import { defaultSave, writeSave } from '../core/save.js?v=37';
import { SFX, initAudio, vol } from '../core/audio.js?v=37';
import { ALL_GUNS, GUNS, SKINS, SKIN_THEMES, applySkin, skinAch, skinOwned, skinSel, skinsFor } from '../player/viewmodel.js?v=37';
import { startMission } from '../world/missions.js?v=37';
import { bindVolume } from '../player/input.js?v=37';
import { NET, coopBindModal, coopModalHtml } from '../modes/coop.js?v=37';
import { CHAOS_IDS, chaosUnlocked, extremeProgress, extremeUnlocked, hardUnlocked } from '../modes/difficulty.js?v=37';
import { ACH, ACH_BY, ACH_CHAINS, ACH_GROUPS, achCheckGrowth, achCount, achGot, achUnlock } from '../meta/achievements.js?v=37';
import { popup } from './hud.js?v=37';
import { nextGoal } from '../game/result.js?v=37';
import { hubShow } from './hub3d.js?v=37';

// =====================================================================
//  거점 / 상점
// =====================================================================
const WLV_MAX = 5, WLV_MULT = [1, 1.7, 2.6, 3.8, 5.4];
const wlvBase = id => Math.max(1200, Math.round(WEAPONS[id].price * 0.35 / 100) * 100);
const wlvFx = l => `피해 +${l * 6}% · 탄창 +${l * 10}% · 재장전 -${l * 5}% · 반동 -${l * 5}%`;
function itemDef(it) {
  if (it.kind === 'wlv') { const l = GS.save.wlv[it.wid] || 0; return { name: WEAPONS[it.wid].name + ' 강화', desc: `현재 · ${l ? wlvFx(l) : '강화 없음'}${l < WLV_MAX ? `<br><span class="ok">다음 · ${wlvFx(l + 1)}</span>` : ''}`, price: itemPrice(it) }; }
  if (it.kind === 'weapon') return WEAPONS[it.id];
  if (it.kind === 'armor') return ARMORS[it.lvl];
  if (it.kind === 'bag') return BAGS[it.lvl];
  if (it.kind === 'util') return UTILS[it.id];
  if (it.kind === 'skill') return SKILLS[it.id];
  if (it.kind === 'mod') return MODS[it.mid];
  if (it.kind === 'cons') return CONSUMABLES[it.id];
  return SALVAGES[it.lvl];
}
function modLv(it) { return GS.save.mods[it.mid] || 0; }
// 진행 목표: 처음 하는 사람이 다음에 뭘 해야 하는지
const GOALS = [
  { t: '훈련장에서 기본기 익히기', h: '상단 메뉴의 훈련장에서 조작과 기계의 약점을 직접 연습합니다.', ok: () => GS.save.tutDone, go: () => startMission('T') },
  { t: 'OP-A 폐기장 수색 완수', h: '작전 목록에서 OP-A를 고르고 출격하세요. 기계를 모두 처치하고 탈출하면 정산합니다.', ok: () => GS.save.stats.A.clears > 0, go: () => { GS.selectedMission = 'A'; } },
  { t: '상점에서 첫 무기 사기', h: '정산으로 번 돈으로 상점의 무기 탭에서 권총보다 강한 총을 사세요.', ok: () => Object.keys(GS.save.weapons).length > 1, go: () => { GS.hubView = 'shop'; GS.shopTab = '무기'; } },
  { t: 'OP-B 공장 침투 완수', h: '중장갑형이 나옵니다. 다리와 등 뒤 동력 장치를 노리세요.', ok: () => GS.save.stats.B.clears > 0, go: () => { GS.selectedMission = 'B'; } },
  { t: '방어복 사기', h: '상점의 방어복 · 회수 탭에서 방어복을 사면 체력과 피해 감소가 늘어납니다.', ok: () => GS.save.armor >= 1, go: () => { GS.hubView = 'shop'; GS.shopTab = '방어복 · 회수'; } },
  { t: 'OP-C 변전소 장악 완수', h: '구역 세 곳 안에 머물러 점령하세요. 저격형의 붉은 조준선을 조심하세요.', ok: () => GS.save.stats.E.clears > 0, go: () => { GS.selectedMission = 'E'; } },
  { t: '보스 REX-09 격파', h: '무릎 관절을 부숴 주저앉히고 등의 동력로를 노리세요. 기둥에 돌진을 유도하면 기절합니다.', ok: () => GS.save.stats.C.clears > 0, go: () => { GS.selectedMission = 'C'; } },
  { t: '보스 ARACHNE 격파', h: '다리 세 개를 부수면 주저앉아 동력로가 드러납니다. 자폭 거미는 다가오기 전에 쏘세요.', ok: () => GS.save.stats.F.clears > 0, go: () => { GS.selectedMission = 'F'; } },
  { t: '보스 청룡 격파', h: '여의주를 먼저 부수고, 동력 마디가 열릴 때 노리세요. EMP를 맞히면 땅으로 떨어집니다.', ok: () => GS.save.stats.D.clears > 0, go: () => { GS.selectedMission = 'D'; } },
  { t: '상점 장비 모두 구매', h: '익스트림 작전이 열립니다. 소모품과 무기 강화는 제외됩니다.', ok: () => extremeUnlocked(), go: () => { GS.hubView = 'shop'; } },
  { t: '익스트림 · 삼중 위협 완수', h: '세 보스가 한꺼번에 나옵니다. 방어복과 보조 장비 없이 깨야 합니다.', ok: () => GS.save.stats.G.clears > 0, go: () => { GS.selectedMission = 'G'; } },
  { t: '최종 작전 · 근원지 완수', h: '기계를 만들어 내는 생산 코어를 멈추세요. 이것이 마지막 작전입니다.', ok: () => GS.save.stats.H.clears > 0, go: () => { GS.selectedMission = 'H'; } },
];
function curGoal() { const i = GOALS.findIndex(g => !g.ok()); return i < 0 ? null : { i, g: GOALS[i] }; }
const GUIDE_HTML = () => `<div class="guide">
  <p>기계들이 장악한 버려진 도시에서, 당신은 <b>기계 부품을 회수해 파는 용병</b>입니다. 작전에 나가 기계를 부수고, 떨어진 부품을 들고 돌아와 돈을 벌고, 그 돈으로 장비를 사서 더 강한 기계에 도전합니다. 마지막에는 기계를 만들어 내는 곳을 찾아 멈추는 것이 목표입니다.</p>
  <h3>한 번의 작전</h3>
  <ol><li>거점에서 <b>작전을 고르고 출격</b>합니다.</li><li>기계의 <b>부위</b>를 골라 부숩니다. 정면 장갑보다 관절 · 센서 · 등 뒤 동력 장치가 약점입니다.</li>
  <li>떨어진 <b>부품을 밟아서 줍습니다.</b> 너무 많이 들면 가방이 무거워져 느려집니다.</li><li>목표를 끝내고 화면의 <b>◇ 탈출 표지</b>를 따라가 탈출합니다.</li>
  <li><b>정산</b>: 계약금 + 처치 보상 + 부품 판매가를 받습니다. 부품은 손상될수록 값이 떨어지고, 파괴된 부품은 0입니다.</li></ol>
  <h3>거점 화면 보는 법</h3>
  <ul><li><b>작전 목록</b>: 오른쪽의 막대 세 칸은 위험도, 숫자는 계약금(CR)입니다. 고르면 아래에 설명이 나옵니다.</li>
  <li><b>지금 할 일</b>: 오른쪽 아래 상자에 다음 목표가 나옵니다. 누르면 해당 작전이나 상점으로 이동합니다.</li>
  <li><b>현재 장비</b>: 이번 출격에 들고 갈 무기 · 방어복 · 가방 · 스킬입니다. 상점에서 바꿉니다.</li>
  <li><b>상점</b>: 무기 · 무기 강화 · 개조 · 스킬 · 소모품 · 방어복 · 가방 · 보조 장비를 삽니다.</li>
  <li><b>하드 모드</b>: 작전을 보통으로 한 번 깨면 열립니다. 적이 강해지는 대신 보상이 커집니다.</li></ul>
  <h3>죽으면</h3><p>그 작전에서 주운 부품과 보상을 잃습니다. 산 장비와 가진 돈은 그대로 남습니다.</p></div>`;
// 출격 때 들고 가는 주무기 (장착 무기 + 함께 휴대, 최대 3정)
// 무기 슬롯 3칸: [주무기, 휴대 1, 휴대 2] (비어 있으면 null)
function invSlots() { const c = GS.save.carry || []; const L = [GS.save.equipped && GS.save.equipped !== 'pistol' && GS.save.weapons[GS.save.equipped] ? GS.save.equipped : null, c[0] || null, c[1] || null]; return L.map(id => id && GS.save.weapons[id] ? id : null); }
function invPut(gid, k) {
  if (!gid || gid === 'pistol' || !GS.save.weapons[gid]) return;
  const L = invSlots(), i = L.indexOf(gid);
  if (k == null) { if (i >= 0) return; k = L.indexOf(null); if (k < 0) { popup('슬롯이 가득 찼습니다 · 끌어서 바꾸세요', 'dim'); return; } }
  const prev = L[k]; L[k] = gid; if (i >= 0 && i !== k) L[i] = prev;
  invSave(L);
}
function invRemove(gid) { const L = invSlots(), i = L.indexOf(gid); if (i < 0) return; L[i] = null; invSave(L); }
function invSave(L) { GS.save.equipped = L[0] || 'pistol'; GS.save.carry = [L[1], L[2]].filter(Boolean); writeSave(); SFX.ui(); renderHub(); }
let invSkinGun = '';
function carryList() { return [GS.save.equipped, ...(GS.save.carry || [])].filter((id, i, a) => id && id !== 'pistol' && GS.save.weapons[id] && a.indexOf(id) === i).slice(0, MAX_CARRY); }
let rebindA = '', achOpen = new Set(), demoSkill = '';
function itemPrice(it) {
  if (it.kind === 'wlv') { const l = GS.save.wlv[it.wid] || 0; return l < WLV_MAX ? wlvBase(it.wid) * WLV_MULT[l] : Infinity; }
  if (it.kind === 'mod') { const m = MODS[it.mid], l = modLv(it); return l < m.prices.length ? m.prices[l] : Infinity; }
  return itemDef(it).price;
}
function itemName(it) { const d = itemDef(it); return it.kind === 'mod' ? `${d.name} ${modLv(it) + 1}단계` : d.name; }
function itemOwned(it) {
  if (it.kind === 'wlv') return (GS.save.wlv[it.wid] || 0) >= WLV_MAX;
  if (it.kind === 'weapon') return !!GS.save.weapons[it.id];
  if (it.kind === 'armor') return GS.save.armor >= it.lvl;
  if (it.kind === 'bag') return (GS.save.bag || 0) >= it.lvl;
  if (it.kind === 'util') return !!GS.save.utils[it.id];
  if (it.kind === 'skill') return !!GS.save.skills[it.id];
  if (it.kind === 'mod') return modLv(it) >= MODS[it.mid].prices.length;
  if (it.kind === 'cons') return (GS.save.inv[it.id] || 0) >= CONSUMABLES[it.id].max;
  return GS.save.salvage >= it.lvl;
}
function itemReqOk(it) {
  if (it.kind === 'wlv') return !!GS.save.weapons[it.wid];
  if (it.kind === 'armor') return GS.save.armor >= it.lvl - 1;
  if (it.kind === 'salvage') return GS.save.salvage >= it.lvl - 1;
  if (it.kind === 'bag') return (GS.save.bag || 0) >= it.lvl - 1;
  return true;
}
function cmpRow(label, a, b, better, suffix = '') {
  const cls = a === b ? 'dim' : ((better === 'up' ? b > a : b < a) ? 'ok' : 'bad');
  const f = v => typeof v === 'number' ? (Number.isInteger(v) ? fmt(v) : v.toFixed(2)) : v;
  return `<span class="h">${label}</span><span>${f(a)}${suffix}</span><span class="ar">→</span><span class="${cls}">${f(b)}${suffix}</span>`;
}
function weaponCmp(cur, nw) {
  const rpm = w => Math.round(60 / w.interval);
  const dm = w => w.dmg * (w.pellets || 1);
  return cmpRow('발당 피해', dm(cur), dm(nw), 'up') + cmpRow('연사 (RPM)', rpm(cur), rpm(nw), 'up') + cmpRow('탄창', cur.mag, nw.mag, 'up') +
    cmpRow('장갑 관통', cur.armorMult, nw.armorMult, 'up') + cmpRow('무게', GUN_KG[cur.id] || 0, GUN_KG[nw.id] || 0, 'down', 'kg');
}
function renderHub() {
  const eq = WEAPONS[GS.save.equipped], arm = ARMORS[GS.save.armor], sal = SALVAGES[GS.save.salvage];
  const goal = nextGoal();
  const card = it => {
    const d = itemDef(it), owned = itemOwned(it), reqOk = itemReqOk(it), price = itemPrice(it), afford = GS.save.credits >= price;
    let cmp = '', act = '', priceTxt = `${fmt(price)} CR`, name = d.name;
    const buyBtn = (label = '구매') => !reqOk ? `<button disabled>${label}</button><span class="note">선행 장비 필요</span>`
      : `<button class="${afford ? 'primary' : ''}" data-buy="${it.id}" ${afford ? '' : 'disabled'}>${label}</button>${afford ? '' : `<span class="note">${fmt(price - GS.save.credits)} CR 부족</span>`}`;
    if (it.kind === 'weapon') {
      cmp = weaponCmp(eq, d);
      if (!owned) act = buyBtn();
      else if (GS.save.equipped === it.id) act = `<span class="note ok">주무기 · 장착 중</span>`;
      else { const inC = carryList().includes(it.id), full = carryList().length >= MAX_CARRY;
        act = `<button data-equip="${it.id}">주무기로 장착</button>` + (inC ? `<button data-carry="${it.id}">휴대 해제</button><span class="note ok">함께 휴대 중</span>`
          : `<button data-carry="${it.id}" ${full ? 'disabled' : ''}>함께 휴대</button><span class="note">${full ? `최대 ${MAX_CARRY}정` : '보유'}</span>`); }
    } else if (it.kind === 'armor') {
      cmp = cmpRow('최대 체력', arm.hp, d.hp, 'up') + cmpRow('피해 감소', Math.round(arm.dr * 100), Math.round(d.dr * 100), 'up', '%');
      act = owned ? `<span class="note ok">보유${GS.save.armor === it.lvl ? ' · 착용 중' : ''}</span>` : buyBtn();
    } else if (it.kind === 'bag') {
      cmp = cmpRow('가방 용량', BAGS[GS.save.bag || 0].cap, d.cap, 'up', 'kg');
      act = owned ? `<span class="note ok">보유${(GS.save.bag || 0) === it.lvl ? ' · 사용 중' : ''}</span>` : buyBtn();
    } else if (it.kind === 'salvage') {
      cmp = cmpRow('회수 보너스', Math.round(sal.bonus * 100), Math.round(d.bonus * 100), 'up', '%');
      act = owned ? `<span class="note ok">보유${GS.save.salvage === it.lvl ? ' · 사용 중' : ''}</span>` : buyBtn();
    } else if (it.kind === 'util') {
      act = owned ? `<span class="note ok">보유 · 자동 적용</span>` : buyBtn();
    } else if (it.kind === 'mod') {
      const l = modLv(it), mx = d.prices.length;
      name = `${d.name} <span class="dim mono">${l}/${mx}</span>`;
      cmp = cmpRow('현재', 0, 0, 'up').replace(/<span>0<\/span><span class="ar">→<\/span><span class="dim">0<\/span>/, `<span></span><span></span><span>${l ? d.fx(l) : '없음'}</span>`)
        + (l < mx ? `<span class="h">다음 단계</span><span></span><span></span><span class="ok">${d.fx(l + 1)}</span>` : '');
      if (l >= mx) { priceTxt = '최대'; act = `<span class="note ok">최대 단계</span>`; } else act = buyBtn(`${l + 1}단계 업그레이드`);
    } else if (it.kind === 'wlv') {
      const l = GS.save.wlv[it.wid] || 0;
      name = `${WEAPONS[it.wid].name} <span class="dim mono">${l}/${WLV_MAX}</span>`;
      cmp = '';
      if (l >= WLV_MAX) { priceTxt = '최대'; act = `<span class="note ok">최대 단계</span>`; }
      else act = reqOk ? buyBtn(`${l + 1}단계 강화`) : `<button disabled>${l + 1}단계 강화</button><span class="note">총기 보유 필요</span>`;
    } else if (it.kind === 'skill') {
      cmp = `<span class="h">재사용 대기</span><span></span><span></span><span>${d.cd}초</span>`;
      if (owned) act = [0, 1].map(i => GS.save.slots[i] === it.id ? `<span class="note ok">${SLOT_KEYS[i]} 슬롯 장착 중</span>` : `<button data-slot="${i}" data-skill="${it.id}">${SLOT_KEYS[i]} 슬롯에 장착</button>`).join('');
      else act = buyBtn();
    } else if (it.kind === 'cons') {
      const n = GS.save.inv[it.id] || 0, need = d.max - n, fillCost = need * d.price;
      cmp = `<span class="h">보유</span><span></span><span></span><span class="${n ? 'ok' : 'dim'}">${n} / ${d.max}</span>`;
      priceTxt = `${fmt(d.price)} CR / 개`;
      act = n >= d.max ? `<span class="note ok">가득 참</span>`
        : `<button class="${afford ? 'primary' : ''}" data-buy="${it.id}" ${afford ? '' : 'disabled'}>+1</button>` +
          (need > 1 ? `<button data-fill="${it.id}" ${GS.save.credits >= fillCost ? '' : 'disabled'}>가득 채우기 ${fmt(fillCost)}</button>` : '');
    }
    const ownedCls = (it.kind === 'cons' || it.kind === 'mod' || it.kind === 'wlv') ? '' : (owned ? 'owned' : '');
    const eqCls = it.kind === 'weapon' && GS.save.equipped === it.id ? ' equipped' : '';
    const cTag = it.kind === 'weapon' && !eqCls && carryList().includes(it.id) ? '<span class="eqtag">휴대</span>' : '';
    const gid = it.kind === 'weapon' ? it.id : it.kind === 'wlv' ? it.wid : '';
    const demo = it.kind === 'skill' ? ` data-demo="${it.id}"` : '';
    return `<div class="item ${ownedCls}${eqCls}${it.kind === 'skill' && demoSkill === it.id ? ' demo' : ''}"${demo}>${gid ? `<img class="gimg" alt="" src="${gunThumb(gid)}">` : ''}<div class="hd"><span class="nm">${name}${eqCls ? '<span class="eqtag">장착 중</span>' : cTag}</span><span class="pr">${priceTxt}</span></div>
      <div class="ds">${d.desc}${it.kind === 'skill' ? '<br><span class="acc" style="font-size:13px">카드를 누르면 오른쪽 아래에서 사용 모습을 볼 수 있습니다</span>' : ''}</div>${cmp ? `<div class="cmp">${cmp}</div>` : ''}<div class="act">${act}</div></div>`;
  };
  const tabs = SHOP_CATS.map(c => `<button class="tab ${c === GS.shopTab ? 'sel' : ''}" data-tab="${c}">${c} <span class="dim mono">${SHOP.filter(x => x.cat === c).length}</span></button>`).join('');
  const shopHtml = `<div class="tabs">${tabs}</div><div class="shop">${SHOP.filter(x => x.cat === GS.shopTab).map(card).join('')}</div>`;
  const DIFF = { '낮음': 1, '높음': 2, '최상': 3 };
  const sm = MISSIONS[GS.selectedMission], st = GS.save.stats[sm.id];
  const row = (k, v) => `<div class="lo"><span>${k}</span><b>${v}</b></div>`;
  const skillTxt = [0, 1].map(i => GS.save.slots[i] ? `<span class="acc mono">${SLOT_KEYS[i]}</span> ${SKILLS[GS.save.slots[i]].name}` : '').filter(Boolean).join('<br>') || '<span class="dim">없음</span>';
  const nadeTxt = GRENADES.map(g => `${CONSUMABLES[g].name.replace(' 수류탄', '')} ${GS.save.inv[g] || 0}`).join(' · ');
  const goalTxt = goal ? `<div class="nextgoal">${row('다음 목표', itemName(goal))}
      <div class="bar"><i style="width:${clamp(GS.save.credits / itemPrice(goal) * 100, 0, 100)}%"></i></div>
      <div class="dim mono" style="font-size:14px;margin-top:6px">${GS.save.credits >= itemPrice(goal) ? '<span class="ok">구매 가능</span>' : fmt(itemPrice(goal) - GS.save.credits) + ' CR 부족'}</div></div>` : '';
  // 작전 카드 (목록) · 오른쪽 브리핑 · 출격 — 작전 목록에서 고르고, 브리핑을 읽고, 오른쪽 아래에서 출격
  const misState = m => {
    const st2 = GS.save.stats[m.id] || {};
    if (!GS.save.unlocked[m.id]) return '<span class="mst lock">잠김</span>';
    if (m.extreme && !extremeUnlocked()) return `<span class="mst lock">잠김 ${extremeProgress().join('/')}</span>`;
    if (st2.hard) return '<span class="mst hard">하드 클리어</span>';
    if (st2.clears) return '<span class="mst ok">클리어</span>';
    return '<span class="mst new">미완료</span>';
  };
  const opCard = m => `<div class="op ${GS.selectedMission === m.id ? 'sel' : ''} ${m.boss ? 'boss' : ''} ${!GS.save.unlocked[m.id] || (m.extreme && !extremeUnlocked()) ? 'locked' : ''}" data-mis="${m.id}">
      <div class="r1"><span class="opc mono">${m.code}</span><span class="pips">${[1, 2, 3].map(i => `<i class="${i <= DIFF[m.diff] ? 'on' : ''}"></i>`).join('')}</span>${misState(m)}</div>
      <div class="opn">${m.name.replace(/^최종 작전( [IV]+)? · /, '')}</div>
      <div class="r2"><span>${m.target[0]}</span><span class="mono acc">${fmt(m.contract)} CR</span></div></div>`;
  const MGROUPS = [['일반 작전', ['A', 'B', 'E']], ['보스 작전', ['C', 'F', 'D']], ['특수 작전', ['G', 'H']]];
  const opList = MGROUPS.map(([g, ids]) => `<div class="mgrp"><div class="mgh">${g}</div>${ids.map(id => opCard(MISSIONS[id])).join('')}</div>`).join('');
  const chaosOn = !!GS.save.chaosSel && chaosUnlocked(GS.selectedMission), hardOn = !chaosOn && GS.save.hardSel && hardUnlocked(GS.selectedMission);
  const chaosAch = { C: 'chaosRex', F: 'chaosSpider', D: 'chaosDragon' }[GS.selectedMission];
  const diffBlock = sm.final ? `<div class="extag">${GS.save.unlocked.H ? '최종 작전 · 단독 출격 · 계약금 20,000 CR' : '익스트림 작전을 완수하면 근원지의 좌표가 열립니다'}</div>`
    : sm.extreme ? (extremeUnlocked() ? '<div class="extag">세 보스 동시 출현 · 방어복 · 보조 장비 사용 불가</div>' : `<div class="extag dimtag">상점의 장비를 모두 구매하면 열립니다 (소모품 · 무기 강화 제외). 현재 <b class="acc">${extremeProgress().join(' / ')}</b></div>`)
    : `<div class="diffsel"><button data-diff="0" class="${!hardOn && !chaosOn ? 'sel' : ''}">보통</button><button data-diff="1" class="hard ${hardOn ? 'sel' : ''}" ${hardUnlocked(GS.selectedMission) ? '' : 'disabled'}>하드 <span>×2</span></button>${CHAOS_IDS.includes(GS.selectedMission) ? `<button data-diff="2" class="chaos ${chaosOn ? 'sel' : ''}" ${chaosUnlocked(GS.selectedMission) ? '' : 'disabled'}>카오스 <span>×3</span></button>` : ''}</div>
       ${!hardUnlocked(GS.selectedMission) ? `<div class="dim" style="font-size:13.5px;margin-top:6px">하드${CHAOS_IDS.includes(GS.selectedMission) ? ' · 카오스' : ''} 모드는 이 작전을 보통으로 한 번 클리어하면 열립니다.</div>` : ''}
       ${chaosOn ? `<div class="chaosrule"><b>카오스 규정</b> 기본 권총 하나만 · 강화 · 개조 · 스킬 · 소모품 · 방어복 · 보조 장비 없음<br><b>특수 패턴</b> 모든 공격이 빨라지고 붉은 균열 낙뢰와 보스 전용 패턴이 추가됩니다<br><b>첫 클리어 보상</b> ${achGot(chaosAch) ? '<span class="ok">획득 완료</span>' : `${SKIN_THEMES[SKINS[ACH_BY[chaosAch].skin].theme].name} 스킨 세트 · 모든 총`}</div>` : ''}`;
  const pay = sm.contract * (chaosOn ? 3 : hardOn ? 2 : 1);
  const mainView = `<div class="hubhome msel">
      <aside class="mlist">
        ${(() => { const cg = curGoal(); const done = GOALS.filter(g => g.ok()).length;
          return cg ? `<div class="goalbox" id="goalbox"><div class="lbl">지금 할 일 · ${cg.i + 1} / ${GOALS.length}</div><div class="gt">${cg.g.t}</div><div class="gh">${cg.g.h}</div><div class="gb"><i style="width:${done / GOALS.length * 100}%"></i></div></div>`
            : `<div class="goalbox"><div class="lbl">모든 목표 달성</div><div class="gt">근원지를 멈췄습니다</div><div class="gh">하드 모드와 업적에 도전해 보세요.</div></div>`; })()}
        <div class="ops">${opList}</div>
      </aside>
      <aside class="mbrief ${sm.boss ? 'boss' : ''}">
        <div class="bscroll">
          <div class="lbl">작전 브리핑 · ${sm.code}</div>
          <div class="bname">${sm.name}</div>
          <div class="bsub">${sm.target[1]}</div>
          <p class="bdesc">${sm.desc}</p>
          <div class="bsec"><span>목표</span><b>${sm.relays ? '구역 3곳 점령 후 탈출' : sm.boss ? `${sm.target[0]} 격파 후 탈출` : '기계를 정리하고 부품을 회수해 탈출'}</b></div>
          <div class="bsec"><span>위협</span><b>${sm.enemies}</b></div>
          <div class="bsec"><span>권장 장비</span><b>${sm.rec}</b></div>
          <div class="bsec"><span>보상</span><b><span class="acc mono">${fmt(pay)} CR</span>${chaosOn ? ' <span class="dim">(카오스 ×3)</span>' : hardOn ? ' <span class="dim">(하드 ×2)</span>' : ''} + 회수한 부품${sm.partMult > 1 ? ` <span class="dim">(부품 가치 ×${sm.partMult})</span>` : ''}</b></div>
          ${st && st.runs ? `<div class="bsec"><span>내 기록</span><b>클리어 ${st.clears} / 출격 ${st.runs}${st.hard ? ` · 하드 ${st.hard}` : ''} · 최고 ${fmt(st.best)} CR</b></div>` : ''}
          <div class="bsec"><span>내 장비</span><b>${chaosOn ? '<span style="color:#ff8a9c">카오스 · 기본 권총만 (강화 · 스킬 · 방어복 없음)</span>' : `${WEAPONS[GS.save.equipped].name}${carryList().length > 1 ? ` 외 ${carryList().length - 1}정` : ''} · ${sm.extreme ? '방어복 사용 불가' : arm.name} · ${BAGS[GS.save.bag || 0].cap}kg`} <button class="mini" data-view="inv">인벤토리</button></b></div>
        </div>
        <div class="bfoot">
          ${diffBlock}
          <button class="primary deploy ${chaosOn ? 'chaos' : sm.extreme || sm.final || hardOn ? 'hard' : ''}" id="deploy" ${(sm.extreme && !extremeUnlocked()) || !GS.save.unlocked[sm.id] ? 'disabled' : ''}>${sm.final ? '최종 출격' : sm.extreme ? '익스트림 출격' : chaosOn ? '카오스 출격' : hardOn ? '하드 출격' : '출격'} <span class="mono">ENTER</span></button>
        </div>
      </aside>
    </div>`;
  // ---------- 인벤토리 (배틀그라운드식) ----------
  const L = invSlots();
  const ownedGuns = ALL_GUNS.filter(id => id !== 'pistol' && GS.save.weapons[id]);
  const skinCnt = gid => skinsFor(gid).filter(skinOwned).length;
  const skinName = gid => { const sid = skinSel(gid); return sid ? SKIN_THEMES[SKINS[sid].theme].name : '기본'; };
  const gunRow = gid => { const si = L.indexOf(gid);
    return `<div class="prow ${si >= 0 ? 'on' : ''}" draggable="true" data-ig="${gid}"><img alt="" src="${gunThumb(gid)}"><div class="pn"><b>${WEAPONS[gid].name}</b><span>Lv ${GS.save.wlv[gid] || 0} · ${GUN_KG[gid]}kg · 스킨 ${skinCnt(gid)}/${skinsFor(gid).length}</span></div><span class="pst">${si === 0 ? '주무기' : si > 0 ? `휴대 ${si}` : ''}</span></div>`; };
  const slotCard = (k, label) => { const gid = k < 3 ? L[k] : 'pistol';
    return `<div class="pslot ${gid ? '' : 'empty'} ${k === 3 ? 'fixed' : ''}" data-islot="${k}" ${gid && k < 3 ? `draggable="true" data-ig="${gid}"` : ''}>
      <div class="sl"><span class="mono">${k + 1}</span>${label}</div>
      ${gid ? `<img alt="" src="${gunThumb(gid)}"><div class="sn"><b>${WEAPONS[gid].name}</b><span>Lv ${GS.save.wlv[gid] || 0} · ${GUN_KG[gid]}kg</span></div>
        <button class="skinbtn" data-skinpick="${gid}"><i class="sw ${skinSel(gid) ? 'th-' + SKINS[skinSel(gid)].theme : ''}"></i>${skinName(gid)} <span class="dim">· 스킨 ${skinCnt(gid)}/${skinsFor(gid).length}</span></button>`
        : `<div class="ph">왼쪽 목록에서 총을 끌어 놓으세요</div>`}</div>`; };
  const eqBox = (cls, label, val, sub = '') => `<div class="peq ${cls}"><span>${label}</span><b>${val}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
  const totKg = L.filter(Boolean).reduce((a, id) => a + GUN_KG[id], 0);
  const allSk = Object.keys(SKINS), gotSk = allSk.filter(skinOwned);
  let picker = '';
  if (invSkinGun) {
    const gid = invSkinGun, cur = skinSel(gid);
    const opt = sid => { const own = !sid || skinOwned(sid), T = sid ? SKIN_THEMES[SKINS[sid].theme] : null, a = sid ? skinAch(sid) : null;
      return `<div class="skc ${cur === sid ? 'sel' : ''} ${own ? '' : 'lock'} ${T && T.chaos ? 'chaos' : ''}" ${own ? `data-skinset="${sid}"` : ''}>
        <img alt="" src="${gunThumb(gid, sid)}">
        <div class="skn"><b>${T ? T.name : '기본'}</b>${T && T.chaos ? '<span class="ctag">카오스</span>' : ''}${SKINS[sid] && SKINS[sid].guns === 'all' ? '<span class="stag">세트</span>' : ''}</div>
        <div class="skd">${T ? T.desc : '공장에서 막 나온 기본 도색.'}</div>
        <div class="ska">${!sid ? '' : own ? `<span class="ok">획득</span> · ${a.name}` : `<span class="lk">잠김</span> · 업적 「${a.hidden && !achGot(a.id) ? '???' : a.name}」 ${a.hidden && !achGot(a.id) ? a.hint : a.desc}`}</div>
        <div class="skb">${cur === sid ? '<span class="ok">장착 중</span>' : own ? '<button class="primary">장착</button>' : ''}</div></div>`; };
    picker = `<div class="overlay" id="skinov"><div class="sheet skinsheet"><header><h2>${WEAPONS[gid].name} · 스킨</h2><span class="lbl">획득 ${skinCnt(gid)} / ${skinsFor(gid).length}</span></header>
      <div class="body"><div class="skgrid">${['', ...skinsFor(gid)].map(opt).join('')}</div></div><div class="foot"><button class="primary" data-skinclose>닫기</button></div></div></div>`;
  }
  const invView = `<div class="pinv">
      <section class="pcol plist" data-idrop="list"><div class="ph3">보유 무기 <span class="dim">${ownedGuns.length + 1}</span></div>
        <div class="prow fixedrow"><img alt="" src="${gunThumb('pistol')}"><div class="pn"><b>${WEAPONS.pistol.name}</b><span>항상 휴대 · 탄약 무한 · 스킨 ${skinCnt('pistol')}/${skinsFor('pistol').length}</span></div><span class="pst">보조</span></div>
        ${ownedGuns.map(gunRow).join('') || '<div class="dim" style="padding:14px 4px">상점에서 총을 사면 여기에 보입니다.</div>'}
        <div class="phint">끌어서 오른쪽 슬롯에 놓으면 장착 · 슬롯의 총을 이 목록으로 끌어 놓으면 해제 · 누르면 빈 슬롯에 장착</div></section>
      <section class="pcol pchar"><div class="ph3">장비</div>
        <div class="pfig">
          <svg viewBox="0 0 200 320" class="sil"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><circle cx="100" cy="42" r="24"/><path d="M62 82 Q100 70 138 82 L150 170 L132 172 L128 120 L124 196 L134 300 L110 300 L100 210 L90 300 L66 300 L76 196 L72 120 L68 172 L50 170 Z"/></g></svg>
          ${eqBox('e-armor', '방어복', arm.name, `체력 ${arm.hp} · 피해 감소 ${Math.round(arm.dr * 100)}%`)}
          ${eqBox('e-bag', '가방', BAGS[GS.save.bag || 0].name, `${BAGS[GS.save.bag || 0].cap}kg · 총 ${totKg}kg`)}
          ${eqBox('e-salv', '회수 장비', sal.name, sal.bonus ? `회수 보너스 ${Math.round(sal.bonus * 100)}%` : '')}
          ${eqBox('e-sk1', `스킬 ${SLOT_KEYS[0]}`, GS.save.slots[0] ? SKILLS[GS.save.slots[0]].name : '<span class="dim">비어 있음</span>')}
          ${eqBox('e-sk2', `스킬 ${SLOT_KEYS[1]}`, GS.save.slots[1] ? SKILLS[GS.save.slots[1]].name : '<span class="dim">비어 있음</span>')}
        </div>
        <div class="putil">${Object.values(UTILS).map(u => `<div class="${GS.save.utils[u.id] ? 'on' : ''}" title="${u.desc}">${u.name}</div>`).join('')}</div>
        <div class="pcons">${Object.values(CONSUMABLES).map(c => `<div><span>${c.name}</span><b class="mono">${GS.save.inv[c.id] || 0}<i>/${c.max}</i></b></div>`).join('')}</div>
        <div class="pskins"><span>획득한 스킨</span><b class="mono acc">${gotSk.length} / ${allSk.length}</b><div class="pskb">${gotSk.map(sid => `<i class="sw th-${SKINS[sid].theme}" title="${SKIN_THEMES[SKINS[sid].theme].name}"></i>`).join('') || '<span class="dim">보스 업적을 달성하면 스킨을 받습니다</span>'}</div></div>
      </section>
      <section class="pcol pslots"><div class="ph3">무기 슬롯 <span class="dim">${L.filter(Boolean).length + 1} / 4</span></div>
        ${slotCard(0, '주무기')}${slotCard(1, '휴대')}${slotCard(2, '휴대')}${slotCard(3, '보조 권총')}
      </section>
    </div>${picker}`;
  const shopView = `<div class="shopview">${shopHtml}</div>`;
  let modal = '';
  if (GS.hubModal === 'rec') {
    modal = `<div class="overlay" id="hmodal"><div class="sheet" style="width:min(620px,94vw)"><header><div class="mtabs"><button class="sel" data-modal="rec">작전 기록</button><button data-modal="ach">업적 <span class="mono dim">${Object.keys(GS.save.ach.done).length}/${ACH.length}</span></button></div></header><div class="body">
      <div class="rec"><span>누적 처치</span><span>${fmt(GS.save.kills)}</span><span>누적 수익</span><span>${fmt(GS.save.totalEarned)} CR</span><span>사망</span><span>${GS.save.deaths}</span>
      ${[['', 'REX-09'], ['F', 'ARACHNE'], ['D', '청룡'], ['G', '삼중 위협'], ['H', '생산 코어']].map(([k, nm]) => `<span>${nm} 최단 격파</span><span>${GS.save.records['bossTime' + k] ? GS.save.records['bossTime' + k].toFixed(1) + '초' : '-'}</span><span>${nm} 권총 격파</span><span>${GS.save.records['pistolBoss' + k] ? '<span class="acc">달성</span>' : '미달성'}</span>`).join('')}</div>
      <div class="rec" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">${Object.values(MISSIONS).filter(m => !m.tut).map(m => `<span>${m.code} ${m.name}</span><span>${GS.save.stats[m.id].clears} / ${GS.save.stats[m.id].runs}${GS.save.stats[m.id].hard ? ` · 하드 ${GS.save.stats[m.id].hard}` : ''} · 최고 ${fmt(GS.save.stats[m.id].best)}</span>`).join('')}</div>
      <div class="lbl" style="margin-top:16px">무전 기록 ${Object.keys(LORE).filter(k => GS.save.lore[k]).length} / 7</div>
      <div class="lorelist">${Object.entries(LORE).map(([k, l]) => GS.save.lore[k] ? `<div><b class="mono" style="color:#6ad8ff">${l.n}</b> ${l.from} · ${l.text}</div>` : `<div class="dim">${l.n} · 수신 대기 (${MISSIONS[k].code} ${MISSIONS[k].name} 완수)</div>`).join('')}</div>
      </div><div class="foot"><button class="primary" data-close>닫기</button></div></div></div>`;
  } else if (GS.hubModal === 'ach') {
    const got = Object.keys(GS.save.ach.done).length, earned = ACH.filter(a => achGot(a.id)).reduce((t, a) => t + a.cr, 0);
    const inGrp = new Set(ACH_GROUPS.flatMap(g => g[1]));
    const groups = [...ACH_GROUPS, ['기상천외 · 숨김', ACH.filter(a => !inGrp.has(a.id)).map(a => a.id)]];
    const rowOf = a => {
      const ok = achGot(a.id), hid = a.hidden && !ok, pr = !ok && a.prog ? a.prog() : null;
      const ch = ACH_CHAINS.find(c => c.includes(a.id)), tier = ch ? `<span class="dim mono" style="font-size:12.5px"> ${ch.indexOf(a.id) + 1}/${ch.length}단계</span>` : '';
      return `<div class="achrow ${ok ? 'got' : 'lock'}"><span class="an">${hid ? '???' : a.name}${tier}</span>
        <span class="ar">${ok ? '<span class="ok">달성</span>' : `+${fmt(a.cr)} CR`}${pr && !hid ? `<div class="dim" style="font-size:13px;margin-top:2px">${fmt(Math.min(Math.floor(pr[0]), pr[1]))} / ${fmt(pr[1])}</div>` : ''}</span>
        <span class="ad">${hid ? '힌트 · ' + a.hint : a.desc}</span>
        ${pr && !hid ? `<span class="pb"><i style="width:${clamp(pr[0] / pr[1] * 100, 0, 100)}%"></i></span>` : ''}</div>`;
    };
    const rows = groups.map(([nm, ids]) => {
      const list = ids.map(id => ACH_BY[id]).filter(Boolean);
      const shown = list.filter(a => { const ch = ACH_CHAINS.find(c => c.includes(a.id)); if (!ch) return true; const cur = ch.find(id => !achGot(id)) || ch[ch.length - 1]; return a.id === cur; });
      const n = list.filter(a => achGot(a.id)).length, open = achOpen.has(nm);
      return `<div class="achgrp ${open ? 'open' : ''}"><div class="gh" data-achg="${nm}"><b>${open ? '▾' : '▸'} ${nm}</b><span class="c ${n === list.length ? 'ok' : ''}">${n} / ${list.length}</span>
        <span class="pb"><i style="width:${n / Math.max(1, list.length) * 100}%"></i></span></div>${open ? `<div class="gb">${shown.map(rowOf).join('')}</div>` : ''}</div>`;
    }).join('');
    modal = `<div class="overlay" id="hmodal"><div class="sheet" style="width:min(620px,94vw)"><header><div class="mtabs"><button data-modal="rec">작전 기록</button><button class="sel" data-modal="ach">업적</button></div><span class="lbl">${got} / ${ACH.length} · 보상 ${fmt(earned)} CR</span></header>
      <div class="body">${rows}</div><div class="foot"><button class="primary" data-close>닫기</button></div></div></div>`;
  } else if (GS.hubModal === 'guide' || GS.hubModal === 'intro') {
    const first = GS.hubModal === 'intro';
    modal = `<div class="overlay" id="hmodal"><div class="sheet" style="width:min(720px,94vw)"><header><h2>${first ? 'MARGIN에 오신 것을 환영합니다' : '게임 안내'}</h2></header><div class="body">${GUIDE_HTML()}</div>
      <div class="foot">${first ? '<button data-close>나중에 할게요</button><button class="primary" data-gotut>훈련장부터 시작 (추천)</button>' : '<button class="primary" data-close>닫기</button>'}</div></div></div>`;
  } else if (GS.hubModal === 'coop') {
    modal = coopModalHtml();
  } else if (GS.hubModal === 'set') {
    const kb = KEYDEF.map(([a, nm]) => `<span>${nm}</span><button data-rebind="${a}" class="${rebindA === a ? 'wait' : ''}">${rebindA === a ? '키를 누르세요' : keyLabel(bind(a))}</button>`).join('');
    modal = `<div class="overlay" id="hmodal"><div class="sheet" style="width:min(680px,94vw)"><header><h2>설정 · 조작법</h2></header><div class="body">
      <div class="sens" style="margin-top:0"><span>마우스 감도</span><input type="range" id="hsens" min="0.3" max="2.5" step="0.05" value="${GS.save.sens}"><span class="mono" id="hsensv">${(+GS.save.sens).toFixed(2)}</span></div>
      <div class="sens"><span>UI 크기</span><input type="range" id="huiz" min="0.75" max="1.8" step="0.05" value="${uiScaleNow()}"><span class="mono" id="huizv">${Math.round(uiScaleNow() * 100)}%${GS.save.uiScale ? '' : ' 자동'}</span><button class="btn" id="huizauto" style="margin-left:10px;padding:4px 10px">자동</button></div>
      ${[['all', '전체 소리'], ['sfx', '효과음 · 내 총'], ['enemy', '기계 소리 (적)']].map(([k, n]) => `<div class="sens"><span>${n}</span><input type="range" data-vol="${k}" min="0" max="1" step="0.05" value="${vol(k)}"><span class="mono" data-volv="${k}">${Math.round(vol(k) * 100)}%</span></div>`).join('')}
      <div class="lbl" style="margin:18px 0 10px">키 설정 · 버튼을 누른 뒤 원하는 키를 누르세요 (Esc 취소 · 겹치는 키는 서로 바뀜)</div>
      <div class="kbind">${kb}</div>
      <div class="dim" style="font-size:15px;margin-top:14px;line-height:1.6">마우스: 좌클릭 사격 · 우클릭 정조준 · 휠 무기 전환. 부품은 밟으면 가방 여유만큼 자동으로 줍고, 무거운 부품은 상호작용 키로 직접 줍습니다.</div>
      </div><div class="foot"><button class="danger" id="reset">저장 데이터 초기화</button><button data-modal="guide">게임 안내 보기</button><button id="kbreset">키 기본값</button><button class="primary" data-close>닫기</button></div></div></div>`;
  }
  hubShow(GS.selectedMission);
  const keepSc = (() => { const b = $('hub').querySelector('.hubbody'), m = $('hub').querySelector('#hmodal .sheet');
    return { view: renderHub.lastView, b: b ? b.scrollTop : 0, modal: renderHub.lastModal, m: m ? m.scrollTop : 0, ml: $('hub').querySelector('.mlist') ? $('hub').querySelector('.mlist').scrollTop : 0 }; })();
  $('hub').classList.toggle('solid', GS.hubView === 'shop' || GS.hubView === 'inv');
  $('hub').innerHTML = `
    <div class="hubshade"></div>
    <div class="top"><div class="brand">MARGIN</div>
      <nav class="hnav"><button data-view="main" class="${GS.hubView === 'main' && !GS.hubModal ? 'sel' : ''}">싱글 플레이</button><button data-modal="coop" class="${GS.hubModal === 'coop' ? 'sel' : ''}">멀티 플레이${NET.status === 'connected' ? ' <span class="ok">●</span>' : NET.status === 'waiting' ? ' <span class="acc">●</span>' : ''}</button><button data-tut class="${GS.save.tutDone ? '' : 'new'}">훈련장</button><button data-modal="rec" class="${GS.hubModal === 'rec' || GS.hubModal === 'ach' ? 'sel' : ''}">기록</button><button data-view="shop" class="${GS.hubView === 'shop' && !GS.hubModal ? 'sel' : ''}">상점</button><button data-view="inv" class="${GS.hubView === 'inv' && !GS.hubModal ? 'sel' : ''}">인벤토리</button></nav>
      <div class="credits"><div class="v">${fmt(GS.save.credits)} CR</div></div>
      <button class="gear ${GS.hubModal === 'set' ? 'sel' : ''}" data-modal="set" title="설정" aria-label="설정"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></div>
    <div class="hubbody">${GS.hubView === 'shop' ? shopView : GS.hubView === 'inv' ? invView : mainView}</div>${modal}`;
  const H = $('hub');
  if (keepSc.view === GS.hubView) { const b = H.querySelector('.hubbody'); if (b) b.scrollTop = keepSc.b; const ml = H.querySelector('.mlist'); if (ml) ml.scrollTop = keepSc.ml; }
  if (keepSc.modal === GS.hubModal && GS.hubModal) { const m = H.querySelector('#hmodal .sheet'); if (m) m.scrollTop = keepSc.m; }
  renderHub.lastView = GS.hubView; renderHub.lastModal = GS.hubModal;
  coopBindModal(H);
  H.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy));
  H.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => { const c = CONSUMABLES[b.dataset.fill]; while ((GS.save.inv[c.id] || 0) < c.max && buy(c.id, true)); renderHub(); });
  H.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { GS.shopTab = b.dataset.tab; SFX.ui(); renderHub(); H.querySelector('.hubbody').scrollTop = 0; });
  H.querySelectorAll('[data-skill]').forEach(b => b.onclick = () => {
    const i = +b.dataset.slot, id = b.dataset.skill, other = 1 - i;
    if (GS.save.slots[other] === id) GS.save.slots[other] = GS.save.slots[i];
    GS.save.slots[i] = id; writeSave(); SFX.ui(); renderHub();
  });
  H.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
    const id = b.dataset.equip, prev = GS.save.equipped, ci = GS.save.carry.indexOf(id);
    if (ci >= 0) { if (prev && prev !== 'pistol') GS.save.carry[ci] = prev; else GS.save.carry.splice(ci, 1); }
    GS.save.equipped = id; writeSave(); SFX.ui(); renderHub(); });
  H.querySelectorAll('[data-carry]').forEach(b => b.onclick = () => {
    const id = b.dataset.carry, ci = GS.save.carry.indexOf(id);
    if (ci >= 0) GS.save.carry.splice(ci, 1); else if (carryList().length < MAX_CARRY) GS.save.carry.push(id);
    writeSave(); SFX.ui(); renderHub(); });
  H.querySelectorAll('[data-rebind]').forEach(b => b.onclick = () => { rebindA = rebindA === b.dataset.rebind ? '' : b.dataset.rebind; SFX.ui(); renderHub(); });
  bindVolume(H);
  if ($('huiz')) $('huiz').onchange = e => { GS.save.uiScale = +e.target.value; writeSave(); applyUiScale(); renderHub(); };
  if ($('huizauto')) $('huizauto').onclick = () => { delete GS.save.uiScale; writeSave(); applyUiScale(); renderHub(); };
  if ($('huiz')) $('huiz').oninput = e => setText($('huizv'), Math.round(e.target.value * 100) + '%');
  if ($('kbreset')) $('kbreset').onclick = () => { GS.save.binds = {}; rebindA = ''; writeSave(); SFX.ui(); renderHub(); };
  H.querySelectorAll('[data-mis]').forEach(b => b.onclick = () => { GS.selectedMission = b.dataset.mis; SFX.ui(); renderHub(); });
  H.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { GS.hubView = b.dataset.view; GS.hubModal = ''; SFX.ui(); renderHub(); H.querySelector('.hubbody').scrollTop = 0; });
  H.querySelectorAll('[data-modal]').forEach(b => b.onclick = () => { GS.hubModal = b.dataset.modal; SFX.ui(); renderHub(); });
  H.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { GS.hubModal = ''; rebindA = ''; renderHub(); });
  if ($('hmodal')) $('hmodal').onclick = e => { if (e.target.id === 'hmodal') { GS.hubModal = ''; rebindA = ''; renderHub(); } };
  if ($('deploy')) $('deploy').onclick = () => startMission(GS.selectedMission);
  // 인벤토리: 끌어 놓기 · 누르기 · 스킨
  if (GS.hubView === 'inv') {
    let dragG = '';
    H.querySelectorAll('[data-ig][draggable]').forEach(el => {
      el.addEventListener('dragstart', e => { dragG = el.dataset.ig; el.classList.add('drag'); try { e.dataTransfer.setData('text/plain', dragG); e.dataTransfer.effectAllowed = 'move'; } catch (_) { } });
      el.addEventListener('dragend', () => { el.classList.remove('drag'); H.querySelectorAll('.over').forEach(x => x.classList.remove('over')); });
    });
    const getG = e => { try { return e.dataTransfer.getData('text/plain') || dragG; } catch (_) { return dragG; } };
    H.querySelectorAll('[data-islot]').forEach(el => { const k = +el.dataset.islot; if (k > 2) return;
      el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); invPut(getG(e), k); });
      el.addEventListener('contextmenu', e => { e.preventDefault(); const g = invSlots()[k]; if (g) invRemove(g); });
    });
    const li = H.querySelector('[data-idrop="list"]');
    if (li) { li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('over'); }); li.addEventListener('dragleave', e => { if (e.target === li) li.classList.remove('over'); });
      li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('over'); const g = getG(e); if (invSlots().includes(g)) invRemove(g); }); }
    H.querySelectorAll('.prow[data-ig]').forEach(el => el.addEventListener('click', () => invPut(el.dataset.ig)));
    H.querySelectorAll('.prow.fixedrow').forEach(el => el.addEventListener('click', () => { invSkinGun = 'pistol'; SFX.ui(); renderHub(); }));
    H.querySelectorAll('[data-skinpick]').forEach(b => b.onclick = e => { e.stopPropagation(); invSkinGun = b.dataset.skinpick; SFX.ui(); renderHub(); });
    H.querySelectorAll('[data-skinset]').forEach(b => b.onclick = () => { GS.save.skinSel = GS.save.skinSel || {}; const sid = b.dataset.skinset; if (sid) GS.save.skinSel[invSkinGun] = sid; else delete GS.save.skinSel[invSkinGun]; writeSave(); SFX.ui(); renderHub(); });
    H.querySelectorAll('[data-skinclose]').forEach(b => b.onclick = () => { invSkinGun = ''; renderHub(); });
    if ($('skinov')) $('skinov').onclick = e => { if (e.target.id === 'skinov') { invSkinGun = ''; renderHub(); } };
  } else invSkinGun = '';
  if ($('goalbox')) $('goalbox').onclick = () => { const cg = curGoal(); if (!cg) return; SFX.ui(); cg.g.go(); if (GS.state === 'hub') renderHub(); };
  H.querySelectorAll('[data-gotut]').forEach(b => b.onclick = () => { GS.save.seenIntro = true; writeSave(); GS.hubModal = ''; startMission('T'); });
  if (GS.hubModal === 'intro') H.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { GS.save.seenIntro = true; writeSave(); }));
  H.querySelectorAll('[data-achg]').forEach(b => b.onclick = () => { const g = b.dataset.achg; if (achOpen.has(g)) achOpen.delete(g); else achOpen.add(g); SFX.ui(); const sc = H.querySelector('#hmodal .body').scrollTop; renderHub(); H.querySelector('#hmodal .body').scrollTop = sc; });
  H.querySelectorAll('[data-demo]').forEach(b => b.onclick = e => { if (e.target.closest('button')) return; demoSkill = b.dataset.demo; renderHub(); });
  updateSkillDemo();
  H.querySelectorAll('[data-tut]').forEach(b => b.onclick = () => { SFX.ui(); startMission('T'); });
  H.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { GS.save.hardSel = b.dataset.diff === '1'; GS.save.chaosSel = b.dataset.diff === '2'; writeSave(); SFX.ui(); renderHub(); });
  if ($('hsens')) $('hsens').oninput = e => { GS.save.sens = +e.target.value; setText($('hsensv'), GS.save.sens.toFixed(2)); $('sens').value = GS.save.sens; setText($('sensv'), GS.save.sens.toFixed(2)); writeSave(); };
  if ($('reset')) $('reset').onclick = () => { if (confirm('저장 데이터를 모두 삭제하고 새 게임을 시작할까요?')) { GS.save = defaultSave(); writeSave(); GS.selectedMission = 'A'; GS.hubModal = ''; GS.hubView = 'main'; renderHub(); } };
}
// 키 설정 입력 받기 (다른 키 처리보다 먼저)
addEventListener('keydown', e => {
  if (!rebindA) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code !== 'Escape') {
    const other = KEYDEF.find(([a]) => a !== rebindA && bind(a) === e.code);
    if (other) GS.save.binds[other[0]] = bind(rebindA);
    GS.save.binds[rebindA] = e.code; writeSave(); SFX.ui();
  }
  rebindA = ''; renderHub();
}, true);
// 총기 그림: 1인칭 총기 모델을 옆에서 찍어 이미지로 보관
const GUN_IMG = {}; let thumbR = null;
function gunThumb(id, sid = skinSel(id)) {
  const key = id + '|' + (sid || '');
  if (GUN_IMG[key]) return GUN_IMG[key];
  try {
    if (!thumbR) { thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); thumbR.setSize(360, 140); thumbR.setClearColor(0x000000, 0); }
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3630, 2.2)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 3, 1); sc.add(sun);
    const g = GUNS[id].clone(true); g.visible = true; g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
    g.traverse(o => { if (o.material) o.material = o.material.clone(); if (o.material && o.material.blending === THREE.AdditiveBlending) o.visible = false; });
    applySkin(g, id, sid);
    sc.add(g); g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(22, 360 / 140, 0.01, 50), dist = Math.max(sz.z * 1.05, sz.y * 2.7) / (2 * Math.tan(11 * Math.PI / 180)) * 0.44;
    cam.position.set(c.x + dist, c.y + dist * 0.12, c.z + dist * 0.05); cam.lookAt(c);
    thumbR.render(sc, cam); GUN_IMG[key] = thumbR.domElement.toDataURL('image/png');
  } catch (e) { GUN_IMG[key] = ''; }
  return GUN_IMG[key];
}
// 스킬 시연: 오른쪽 아래에서 반복 재생되는 짧은 그림
let demoRaf = 0;
function updateSkillDemo() {
  let el = $('skilldemo');
  const on = GS.state === 'hub' && GS.hubView === 'shop' && GS.shopTab === '스킬' && !GS.hubModal;
  if (!on) { if (el) el.remove(); cancelAnimationFrame(demoRaf); demoRaf = 0; return; }
  if (!demoSkill) demoSkill = Object.keys(SKILLS)[0];
  const sk = SKILLS[demoSkill];
  if (!el) { el = document.createElement('div'); el.id = 'skilldemo'; document.body.appendChild(el); }
  el.innerHTML = `<div class="lbl">스킬 시연</div><div class="t">${sk.name}</div><canvas width="632" height="356"></canvas><div class="k">${sk.desc}<br>장착한 슬롯의 키(${SLOT_KEYS[0]} / ${SLOT_KEYS[1]})로 사용 · 재사용 대기 ${sk.cd}초</div>`;
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), t0 = performance.now();
  cancelAnimationFrame(demoRaf);
  const draw = () => { if (!cv.isConnected) return; drawSkillDemo(ctx, demoSkill, (performance.now() - t0) / 1000); demoRaf = requestAnimationFrame(draw); };
  draw();
}
function drawSkillDemo(c, id, T) {
  const W = 632, H = 356, t = T % 4, GY = 280;
  c.clearRect(0, 0, W, H); c.fillStyle = '#0d0e10'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#2a2c2f'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, GY); c.lineTo(W, GY); c.stroke();
  const man = (x, col = '#e8e2d6') => { c.fillStyle = col; c.beginPath(); c.arc(x, GY - 92, 14, 0, 7); c.fill(); c.fillRect(x - 12, GY - 76, 24, 46); c.fillRect(x - 11, GY - 30, 9, 30); c.fillRect(x + 2, GY - 30, 9, 30); c.fillRect(x + 8, GY - 66, 30, 7); };
  const bot = (x, col = '#8a8478') => { c.fillStyle = col; c.fillRect(x - 22, GY - 110, 44, 50); c.fillRect(x - 14, GY - 132, 28, 20); c.fillStyle = '#ff5a2a'; c.fillRect(x - 8, GY - 126, 16, 6); c.fillStyle = col; c.fillRect(x - 18, GY - 60, 12, 60); c.fillRect(x + 6, GY - 60, 12, 60); };
  const txt = (s, x, y, col = '#e8a33d', sz = 30) => { c.fillStyle = col; c.font = `700 ${sz}px 'IBM Plex Sans KR', sans-serif`; c.textAlign = 'center'; c.fillText(s, x, y); };
  const bar = (x, y, w, k, col) => { c.fillStyle = '#26282b'; c.fillRect(x, y, w, 12); c.fillStyle = col; c.fillRect(x, y, w * k, 12); };
  if (id === 'dash') {
    const k = Math.min(1, Math.max(0, (t - 1) / 0.35)), x = 120 + 300 * (k < 1 ? k * k * (3 - 2 * k) : 1);
    if (t > 1 && t < 1.6) for (let i = 1; i < 6; i++) { c.globalAlpha = 0.18 * (6 - i) / 6; man(x - i * 40, '#8ad8ff'); } c.globalAlpha = 1;
    man(x, t > 1 && t < 1.35 ? '#8ad8ff' : '#e8e2d6'); bot(560);
    const bx = 520 - (t % 4) * 160; if (bx > 60) { c.fillStyle = '#ff9a3a'; c.fillRect(bx, GY - 70, 18, 5); }
    if (t > 1 && t < 1.35) txt('무적 0.28초', x, GY - 130, '#8ad8ff');
    txt('이동 방향으로 순간 돌진', W / 2, 40);
  } else if (id === 'nano') {
    man(220); bot(520); const k = t < 0.6 ? 0.35 : Math.min(0.8, 0.35 + (t - 0.6) / 3 * 0.45);
    bar(150, GY - 150, 140, k, k < 0.5 ? '#d9443a' : '#5ad18a');
    for (let i = 0; i < 4; i++) { const yy = (t * 60 + i * 30) % 120; c.globalAlpha = 1 - yy / 120; txt('+', 190 + i * 22, GY - 110 - yy, '#5ad18a', 28); } c.globalAlpha = 1;
    txt('3초에 걸쳐 체력 45 회복', W / 2, 40);
  } else if (id === 'shield') {
    man(200); bot(520); const sh = Math.max(0, 1 - Math.floor(t / 0.5) * 0.12);
    c.strokeStyle = `rgba(106,216,255,${0.35 + 0.4 * sh})`; c.lineWidth = 5; c.beginPath(); c.arc(200, GY - 60, 82, 0, 7); c.stroke();
    for (let i = 0; i < 3; i++) { const bx = 490 - ((t * 260 + i * 120) % 260); if (bx > 290) { c.fillStyle = '#ff9a3a'; c.fillRect(bx, GY - 70 - i * 10, 18, 5); } else { c.fillStyle = '#8ad8ff'; c.beginPath(); c.arc(285, GY - 70 - i * 10, 6, 0, 7); c.fill(); } }
    bar(140, GY - 170, 120, sh, '#6ad8ff'); txt('6초 동안 피해 80 흡수', W / 2, 40);
  } else if (id === 'overclock') {
    man(160); bot(500); const on = t > 1.2;
    if (Math.floor(t * 4) % 2 === 0) { c.fillStyle = '#ffd28a'; c.fillRect(200, GY - 64, 260, 3); }
    const n = Math.floor(t * 4); if (n % 2 === 0) txt(on ? '140' : '100', 500 + (n % 3) * 18, GY - 150 - (t * 40 % 30), on ? '#ff9a3a' : '#e8e2d6', on ? 30 : 24);
    if (on) { c.strokeStyle = 'rgba(255,154,58,.6)'; c.lineWidth = 3; c.strokeRect(130, GY - 112, 60, 112); }
    txt(on ? '약점 분석 · 피해 +40%' : '평소 피해', W / 2, 40);
  } else if (id === 'focus') {
    man(160); bot(520); const on = t > 1, sp = on ? 0.4 : 1;
    if (on) { c.fillStyle = 'rgba(106,160,255,.10)'; c.fillRect(0, 0, W, H); }
    for (let i = 0; i < 3; i++) { const bx = 500 - (((t * 200 * sp) + i * 110) % 330); c.fillStyle = '#ff9a3a'; c.fillRect(bx, GY - 70 - i * 12, 18, 5); }
    txt(on ? '적과 탄환이 40% 속도로 느려짐' : '평소 속도', W / 2, 40, on ? '#8ab8ff' : '#e8a33d');
  }
}
// UI 배율: 직접 정한 값이 없으면 브라우저 창 크기에 맞춰 자동 (1480x830 기준 1배)
function uiScaleNow() { if (GS.save.uiScale) return GS.save.uiScale; const k = Math.min(innerWidth / 1480, innerHeight / 830); return Math.round(clamp(k, 0.75, 1.25) * 20) / 20; }
addEventListener('resize', () => { if (!GS.save.uiScale) applyUiScale(); });
function applyUiScale() { const k = uiScaleNow(); document.documentElement.style.setProperty('--uiz', k); document.documentElement.style.setProperty('--uizh', (k < 1 ? k : 1 + (k - 1) * 0.5).toFixed(3)); }
applyUiScale();
function buy(id, quiet) {
  const it = SHOP.find(s => s.id === id); if (!it) return false;
  const price = itemPrice(it);
  if (itemOwned(it) || !itemReqOk(it) || GS.save.credits < price) return false;
  GS.save.credits -= price;
  if (it.kind === 'weapon') { GS.save.weapons[it.id] = true; GS.save.equipped = it.id; }
  else if (it.kind === 'armor') GS.save.armor = it.lvl;
  else if (it.kind === 'bag') GS.save.bag = it.lvl;
  else if (it.kind === 'util') GS.save.utils[it.id] = true;
  else if (it.kind === 'mod') GS.save.mods[it.mid]++;
  else if (it.kind === 'wlv') GS.save.wlv[it.wid] = (GS.save.wlv[it.wid] || 0) + 1;
  else if (it.kind === 'skill') { GS.save.skills[it.id] = true; const e = GS.save.slots.indexOf(''); if (e >= 0) GS.save.slots[e] = it.id; }
  else if (it.kind === 'cons') GS.save.inv[it.id] = (GS.save.inv[it.id] || 0) + 1;
  else GS.save.salvage = it.lvl;
  achCount('buys'); if (GS.save.credits <= 50) achUnlock('broke'); achCheckGrowth();
  writeSave(); initAudio(); SFX.pickup(); if (!quiet) renderHub();
  return true;
}

export { WLV_MAX, buy, carryList, gunThumb, itemName, itemOwned, itemPrice, itemReqOk, renderHub };
