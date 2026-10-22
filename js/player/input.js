import { GS } from '../core/state.js?v=32';
import { $, TEST, setText } from '../core/utils.js?v=32';
import { KEYDEF, bind, keyLabel } from '../data/data.js?v=32';
import { writeSave } from '../core/save.js?v=32';
import { initAudio } from '../core/audio.js?v=32';
import { controls } from '../core/renderer.js?v=32';
import { keys, player } from './playerState.js?v=32';
import { startMission } from '../world/missions.js?v=32';
import { tutNext } from '../modes/tutorial.js?v=32';
import { cycleGrenade, startReload, switchWeapon, throwGrenade, useMedkit, useSkill } from '../combat/shooting.js?v=32';
import { achEvent } from '../meta/achievements.js?v=32';
import { dropWorst, interact, loadMult } from '../game/loot.js?v=32';
import { endMission } from '../game/result.js?v=32';
import { renderHub } from '../ui/hub.js?v=32';

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
    <b>${L('use')}</b><span>탄약 보급 · 탈출 · 무게 초과 부품 줍기 (부품은 밟으면 자동 회수)</span><b>${L('drop')}</b><span>무게 대비 가치가 가장 낮은 부품 버리기</span>
    <b>${L('sk1')} / ${L('sk2')}</b><span>스킬 1 / 2</span><b>${L('nade')} / ${L('nadeSel')}</b><span>투척물 던지기 / 종류 전환</span><b>${L('heal')}</b><span>응급 키트 · 회복 주사기</span><b>Esc</b><span>일시정지</span>`;
}
function showPause(first) {
  const kh = document.querySelector('#pause .keys'); if (kh) kh.innerHTML = keysHelpHtml();
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
  if (a === 'jump') { e.preventDefault(); if (player.onGround && loadMult() > 0.1) { player.vy = 6.2; player.onGround = false; achEvent('jump'); } }
  if (a === 'crouch' && !e.repeat) achEvent('crouch');
  if (a === 'reload') startReload();
  if (a === 'w1') switchWeapon(0);
  if (a === 'w2') switchWeapon(1);
  if (a === 'w3') switchWeapon(2);
  if (a === 'w4') switchWeapon(3);
  if (a === 'swap') switchWeapon(GS.run.lastCur != null && GS.run.lastCur !== GS.run.cur ? GS.run.lastCur : (GS.run.cur === 0 ? 1 : 0));
  if (a === 'use') interact();
  if (a === 'drop' && !e.repeat) dropWorst();
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

export { active, kd, lockPointer, showPause };
