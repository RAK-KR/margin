import { GS } from '../core/state.js?v=34';
import { $, _v1, fmt, setHTML, setText } from '../core/utils.js?v=34';
import { ENDING, ETYPES, LORE, MISSIONS, SALVAGES, SHOP, STATE_KO, utilOn } from '../data/data.js?v=34';
import { writeSave } from '../core/save.js?v=34';
import { SFX } from '../core/audio.js?v=34';
import { camera, controls } from '../core/renderer.js?v=34';
import { GUNS } from '../player/viewmodel.js?v=34';
import { player } from '../player/playerState.js?v=34';
import { clearWorld } from '../world/missions.js?v=34';
import { coreExposed } from '../bosses/core.js?v=34';
import { endTutorial } from '../modes/tutorial.js?v=34';
import { partAlive } from '../combat/damage.js?v=34';
import { NET, coopEv, coopFlush, coopGuestSend, coopOn, coopOut, isHost } from '../modes/coop.js?v=34';
import { HARD_MUL, barBoss } from '../modes/difficulty.js?v=34';
import { achEvent, achUnlock } from '../meta/achievements.js?v=34';
import { itemName, itemOwned, itemPrice, itemReqOk, renderHub } from '../ui/hub.js?v=34';

// =====================================================================
//  임무 종료 / 정산
// =====================================================================
const BOSS_CHIPS = [['head', '센서'], ['jaw', '턱'], ['podL', '포드L'], ['podR', '포드R'], ['tail', '꼬리'], ['legL', '다리L'], ['legR', '다리R'], ['chest', '흉갑'], ['hatch', '해치'], ['reactor', '동력로']];
const BOSS_STATE_TXT = { laser_wind: '열선 충전 · 조준선이 굵어지면 옆으로 이동', laser: '열선 발사', stunned: '기절 · 동력로 노출', knockdown: '다운 · 동력로 노출', missile: '미사일 발사 · 해치 개방', charge_wind: '돌진 준비', charge: '돌진', slam_wind: '충격파 · 점프로 회피', dazed: '센서 교란', tail: '꼬리 휩쓸기', spin: '꼬리 휩쓸기', bite: '물기' };
function drawRadar() {
  const cv = $('radar');
  if (!utilOn('radar')) { cv.classList.add('hidden'); return; }
  cv.classList.remove('hidden');
  const g = cv.getContext('2d'), R = 75, rng = 35;
  g.clearRect(0, 0, 150, 150);
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.arc(R, R, R * 0.5, 0, 7); g.stroke(); g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.stroke();
  const fwd = camera.getWorldDirection(_v1); const ya = Math.atan2(fwd.x, fwd.z);
  g.fillStyle = '#e8a33d'; g.beginPath(); g.moveTo(R, R - 6); g.lineTo(R - 4, R + 4); g.lineTo(R + 4, R + 4); g.fill();
  for (const e of GS.enemies) {
    if (e.dead) continue;
    const dx = e.root.position.x - player.pos.x, dz = e.root.position.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > rng) continue;
    const a = Math.atan2(dx, dz) - ya, rr = d / rng * (R - 6);
    const x = R - Math.sin(a) * rr, y = R - Math.cos(a) * rr;
    g.fillStyle = e.boss ? '#ff4a3a' : e.stunT > 0 ? '#6ac8ff' : e.alert ? '#e05a47' : '#c8c0b0';
    g.beginPath(); g.arc(x, y, e.boss ? 6 : 3, 0, 7); g.fill();
  }
}
const CORE_CHIPS = [['head', '센서'], ['podL', '포드L'], ['podR', '포드R'], ['armA', '팔1'], ['armB', '팔2'], ['armC', '팔3'], ['reactor', '동력로']];
const CORE_STATE_TXT = { mortar: '포격', volley: '에너지탄', slam_wind: '충격파 · 점프로 피하기', storm: '낙뢰', build: '기계 조립', stunned: 'EMP 정지 · 동력로 노출' };
const SPIDER_CHIPS = [['head', '센서'], ['turret', '포탑'], ['bay', '격납고'], ['sl1', '좌1'], ['sl2', '좌2'], ['sl3', '좌3'], ['sl4', '우1'], ['sl5', '우2'], ['sl6', '우3'], ['reactor', '동력로']];
const SPIDER_STATE_TXT = { stomp_wind: '짓밟기 준비 · 몸 아래에서 벗어나라', stomp: '짓밟기', lunge_wind: '도약 준비 · 붉은 원 회피', lunge: '도약', land: '착지 · 냉각구 개방',
  mortar_wind: '포격 준비', mortar: '박격포 포격', collapse: '주저앉음 · 동력로 노출', rise: '재기립', stunned: 'EMP 경직 · 동력로 노출', dazed: '센서 교란' };
const DRAGON_CHIPS = [['head', '센서'], ['jaw', '턱'], ['hornL', '뿔L'], ['hornR', '뿔R'], ['pearl', '여의주'], ['clawF', '앞발'], ['clawB', '뒷발'], ['n1', '마디1'], ['n2', '마디2'], ['n3', '마디3'], ['fin', '꼬리']];
const DRAGON_STATE_TXT = { breath_wind: '숨결 충전 · 마디 개방', breath: '플라즈마 숨결 · 마디 개방', storm_wind: '낙뢰 소환 · 마디 개방', dive_wind: '강하 준비 · 붉은 경로 회피', dive: '강하 돌진',
  skim: '저공 비행 · 마디 노출', climb: '상승', downed: 'EMP 추락 · 마디 노출', crash: '추락', dazed: '센서 교란 · 마디 노출', cruise: '마디 덮개 닫힘' };
function updateBossBar() {
  const bb = $('bossbar'), e = barBoss();
  if (!e || !e.alert || e.dead) { bb.classList.add('hidden'); return; }
  bb.classList.remove('hidden');
  setText($('bossname'), (e.cfg.title || e.cfg.name) + (GS.run.mission.extreme ? ` · 남은 보스 ${GS.enemies.filter(o => o.boss && !o.dead).length} / 3` : ''));
  let frac;
  if (e.spider || e.fcore) frac = e.parts.reactor.attached ? e.parts.reactor.hp / e.parts.reactor.maxHp : 0;
  else if (e.dragon) frac = ['n1', 'n2', 'n3'].reduce((a, id) => { const q = e.parts[id]; return a + (q.attached && q.state !== 'disabled' && q.state !== 'destroyed' ? q.hp / q.maxHp : 0); }, 0) / 3;
  else frac = e.parts.core.hp / e.parts.core.maxHp;
  bb.querySelector('.bb>i').style.width = (frac * 100) + '%';
  const stxt = (e.fcore ? CORE_STATE_TXT : e.spider ? SPIDER_STATE_TXT : e.dragon ? DRAGON_STATE_TXT : BOSS_STATE_TXT)[e.bs.state] || '';
  setText($('bossphase'), (e.bs.phase2 ? '2페이즈' + (stxt ? ' · ' : '') : '') + stxt + (e.dragon && partAlive(e.parts.pearl) ? (stxt || e.bs.phase2 ? ' · ' : '') + '여의주 보호막' : ''));
  if (e.fcore) setText($('bossphase'), `${e.bs.phase}단계` + (coreExposed(e) ? ' · 동력로 노출' : '') + (stxt ? ' · ' + stxt : ''));
  setHTML($('bossparts'), (e.fcore ? CORE_CHIPS : e.spider ? SPIDER_CHIPS : e.dragon ? DRAGON_CHIPS : BOSS_CHIPS).map(([id, nm]) => {
    const p = e.parts[id]; const cls = p.state === 'destroyed' ? 'x' : p.state === 'disabled' ? 'd' : p.state === 'damaged' ? 'm' : 'i';
    return `<span class="${cls}">${nm}${!p.attached && p.state !== 'destroyed' ? '(분리)' : ''}</span>`;
  }).join(''));
}
function nextGoal() {
  for (const it of SHOP.filter(x => x.kind !== 'cons').sort((a, b) => itemPrice(a) - itemPrice(b))) {
    if (itemOwned(it) || !itemReqOk(it)) continue;
    return it;
  }
  return null;
}
function endMission(kind) {
  if (GS.state !== 'mission') return;
  if (GS.run && GS.run.mission.tut) { endTutorial(kind === 'extract' && GS.run.objDone); return; }
  if (coopOn()) {
    if (isHost()) { if (kind === 'abandon') coopEv({ t: 'end', k: 'abandon' }); coopFlush(); }
    else if (kind === 'abandon') { coopOut({ t: 'leave' }); NET.sendT = 0; coopGuestSend(0); }
    NET.inGame = false; NET.rp = null;
  }
  const id = GS.run.mission.id, ms = GS.run.mission;
  GS.state = 'result';
  controls.unlock(); GS.mouseDown = GS.rightDown = false;
  $('pause').classList.add('hidden'); $('hud').classList.add('hidden');
  GS.save.kills += GS.run.kills;
  let html;
  if (kind === 'extract') {
    const contract = GS.run.objDone ? ms.contract * (GS.run.hard ? HARD_MUL.contract : 1) : 0;
    const partsBase = GS.run.loot.reduce((a, l) => a + l.base, 0);
    const partsVal = GS.run.loot.reduce((a, l) => a + l.val, 0);
    const bonus = Math.round(partsVal * GS.run.salvageBonus);
    const total = contract + GS.run.killReward + partsVal + bonus;
    GS.save.credits += total; GS.save.totalEarned += total;
    const newly = [];
    if (GS.run.objDone) {
      GS.save.stats[id].clears++; if (GS.run.hard) GS.save.stats[id].hard = (GS.save.stats[id].hard || 0) + 1;
      for (const m of Object.values(MISSIONS)) if (m.req === id && !GS.save.unlocked[m.id]) { GS.save.unlocked[m.id] = true; newly.push(m); }
    }
    GS.save.stats[id].best = Math.max(GS.save.stats[id].best, total);
    const lore = GS.run.objDone && LORE[id] && !GS.save.lore[id] ? LORE[id] : null;
    if (lore) { GS.save.lore[id] = true; if (Object.keys(LORE).every(k => GS.save.lore[k])) achUnlock('loreAll'); }
    const ending = GS.run.objDone && ms.final;
    if (ending) { GS.save.ended = true; achUnlock('ending'); }
    achEvent('end', { kind, total });
    let recNote = '';
    if (GS.run.objDone && ms.boss) {
      const rk = ms.id === 'C' ? '' : ms.id, tk = 'bossTime' + rk, pk = 'pistolBoss' + rk;
      if (!GS.run.coop && (!GS.save.records[tk] || GS.run.bossKillT < GS.save.records[tk])) { GS.save.records[tk] = GS.run.bossKillT; recNote += `<div class="goal" style="margin-top:14px">최단 격파 기록 갱신 · <b>${GS.run.bossKillT.toFixed(1)}초</b></div>`; }
      if (GS.run.pistolOnly && !GS.run.coop && !GS.save.records[pk]) { GS.save.records[pk] = true; recNote += `<div class="goal" style="margin-top:14px"><b>권총 격파 달성</b> · ${ms.target[0]} · 기본 권총만으로 격파</div>`; }
    }
    writeSave();
    const goal = nextGoal();
    const groups = new Map();
    for (const l of GS.run.loot) {
      const k = `${l.name}|${l.state}|${Math.round(l.cond * 100)}`;
      if (!groups.has(k)) groups.set(k, { ...l, n: 0, base: 0, val: 0 });
      const g = groups.get(k); g.n++; g.base += l.base; g.val += l.val;
    }
    const rows = groups.size ? [...groups.values()].sort((a, b) => b.val - a.val).map(l => `<tr><td>${l.name}${l.n > 1 ? ` <span class="dim">x${l.n}</span>` : ''}</td><td class="${l.state === 'intact' ? 'ok' : 'acc'}">${STATE_KO[l.state]} ${Math.round(l.cond * 100)}%</td>
      <td class="n">${fmt(l.base)}</td><td class="n bad">${l.base - l.val ? '-' + fmt(l.base - l.val) : '0'}</td><td class="n">${fmt(l.val)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="dim">회수한 부품 없음</td></tr>`;
    const kb = Object.entries(GS.run.killsByType).map(([t, n]) => `${ETYPES[t].name} ${n}`).join(' · ') || '없음';
    html = `<header><h2>${GS.run.objDone ? '임무 완료 · 정산' : '조기 탈출 · 정산'}</h2><span class="lbl">${ms.code} ${ms.name}${GS.run.hard ? ' · 하드' : ''}${GS.run.coop ? ' · 협동' : ''}</span></header>
      <div class="body">
        <table class="tbl"><tr><th>회수 부품</th><th>상태</th><th class="n">기준가</th><th class="n">파손 감가</th><th class="n">판매가</th></tr>${rows}</table>
        <div class="sum">
          <span>기본 계약 보상 ${GS.run.objDone ? (GS.run.hard ? '<span class="bad">(하드 ×2)</span>' : '') : '<span class="dim">(목표 미완료)</span>'}</span><span>${fmt(contract)}</span>
          <span>처치 보상 <span class="dim">(${kb})</span></span><span>${fmt(GS.run.killReward)}</span>
          <span>회수 부품 판매액 <span class="dim">(기준가 ${fmt(partsBase)})</span></span><span>${fmt(partsVal)}</span>
          <span>파손에 따른 가치 감소</span><span class="bad">-${fmt(partsBase - partsVal)}</span>
          <span>장비 회수 보너스 <span class="dim">(${SALVAGES[GS.save.salvage].name} +${Math.round(GS.run.salvageBonus * 100)}%)</span></span><span class="ok">+${fmt(bonus)}</span>
          <span class="tot">최종 지급액</span><span class="tot acc">${fmt(total)} CR</span>
          <span>보유 자금</span><span>${fmt(GS.save.credits)} CR</span>
          <span>다음 목표 장비</span><span>${goal ? `${itemName(goal)} · ${GS.save.credits >= itemPrice(goal) ? '<span class="ok">구매 가능</span>' : fmt(itemPrice(goal) - GS.save.credits) + ' CR 부족'}` : '모든 장비 보유'}</span>
        </div>
        ${recNote}
        ${lore ? `<div class="lore"><div class="lbl">무전 기록 ${lore.n} / 7 · ${lore.from}</div>${lore.text}</div>` : ''}
        ${newly.map(m => `<div class="goal" style="margin-top:14px">새 임무 해금 · <b>${m.code} ${m.name}</b></div>`).join('')}
        ${GS.run.objDone && ms.boss && GS.save.stats[id].clears === 1 ? `<div class="goal" style="margin-top:14px"><b>${ms.target[0]} 첫 격파</b> · ${ms.code}는 계속 재출격해 부품을 수급할 수 있습니다.</div>` : ''}
        <div class="dim" style="font-size:14.5px;margin-top:12px">명중률 ${GS.run.shots ? Math.round(GS.run.shotsHit / GS.run.shots * 100) : 0}% (${GS.run.shotsHit}/${GS.run.shots}) · 작전 시간 ${Math.round(GS.time - GS.run.startT)}초</div>
      </div>
      <div class="foot"><button class="primary" id="tohub">거점으로</button></div>`;
  } else {
    GS.save.deaths += kind === 'dead' ? 1 : 0;
    achEvent('end', { kind });
    writeSave();
    const lost = GS.run.loot.reduce((a, l) => a + l.val, 0);
    html = `<header><h2 class="bad">${kind === 'dead' ? '작전 실패 · 사망' : '임무 포기'}</h2><span class="lbl">${ms.code} ${ms.name}${GS.run.hard ? ' · 하드' : ''}</span></header>
      <div class="body">
        <div class="sum">
          <span>잃은 미정산 부품 <span class="dim">(${GS.run.loot.length}개)</span></span><span class="bad">-${fmt(lost)}</span>
          <span>잃은 처치 보상</span><span class="bad">-${fmt(GS.run.killReward)}</span>
          <span>잃은 계약 보상</span><span class="bad">-${fmt(ms.contract * (GS.run.hard ? HARD_MUL.contract : 1))}</span>
          <span class="tot">보유 자금 (유지)</span><span class="tot">${fmt(GS.save.credits)} CR</span>
        </div>
        <div class="dim" style="font-size:14.5px;margin-top:12px">구매한 장비와 기존 자금은 유지됩니다.</div>
      </div>
      <div class="foot"><button class="primary" id="tohub">거점으로</button></div>`;
  }
  $('resultsheet').innerHTML = html;
  $('result').classList.remove('hidden');
  $('tohub').onclick = () => goHub();
  if (kind === 'extract' && GS.run.objDone && ms.final) showEnding();
}
function showEnding() {
  const el = $('ending'), step = 2.3;
  const last = 0.8 + ENDING.length * step;
  el.innerHTML = `<button class="skip" id="endskip">건너뛰기</button><div class="endbox">${ENDING.map(([t, c], i) => `<p class="${c || ''}" style="animation-delay:${(0.8 + i * step).toFixed(1)}s">${t}</p>`).join('')}
    <div class="cr" style="animation-delay:${(last + 0.6).toFixed(1)}s"><div class="logo">MARGIN</div><div class="dim" style="margin-top:14px">플레이해 주셔서 감사합니다</div></div>
    <div class="eb" style="animation-delay:${(last + 1.8).toFixed(1)}s"><button class="primary" id="endnext">정산 보기</button></div></div>`;
  el.classList.remove('hidden'); SFX.objective();
  const close = () => { el.classList.add('hidden'); el.innerHTML = ''; };
  $('endskip').onclick = close; $('endnext').onclick = close;
}
function goHub() {
  GS.state = 'hub'; GS.run = null; GS.hubView = 'main'; GS.hubModal = '';
  $('ending').classList.add('hidden');
  clearWorld();
  for (const k in GUNS) GUNS[k].visible = false;
  $('result').classList.add('hidden'); $('hud').classList.add('hidden'); $('pause').classList.add('hidden');
  renderHub(); $('hub').classList.remove('hidden');
}

export { drawRadar, endMission, goHub, nextGoal, showEnding, updateBossBar };
