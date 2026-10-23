import { GS } from '../core/state.js?v=36';
import { $, TEST, fmt, setText } from '../core/utils.js?v=36';
import { BAGS, GUN_KG, KEYDEF, STATE_KO, WEAPONS, bind, keyLabel } from '../data/data.js?v=36';
import { writeSave } from '../core/save.js?v=36';
import { SFX, applyVolume, initAudio, vol } from '../core/audio.js?v=36';
import { controls } from '../core/renderer.js?v=36';
import { keys, player } from './playerState.js?v=36';
import { startMission } from '../world/missions.js?v=36';
import { tutNext } from '../modes/tutorial.js?v=36';
import { cycleGrenade, startReload, switchWeapon, throwGrenade, useMedkit, useSkill } from '../combat/shooting.js?v=36';
import { achEvent } from '../meta/achievements.js?v=36';
import { bagCap, carryKg, dropLootAt, dropWorst, interact, loadMult } from '../game/loot.js?v=36';
import { endMission } from '../game/result.js?v=36';
import { renderHub } from '../ui/hub.js?v=36';

// =====================================================================
//  입력
// =====================================================================
function lockPointer() {
  try { const p = controls.lock(); if (p && p.catch) p.catch(() => showPauseMsg('포인터 잠금이 거부되었습니다. 잠시 후 [재개]를 눌러 주세요.')); } catch (e) { }
}
controls.addEventListener('lock', () => { $('pause').classList.add('hidden'); for (const k in keys) keys[k] = false; });
controls.addEventListener('unlock', () => { GS.mouseDown = GS.rightDown = false; if (GS.state === 'mission') showPause(false); });
document.addEventListener('pointerlockerror', () => showPauseMsg('포인터 잠금에 실패했습니다. 잠시 후 [재개]를 다시 눌러 주세요.'));
function keysHelpHtml() {
  const L = a => keyLabel(bind(a));
  return `<b>${L('fwd')} ${L('left')} ${L('back')} ${L('right')}</b><span>이동</span><b>마우스</b><span>시점 회전 / 조준 · 휠 무기 전환</span>
    <b>좌클릭</b><span>사격 (레일건은 누르고 있다가 놓기)</span><b>우클릭</b><span>정조준 (정밀 소총은 조준경)</span>
    <b>${L('reload')}</b><span>재장전</span><b>${L('w1')}~${L('w4')} / ${L('swap')}</b><span>휴대 무기 전환 / 이전 무기</span>
    <b>${L('sprint')}</b><span>달리기</span><b>${L('jump')}</b><span>점프</span>
    <b>${L('crouch')} (누르고 있기)</b><span>앉기 · 낮은 엄폐물 뒤에 숨기, 탄퍼짐 감소</span>
    <b>${L('use')}</b><span>탄약 보급 · 탈출 · 무게 초과 부품 줍기 (부품은 밟으면 자동 회수)</span><b>${L('drop')}</b><span>무게 대비 가치가 가장 낮은 부품 버리기</span><b>${L('bag')}</b><span>가방 열기 · 부품을 끌어서 버리기 (다시 주울 수 있음)</span>
    <b>${L('sk1')} / ${L('sk2')}</b><span>스킬 1 / 2</span><b>${L('nade')} / ${L('nadeSel')}</b><span>투척물 던지기 / 종류 전환</span><b>${L('heal')}</b><span>응급 키트 · 회복 주사기</span><b>Esc</b><span>일시정지</span>`;
}
// ---- 가방 창: 부품을 끌어서 버리기 (버린 부품은 발밑에 떨어져 다시 주울 수 있음)
let bagWant = false;
function renderBagUI() {
  const el = $('bagui'); if (!el) return;
  if (!GS.run || GS.state !== 'mission') { el.innerHTML = ''; return; }
  const kg = carryKg(), cap = bagCap(), lm = loadMult();
  const guns = GS.run.ws.filter(w => GUN_KG[w.id]).map(w => `<div class="bi gun"><i></i><span>${WEAPONS[w.id].name} <span class="dim">· 휴대 무기</span></span><span class="k">${GUN_KG[w.id].toFixed(1)}kg</span><span class="v"></span></div>`).join('');
  const items = GS.run.loot.map((l, i) => `<div class="bi" draggable="true" data-bi="${i}"><i>⋮⋮</i><span>${l.name} <span class="dim">${STATE_KO[l.state] || ''} ${Math.round((l.cond || 0) * 100)}%</span></span><span class="k">${(l.kg || 0).toFixed(1)}kg</span><span class="v">${fmt(l.val)} CR</span></div>`).join('');
  el.innerHTML = `<div class="bh"><span class="lbl">가방 · ${BAGS[GS.save.bag || 0].name}</span><span><b class="${kg > cap ? 'bad' : ''}">${kg.toFixed(1)} / ${cap} kg</b>${lm < 0.999 ? ` <span class="${kg > cap ? 'bad' : 'acc'}">이동 -${Math.round((1 - lm) * 100)}%</span>` : ''}</span></div>
    <div class="bl">${guns}${items || '<div class="dim" style="padding:8px 2px">회수한 부품이 없습니다.</div>'}</div>
    <div class="bdrop" id="bagdrop">버릴 부품을 여기로 끌어 놓으세요 · 버린 부품은 발밑에 떨어지고, 다시 가서 ${keyLabel(bind('use'))} 로 주울 수 있습니다</div>`;
  let dragI = -1;
  el.querySelectorAll('.bi[draggable]').forEach(r => {
    r.addEventListener('dragstart', e => { dragI = +r.dataset.bi; r.classList.add('drag'); try { e.dataTransfer.setData('text/plain', r.dataset.bi); e.dataTransfer.effectAllowed = 'move'; } catch (_) { } });
    r.addEventListener('dragend', () => r.classList.remove('drag'));
  });
  const z = $('bagdrop');
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); let i = dragI; try { const t = e.dataTransfer.getData('text/plain'); if (t !== '') i = +t; } catch (_) { } if (i >= 0) dropLootAt(i); });
}
function bindVolume(root) {
  root.querySelectorAll('[data-vol]').forEach(r => r.oninput = e => {
    const k = r.dataset.vol; GS.save.vol = GS.save.vol || {}; GS.save.vol[k] = +e.target.value;
    document.querySelectorAll(`[data-volv="${k}"]`).forEach(x => x.textContent = Math.round(GS.save.vol[k] * 100) + '%');
    document.querySelectorAll(`[data-vol="${k}"]`).forEach(x => { if (x !== r) x.value = GS.save.vol[k]; });
    applyVolume(); writeSave();
  });
  root.querySelectorAll('[data-vol]').forEach(r => r.onchange = () => { if (r.dataset.vol === 'enemy') SFX.eshot('rifle', 12); else SFX.ui(); });
}
function showPause(first) {
  { const vb = $('pausevol'); if (vb) { vb.innerHTML = `${[['all', '전체 소리'], ['sfx', '효과음 · 내 총'], ['enemy', '기계 소리 (적)']].map(([k, n]) => `<div class="sens"><span>${n}</span><input type="range" data-vol="${k}" min="0" max="1" step="0.05" value="${vol(k)}"><span class="mono" data-volv="${k}">${Math.round(vol(k) * 100)}%</span></div>`).join('')}`; bindVolume(vb); } }
  const kh = document.querySelector('#pause .keys'); if (kh) kh.innerHTML = keysHelpHtml();
  renderBagUI(); if (bagWant) { bagWant = false; setText($('pausetitle'), '가방'); }
  setText($('pausetitle'), first ? '작전 준비' : '일시정지');
  setText($('pausesub'), GS.run ? GS.run.mission.code : '');
  setText($('resume'), first ? '작전 시작' : '재개');
  setText($('pausemsg'), first ? '정면 장갑보다 관절, 센서, 등 뒤 동력 장치를 노리세요. 무력화된 부품은 더 쏘면 파괴됩니다.' : '');
  $('pause').classList.remove('hidden');
}
function showPauseMsg(m) { setText($('pausemsg'), m); }
$('resume').onclick = () => { initAudio(); lockPointer(); };
$('abandon').onclick = () => { if (GS.state === 'mission') endMission('abandon'); };
$('sens').value = GS.save.sens; setText($('sensv'), (+GS.save.sens).toFixed(2));
$('sens').oninput = e => { GS.save.sens = +e.target.value; setText($('sensv'), GS.save.sens.toFixed(2)); writeSave(); };

const active = () => GS.state === 'mission' && (controls.isLocked || TEST);
function kd(a) { const c = bind(a); return !!keys[c] || (c === 'ShiftLeft' && !!keys.ShiftRight); }
function actionOf(code) { for (const k of KEYDEF) if (bind(k[0]) === code) return k[0]; return ''; }
addEventListener('keydown', e => {
  if (!active()) return;
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  const a = actionOf(e.code); if (!a) return;
  if (a === 'jump') { e.preventDefault(); if (player.onGround && loadMult() > 0.3) { player.vy = 6.2 * (0.75 + 0.25 * Math.min(1, loadMult() / 0.75)); player.onGround = false; achEvent('jump'); } }
  if (a === 'crouch' && !e.repeat) achEvent('crouch');
  if (a === 'reload') startReload();
  if (a === 'w1') switchWeapon(0);
  if (a === 'w2') switchWeapon(1);
  if (a === 'w3') switchWeapon(2);
  if (a === 'w4') switchWeapon(3);
  if (a === 'swap') switchWeapon(GS.run.lastCur != null && GS.run.lastCur !== GS.run.cur ? GS.run.lastCur : (GS.run.cur === 0 ? 1 : 0));
  if (a === 'use') interact();
  if (a === 'drop' && !e.repeat) dropWorst();
  if (a === 'bag' && !e.repeat && !TEST) { bagWant = true; controls.unlock(); }
  if (a === 'heal') useMedkit();
  if (a === 'sk1') useSkill(0);
  if (a === 'sk2') useSkill(1);
  if (a === 'nade') throwGrenade();
  if (a === 'nadeSel') cycleGrenade();
  if (a === 'skip' && GS.run.mission.tut && !e.repeat) tutNext(true);
});
document.addEventListener('wheel', e => {
  if (!active() || !GS.run || GS.run.ws.length < 2 || Math.abs(e.deltaY) < 1) return;
  const n = GS.run.ws.length; switchWeapon((GS.run.cur + (e.deltaY > 0 ? 1 : n - 1)) % n);
}, { passive: true });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('keydown', e => { if (e.code === 'Escape' && GS.state === 'mission' && controls.isLocked) controls.unlock(); });
addEventListener('keydown', e => { if (GS.state === 'hub' && e.code === 'Enter' && GS.hubView === 'main' && !GS.hubModal && !(document.activeElement && /BUTTON|INPUT/.test(document.activeElement.tagName))) { e.preventDefault(); startMission(GS.selectedMission); } });
addEventListener('keydown', e => { if (GS.state === 'hub' && e.code === 'Escape' && (GS.hubModal || GS.hubView !== 'main')) { if (GS.hubModal) GS.hubModal = ''; else GS.hubView = 'main'; renderHub(); } });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; GS.mouseDown = GS.rightDown = false; });
document.addEventListener('mousedown', e => {
  if (!active()) return;
  if (e.button === 0) { GS.mouseDown = true; GS.firedThisPress = false; }
  if (e.button === 2) GS.rightDown = true;
});
document.addEventListener('mouseup', e => { if (e.button === 0) GS.mouseDown = false; if (e.button === 2) GS.rightDown = false; });
document.addEventListener('contextmenu', e => { if (GS.state === 'mission') e.preventDefault(); });
GS.mouseDX = 0, GS.mouseDY = 0;
document.addEventListener('mousemove', e => { if (controls.isLocked) { GS.mouseDX += e.movementX || 0; GS.mouseDY += e.movementY || 0; } });

export { active, bindVolume, kd, lockPointer, renderBagUI, showPause };
