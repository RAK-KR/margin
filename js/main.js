import * as THREE from 'three';
import { GS } from './core/state.js?v=37';
// 원래 단일 파일과 같은 순서로 모듈을 실행
import './core/utils.js?v=37';
import './data/data.js?v=37';
import './core/save.js?v=37';
import './core/audio.js?v=37';
import './core/renderer.js?v=37';
import './world/world.js?v=37';
import './fx/effects.js?v=37';
import './player/viewmodel.js?v=37';
import './enemies/robot.js?v=37';
import './player/playerState.js?v=37';
import './player/player.js?v=37';
import './world/missions.js?v=37';
import './bosses/core.js?v=37';
import './modes/tutorial.js?v=37';
import './player/input.js?v=37';
import './combat/shooting.js?v=37';
import './combat/damage.js?v=37';
import './enemies/ai.js?v=37';
import './bosses/rex.js?v=37';
import './bosses/dragon.js?v=37';
import './enemies/extra.js?v=37';
import './bosses/spider.js?v=37';
import './modes/coop.js?v=37';
import './modes/difficulty.js?v=37';
import './meta/achievements.js?v=37';
import './game/loot.js?v=37';
import './ui/hud.js?v=37';
import './game/result.js?v=37';
import './ui/hub.js?v=37';
import './ui/hub3d.js?v=37';
import { $, TEST } from './core/utils.js?v=37';
import { ETYPES, WEAPONS, bind, effW } from './data/data.js?v=37';
import { SFX, aOut, actx, busE, busS, initAudio, master, sfxRender } from './core/audio.js?v=37';
import { camera, renderer, scene, vmCam, vmScene } from './core/renderer.js?v=37';
import { FX, spawnBeam, updateBeams, updateFX } from './fx/effects.js?v=37';
import { GUNS, SKINS, SKIN_THEMES, applySkin, skinOwned, skinSel, skinsFor, updateSkinFX } from './player/viewmodel.js?v=37';
import { keys, player, recoil } from './player/playerState.js?v=37';
import { damagePlayer, updateLootVisuals, updatePlayer, updateViewmodel } from './player/player.js?v=37';
import { capZones, startMission, updateZones } from './world/missions.js?v=37';
import { coreExposed } from './bosses/core.js?v=37';
import { TUT_STEPS, tutNext, updateTutorial, xrayFlush } from './modes/tutorial.js?v=37';
import { active, renderBagUI, showPause } from './player/input.js?v=37';
import { empAt, fireRay, switchWeapon, tryFire, updateFadeRings, updateThrowables } from './combat/shooting.js?v=37';
import { damagePart, handlePartEvent } from './combat/damage.js?v=37';
import { updateEnemy, updateProjectiles } from './enemies/ai.js?v=37';
import { updateMissiles } from './bosses/rex.js?v=37';
import { applyDragonPose, dragonNodesOpen, updateBolts } from './bosses/dragon.js?v=37';
import { spawnDrone } from './enemies/extra.js?v=37';
import { spawnMite, spiderBrood, spiderExposed } from './bosses/spider.js?v=37';
import { NET, coopHost, coopJoin, coopLaunch, coopLeave, coopOn, coopTick, isGuest, isHost } from './modes/coop.js?v=37';
import { chaosTick, extremeProgress, extremeUnlocked, hardUnlocked } from './modes/difficulty.js?v=37';
import { ACH, achEvent, achTick, achUnlock, killEnemy } from './meta/achievements.js?v=37';
import { autoPickup, bagCap, carryKg, createLoot, dropLootAt, dropWorst, interact, loadMult, nearestLoot, updateFallers } from './game/loot.js?v=37';
import { updateHUD } from './ui/hud.js?v=37';
import { endMission, goHub, showEnding } from './game/result.js?v=37';
import { buy, carryList, gunThumb, renderHub } from './ui/hub.js?v=37';
import { HUB, hubCam, hubScene, updateHub3D } from './ui/hub3d.js?v=37';

// =====================================================================
//  루프
// =====================================================================
const clock = new THREE.Clock();
function update(dt) {
  GS.time += dt;
  if (GS.state === 'hub') updateHub3D(dt);
  if (active() || (coopOn() && GS.state === 'mission')) {
    updatePlayer(dt);
    if (GS.state === 'mission' && player.hp > 0 && !player.downed && !isGuest()) autoPickup();
    if (coopOn() && GS.state === 'mission') coopTick(dt);
    if (GS.state === 'mission') achTick(dt);
    if (GS.state === 'mission' && capZones.length && !isGuest()) updateZones(dt);
    if (GS.state === 'mission' && GS.run.tut) updateTutorial(dt);
    // 전진 권한: 경계 중이고 무장한 적 가운데 가장 가까운 2기만 플레이어 쪽으로 밀고 들어옴
    const cand = GS.enemies.filter(e => !e.dead && !e.boss && e.alert && e.canShoot);
    cand.sort((a, b) => a.root.position.distanceToSquared(player.pos) - b.root.position.distanceToSquared(player.pos));
    for (const e of GS.enemies) e.mayAdvance = false;
    for (let i = 0; i < Math.min(2, cand.length); i++) cand[i].mayAdvance = true;
    const edt = GS.run.focusT > 0 ? dt * 0.4 : dt;
    for (const e of GS.enemies) updateEnemy(e, edt);
    updateProjectiles(edt);
    updateMissiles(edt);
    updateSkinFX(dt);
    if (GS.run.chaos && !isGuest()) chaosTick(edt);
    updateBolts(edt);
    updateThrowables(dt);
    updateFadeRings(dt);
    updateFallers(dt);
    updateFX(dt); updateBeams(dt);
    updateViewmodel(dt);
    updateLootVisuals();
    updateHUD(dt);
  }
}
function render() {
  xrayFlush();
  renderer.clear();
  if (GS.state === 'hub' || GS.state === 'boot') { hubCam.aspect = innerWidth / innerHeight; if (Math.abs(HUB.offX || 0) > 0.5) hubCam.setViewOffset(innerWidth, innerHeight, HUB.offX, 0, innerWidth, innerHeight); else hubCam.clearViewOffset(); renderer.render(hubScene, hubCam); }
  if (GS.state === 'mission' || GS.state === 'result') {
    renderer.render(scene, camera);
    renderer.clearDepth();
    vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix();
    renderer.render(vmScene, vmCam);
  }
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt); render();
}

// 시작
$('loading').classList.add('hidden');
window.__marginReady = true;
GS.state = 'hub'; if (!GS.save.seenIntro && !TEST) GS.hubModal = 'intro'; renderHub(); $('hub').classList.remove('hidden');
loop();

// 테스트 훅 (?test 주소에서만 노출)
if (TEST) {
  window.__M = {
    get save() { return GS.save; }, get run() { return GS.run; }, get enemies() { return GS.enemies; }, get loots() { return GS.loots; },
    get state() { return GS.state; }, get hittables() { return GS.hittables; }, get boxes() { return GS.boxes; }, get shocks() { return GS.shocks; }, get bolts() { return GS.bolts; }, get throwables() { return GS.throwables; }, hurt(d, src) { damagePlayer(d, player.pos.clone().add(new THREE.Vector3(0, 0, -1)), src); }, achEvent, achUnlock, ACH, achTick, get HARD() { return GS.HARD; }, hardUnlocked, extremeUnlocked, extremeProgress, effW, NET, coopHost, coopJoin, coopLaunch, coopLeave, isHost, isGuest, spawnDrone, spiderExposed, get MAPB() { return GS.MAPB; }, killEnemy(e, c) { killEnemy(e, c); }, createLoot, dragonOpen(e) { return dragonNodesOpen(e); }, empAt(p, r) { empAt(p, r); }, dragonPose(e) { applyDragonPose(e, e.headPos, e.headDir, e.segPts); }, get dmgLog() { return GS.dmgLog; }, get missiles() { return GS.missiles; }, get fallers() { return GS.fallers; },
    player, camera, THREE, startMission, endMission, buy, interact, goHub, update, render, tryFire, fireRay, switchWeapon,
    setMouse(v) { GS.mouseDown = v; GS.firedThisPress = false; }, setGod(v) { GS.godMode = v; }, setAds(v) { GS.rightDown = v; }, keys,
    aimAt(v) { camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z); camera.lookAt(v); camera.updateMatrixWorld(); recoil.cur = recoil.target = 0; },
    tick(sec, step = 1 / 60) { for (let t = 0; t < sec; t += step) update(step); render(); },
    WEAPONS, ETYPES, SFX, sfxRender, coreExposed, showEnding, damagePart, handlePartEvent, get TUT_STEPS() { return TUT_STEPS; }, tutNext, spawnMite, spiderBrood, get capZones() { return capZones; }, updateZones, carryKg, bagCap, loadMult, dropWorst, dropLootAt, renderBagUI, showPause, gunThumb, SKINS, SKIN_THEMES, applySkin, skinsFor, skinOwned, skinSel, chaosTick, get CHAOS() { return GS.CHAOS; }, GUNS, initAudio, get audioBus() { return { busE, busS, master, actx, aOut }; }, bind, carryList, nearestLoot, spawnBeam, get FXB() { return FX.beams; },
  };
}
