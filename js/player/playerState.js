import * as THREE from 'three';
import { GS } from '../core/state.js?v=39';
import { V3 } from '../core/utils.js?v=39';
import { W } from '../data/data.js?v=39';

// =====================================================================
//  플레이어 / 실행 상태
// =====================================================================
const EYE = 1.62, P_RADIUS = 0.35, P_HEIGHT = 1.8, STEP = 0.45, GRAV = 18;
const player = { pos: V3(), vel: V3(), vy: 0, onGround: true, hp: 100, maxHp: 100, dr: 0, lastHurt: -99, hspeed: 0, crouch: 0, eye: 1.62, height: 1.8 };
GS.state = 'boot';       // boot | hub | mission | result
GS.run = null;           // 현재 임무 상태
GS.selectedMission = 'A';
GS.time = 0;
const keys = {};
GS.mouseDown = false, GS.rightDown = false, GS.firedThisPress = false;
GS.ads = 0, GS.fireCd = 0, GS.bloom = 0, GS.vmKick = 0, GS.swayX = 0, GS.swayY = 0, GS.bobT = 0, GS.shake = 0;
const recoil = { cur: 0, target: 0 };
GS.vigT = 0, GS.dmgDirT = 0, GS.hitT = 0, GS.popupT = 0, GS.earlyConfirmT = 0;
const raycaster = new THREE.Raycaster();

function curWeapon() { return GS.run.ws[GS.run.cur]; }
function curW() { return W(curWeapon().id); }

export { EYE, GRAV, P_HEIGHT, P_RADIUS, STEP, curW, curWeapon, keys, player, raycaster, recoil };
