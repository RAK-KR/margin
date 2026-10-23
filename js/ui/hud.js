import * as THREE from 'three';
import { GS } from '../core/state.js?v=36';
import { $, _v1, _v2, _v4, fmt, setHTML, setText } from '../core/utils.js?v=36';
import { CONSUMABLES, GRENADES, SKILLS, SLOT_KEYS, STATE_KO, UK, W, WEAPONS, bind, keyLabel, utilOn } from '../data/data.js?v=36';
import { camera } from '../core/renderer.js?v=36';
import { curWeapon, player, raycaster } from '../player/playerState.js?v=36';
import { capZones, zonePrompt, zoneText } from '../world/missions.js?v=36';
import { TUT_STEPS } from '../modes/tutorial.js?v=36';
import { currentSpread } from '../combat/shooting.js?v=36';
import { partAlive } from '../combat/damage.js?v=36';
import { NET, coopEv, coopHud, coopOn, coopPrompt, isHost } from '../modes/coop.js?v=36';
import { bagCap, bagRoom, carryKg, inExtraction, loadMult, nearestCrate, nearestLoot } from '../game/loot.js?v=36';
import { drawRadar, updateBossBar } from '../game/result.js?v=36';

// =====================================================================
//  HUD
// =====================================================================
const feedEl = $('feed');
function addFeed(text, cls = '') {
  if (isHost() && !NET.mute && (cls === 'k' || cls === 'd' || cls === 'x') && !text.startsWith('작전 개시')) coopEv({ t: 'feed', s: text, c: cls });
  const d = document.createElement('div'); d.className = cls; d.textContent = text; d.dataset.t = GS.time;
  feedEl.appendChild(d); while (feedEl.children.length > 7) feedEl.removeChild(feedEl.firstChild);
}
function showHitmarker(kind) { const h = $('hitmarker'); h.className = kind; GS.hitT = kind === 'kill' ? 0.32 : 0.16; }
function popup(text, cls) { const p = $('popup'); p.className = cls; p.textContent = text; GS.popupT = 0.9; }
// 탈출 지점 표지: 3D 위치를 화면에 투영, 화면 밖이면 가장자리에 방향 화살표
function updateWaypoint(x, z, d) {
  const el = $('wp');
  el.style.display = GS.run.tut && GS.run.tut.i < TUT_STEPS.length - 1 ? 'none' : '';
  const v = _v4.set(x, (GS.extraction.y || 0) + 2.2, z).project(camera);
  const W = innerWidth, H = innerHeight, m = 46;
  let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
  const behind = v.z > 1, off = behind || sx < m || sx > W - m || sy < m || sy > H - m;
  let rot = 0;
  if (off) {
    let dx = sx - W / 2, dy = sy - H / 2; if (behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1) dy = 1; }
    // 화면 밖이면 조준점 둘레의 원 위에 표시 (모서리의 정보 칸과 겹치지 않게)
    const r = Math.min(W, H) * 0.3, ang = Math.atan2(dy, dx);
    sx = W / 2 + Math.cos(ang) * r * 1.35; sy = H / 2 + Math.sin(ang) * r; rot = ang + Math.PI / 2;
  }
  el.classList.toggle('edge', off); el.classList.toggle('wait', !GS.run.objDone);
  el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
  el.querySelector('.a').style.transform = `rotate(${rot}rad)`;
  setText($('wpd'), `${Math.round(d)}m`);
  setText($('wpl'), GS.run.objDone ? '탈출' : '탈출 지점');
}
function updateHUD(dt) {
  const ws = curWeapon(), w = W(ws.id);
  // 조준점
  const spread = currentSpread(w);
  const gap = Math.max(4, Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * innerHeight / 2);
  const ch = $('crosshair');
  const scoped = w.scope && GS.ads > 0.85;
  ch.style.opacity = scoped ? 0 : (w.scope ? 1 - GS.ads : 1);
  const [cT, cB, cL, cR] = ch.children;
  cT.style.transform = `translateY(${-gap - 9}px)`; cB.style.transform = `translateY(${gap}px)`;
  cL.style.transform = `translateX(${-gap - 9}px)`; cR.style.transform = `translateX(${gap}px)`;
  $('scope').style.opacity = scoped ? 1 : 0;
  // 조준 대상 부위 정보
  camera.updateMatrixWorld();
  raycaster.set(camera.getWorldPosition(_v1), camera.getWorldDirection(_v2)); raycaster.far = 140;
  const hits = raycaster.intersectObjects(GS.hittables, false);
  const ai = $('aiminfo'); let chCls = '';
  if (hits.length && hits[0].object.userData.part) {
    const m = hits[0].object, p = m.userData.part, e = p.enemy;
    const precise = p.precise || m.userData.hitMult > 1.2;
    const stCol = { intact: 'ok', damaged: 'acc', disabled: 'weak', destroyed: 'bad' }[p.state];
    const pct = p.state === 'disabled' ? Math.round(p.brk / Math.max(1, p.brkMax) * 100) : Math.round(p.hp / p.maxHp * 100);
    const shielded = !m.userData.exposed && p.protectedBy.some(id => partAlive(e.parts[id]));
    setHTML(ai, `${e.cfg.name} · <b>${p.name}</b>${m.userData.sub ? ` <span class="dim">(${m.userData.sub})</span>` : ''}` +
      `<span class="st ${stCol}">${STATE_KO[p.state]} ${pct}%</span>` + (precise ? ' <span class="weak">약점</span>' : '') + (shielded ? ' <span class="dim">장갑 차폐</span>' : ''));
    ai.style.opacity = 1; chCls = precise ? 'weak' : 'part';
  } else ai.style.opacity = 0;
  ch.className = chCls;
  // 히트마커 / 팝업
  GS.hitT = Math.max(0, GS.hitT - dt); $('hitmarker').style.opacity = GS.hitT > 0 ? Math.min(1, GS.hitT * 8) : 0;
  GS.popupT = Math.max(0, GS.popupT - dt); $('popup').style.opacity = GS.popupT > 0 ? Math.min(1, GS.popupT * 3) : 0;
  $('popup').style.transform = `translateY(${-(0.9 - GS.popupT) * 16}px)`;
  // 체력
  setText($('hpnum'), Math.ceil(player.hp) + ''); setText($('hpmax'), `/ ${player.maxHp}` + (player.dr ? `  · 피해 감소 ${Math.round(player.dr * 100)}%` : ''));
  setText($('medtxt'), '');
  // 회복: 스킬처럼 아래 막대에 표시 (응급 키트를 먼저 쓰고, 없으면 주사기)
  { const el = $('healsk'), mk = utilOn('medkit') ? GS.run.medkits : 0, st = GS.save.inv.stim || 0;
    if (!mk && !st) el.className = 'sk heal empty';
    else { el.className = 'sk heal' + (player.hp >= player.maxHp ? ' off' : '');
      setHTML(el, `<b>${keyLabel(bind('heal'))}</b>${[mk ? `응급 키트<span class="n">x${mk}</span>` : '', st ? `주사기<span class="n">x${st}</span>` : ''].filter(Boolean).join(' · ')}`); } }
  $('shbar').classList.toggle('hidden', !(GS.run.shield > 0));
  if (GS.run.shield > 0) $('shbar').firstChild.style.width = (GS.run.shield / 80 * 100) + '%';
  $('focusfx').style.opacity = GS.run.focusT > 0 ? 1 : 0;
  for (let i = 0; i < 2; i++) {
    const el = $('sk' + i), id = GS.save.slots[i];
    if (!id || !GS.save.skills[id]) { el.className = 'sk empty'; continue; }
    const sk = SKILLS[id], cdv = GS.run.skillCd[i];
    const activeNow = (id === 'shield' && GS.run.shield > 0) || (id === 'overclock' && GS.run.ocT > 0) || (id === 'focus' && GS.run.focusT > 0) || (id === 'nano' && GS.run.nanoT > 0);
    el.className = 'sk' + (cdv > 0 && !activeNow ? ' off' : '') + (activeNow ? ' act' : '');
    setHTML(el, `<b>${SLOT_KEYS[i]}</b>${sk.name}${cdv > 0 ? ` <span class="mono dim">${cdv.toFixed(cdv < 10 ? 1 : 0)}</span>` : ''}<i class="cd" style="width:${cdv > 0 ? (1 - cdv / sk.cd) * 100 : 0}%"></i>`);
  }
  { const el = $('nade'), tot = GRENADES.reduce((a, g) => a + (GS.save.inv[g] || 0), 0);
    if (!tot) el.className = 'sk gr empty';
    else { el.className = 'sk gr'; setHTML(el, `<b>${keyLabel(bind('nade'))}</b>${CONSUMABLES[GS.save.grenadeSel].name} <span class="mono acc">x${GS.save.inv[GS.save.grenadeSel] || 0}</span>${GRENADES.filter(g => GS.save.inv[g] > 0).length > 1 ? ` <span class="dim">· ${keyLabel(bind('nadeSel'))} 전환</span>` : ''}`); } }
  drawRadar();
  $('hpbar').firstChild.style.width = (player.hp / player.maxHp * 100) + '%';
  $('hpbar').classList.toggle('low', player.hp < player.maxHp * 0.3);
  // 무기
  setText($('wname'), w.name + (GS.ads > 0.5 ? ' · 정조준' : '') + (player.crouch > 0.5 ? ' · 앉음' : '') + (GS.run.ocT > 0 ? ' · 약점 분석' : ''));
  setHTML($('ammo'), `${ws.mag} <small>/ ${fmt(ws.reserve)}</small>`);
  $('ammo').style.color = ws.mag === 0 ? 'var(--bad)' : (ws.mag <= w.mag * 0.25 ? 'var(--acc)' : '');
  const rb = $('rbar'), chk = GS.run.charging ? GS.run.chargeT / w.charge : 0; rb.style.opacity = GS.run.reloadT > 0 || GS.run.charging ? 1 : 0;
  rb.className = GS.run.charging ? (chk >= 0.999 ? 'chg full' : 'chg') : '';
  if (GS.run.reloadT > 0) rb.firstChild.style.width = ((1 - GS.run.reloadT / w.reload) * 100) + '%';
  else if (GS.run.charging) rb.firstChild.style.width = (chk * 100) + '%';
  setHTML($('wslots'), GS.run.ws.map((s, i) => { const t = `[${keyLabel(bind('w' + (i + 1)))}] ${WEAPONS[s.id].name.split(' ')[0]}`; return i === GS.run.cur ? `<b>${t}</b>` : t; }).join('  '));
  setText($('reloadtxt'), GS.run.reloadT > 0 ? '재장전 중' : GS.run.charging ? (chk >= 0.999 ? '최대 충전 · 놓으면 발사' : `충전 ${Math.round(chk * 100)}%`) : (ws.mag === 0 ? (ws.reserve > 0 ? `${keyLabel(bind('reload'))} 재장전` : `탄약 없음 · ${keyLabel(bind('w' + GS.run.ws.length))} 권총 전환`) : ''));
  // 목표
  coopHud();
  setText($('objtxt'), GS.run.objDone ? '목표 완료 · 탈출 지점으로 귀환' : (GS.run.mission.boss ? `${GS.run.mission.target[0]} 격파` : GS.run.mission.tut ? `훈련 ${GS.run.tut.i + 1} / ${TUT_STEPS.length} · ${TUT_STEPS[GS.run.tut.i].t}` : GS.run.mission.relays ? `구역 점령 ${capZones.filter(z => z.done).length} / 3 · ${zoneText()}` : `적대 기계 제거 ${GS.run.kills} / ${GS.run.total}`));
  updateBossBar(); if (GS.run.mission.tut) $('bossbar').classList.add('hidden');
  $('objtxt').className = 'o' + (GS.run.objDone ? ' ok' : '');
  if (GS.extraction) {
    const dx = GS.extraction.x - player.pos.x, dz = GS.extraction.z - player.pos.z, d = Math.hypot(dx, dz);
    const fwd = camera.getWorldDirection(_v1);
    const a = Math.atan2(dx, dz) - Math.atan2(fwd.x, fwd.z);
    setText($('exttxt'), `탈출 지점 ${Math.round(d)}m`);
    updateWaypoint(GS.extraction.x, GS.extraction.z, d);
  }
  const lv = GS.run.loot.reduce((a, l) => a + l.val, 0);
  setText($('lootval'), fmt(lv * (1 + GS.run.salvageBonus)) + ' CR'); setText($('lootcnt'), `(${GS.run.loot.length}개)`);
  { const kg = carryKg(), cap = bagCap(), lm = loadMult(); setHTML($('bagtxt'), `${kg.toFixed(1)} / ${cap} kg${lm < 0.999 ? ` <span class="${kg > cap ? 'bad' : 'acc'}">${kg > cap ? '초과 · ' : ''}이동 -${Math.round((1 - lm) * 100)}%</span>` : ''}`); }
  // 상호작용 안내
  const pr = $('prompt'); let msg = '';
  const cp = coopPrompt();
  const nl = player.downed ? null : nearestLoot();
  if (cp) msg = cp;
  else if (nl) msg = `<b>[${UK()}]</b><span class="${(nl.kg || 0) > bagRoom() ? 'bad' : ''}">${(nl.kg || 0) > bagRoom() ? '무게 초과 · 그래도 줍기' : '줍기'}</span> <span class="dim">${nl.name} ${(nl.kg || 0).toFixed(1)}kg · 가방 ${carryKg().toFixed(1)} / ${bagCap()}kg · ${keyLabel(bind('bag'))} 가방</span>`;
  else if (nearestCrate()) msg = `<b>[${UK()}]</b>탄약 보급 · ${WEAPONS[(curWeapon().id !== 'pistol' ? curWeapon() : GS.run.ws[0]).id].name}`;
  else if (inExtraction()) {
    if (GS.run.objDone) msg = `<b>[${UK()}]</b>탈출 및 정산`;
    else if (GS.run.exHold > 0) msg = `<b>[${UK()}]</b><span class="bad">조기 탈출 중 ${Math.round(GS.run.exHold / 1.5 * 100)}% · 계약 보상 미지급</span>`;
    else msg = GS.run.tut ? '' : coopOn() ? `<span class="dim">협동에서는 보스를 격파해야 탈출할 수 있습니다</span>` : `<b>[${UK()} 길게]</b>조기 탈출 <span class="dim">(목표 미완료 · 부품과 처치 보상만 정산)</span>`;
  }
  if (!msg && capZones.length) msg = zonePrompt();
  if (msg) { setHTML(pr, msg); pr.classList.remove('hidden'); } else pr.classList.add('hidden');
  // 피격
  GS.vigT = Math.max(0, GS.vigT - dt * 1.4);
  const low = player.hp < player.maxHp * 0.3 ? 0.35 + 0.15 * Math.sin(GS.time * 5) : 0;
  $('vig').style.opacity = Math.max(GS.vigT, low);
  GS.dmgDirT = Math.max(0, GS.dmgDirT - dt * 1.2); $('dmgdir').style.opacity = GS.dmgDirT;
  // 피드 페이드
  for (const d of feedEl.children) { const age = GS.time - +d.dataset.t; d.style.opacity = age > 6 ? Math.max(0, 1 - (age - 6)) : 1; }
}

export { addFeed, popup, showHitmarker, updateHUD };
