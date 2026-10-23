import { GS } from './state.js?v=36';
import { clamp } from './utils.js?v=36';

// =====================================================================
//  오디오 (Web Audio 합성)
// =====================================================================
let actx = null, master = null, noiseBuf = null, revIn = null, sfxOff = 0, shaperCurve = null;
let aOut = null, busS = null, busE = null, revS = null, revE = null;
// 출력 사슬: 각 소리 → master → 압축기 → 스피커, 잔향은 revIn → 컨볼버 → master
function audioGraph(ctx) {
  const m = ctx.createGain(); m.gain.value = 0.34;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.14;
  const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 3800; hs.gain.value = -7;
  const lo = ctx.createBiquadFilter(); lo.type = 'peaking'; lo.frequency.value = 170; lo.Q.value = 0.9; lo.gain.value = 3.5;
  m.connect(hs); hs.connect(lo); lo.connect(comp); comp.connect(ctx.destination);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // 잔향: 어두워지며 사라지는 스테레오 잡음 (넓은 실외 · 콘크리트 벽 반사 느낌)
  const len = Math.floor(ctx.sampleRate * 1.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate, a = 0.42 - 0.34 * Math.min(1, t / 1.3);
      lp += ((Math.random() * 2 - 1) - lp) * a;
      const early = (t > 0.018 && t < 0.024) || (t > 0.041 && t < 0.046) ? 2.2 : 1;
      d[i] = lp * Math.exp(-t * 3.1) * early * (t < 0.008 ? t / 0.008 : 1);
    }
  }
  const cv = ctx.createConvolver(); cv.buffer = ir;
  const rg = ctx.createGain(); rg.gain.value = 0.85; const ri = ctx.createGain();
  ri.connect(cv); cv.connect(rg); rg.connect(m);
  return { m, nb, ri };
}
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const g = audioGraph(actx); noiseBuf = g.nb; aOut = g.m;
    // 효과음 · 기계 소리 버스 (잔향으로 보내는 양도 같은 비율로)
    busS = actx.createGain(); busE = actx.createGain(); revS = actx.createGain(); revE = actx.createGain();
    busS.connect(g.m); busE.connect(g.m); revS.connect(g.ri); revE.connect(g.ri);
    master = busS; revIn = revS; applyVolume();
  } catch (e) { actx = null; }
}
function shaperNode() {
  const sh = actx.createWaveShaper();
  if (!shaperCurve) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 2.8) / Math.tanh(2.8); } shaperCurve = c; }
  sh.curve = shaperCurve; return sh;
}
// 소리 크기 (0~1): 저장값이 없으면 전체 100 · 효과음 100 · 기계 소리 60
const VOL_DEF = { all: 1, sfx: 1, enemy: 0.6 };
function vol(k) { const v = GS.save.vol && GS.save.vol[k]; return v == null ? VOL_DEF[k] : v; }
function applyVolume() {
  if (!actx || !aOut) return;
  const t = actx.currentTime;
  aOut.gain.setTargetAtTime(0.34 * vol('all'), t, 0.02);
  busS.gain.setTargetAtTime(vol('sfx'), t, 0.02); revS.gain.setTargetAtTime(vol('sfx'), t, 0.02);
  busE.gain.setTargetAtTime(vol('enemy'), t, 0.02); revE.gain.setTargetAtTime(vol('enemy'), t, 0.02);
}
// 잡음 폭발: 필터 주파수를 f0 → f1로 훑으며 빠르게 사라짐 (총성의 몸통 · 균열음 · 폭발)
function gBurst(o) {
  if (!actx) return; const t = actx.currentTime + sfxOff + (o.when || 0), dur = o.dur;
  const src = actx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = o.rate || 1;
  const f = actx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
  f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur * 0.85);
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + (o.att || 0.0015)); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  src.connect(f); let node = f;
  if (o.drive) { const sh = shaperNode(); f.connect(sh); node = sh; }
  node.connect(g); g.connect(master);
  if (o.send && revIn) { const sg = actx.createGain(); sg.gain.value = o.send; g.connect(sg); sg.connect(revIn); }
  src.start(t, Math.random() * 1.2); src.stop(t + dur + 0.05);
}
// 저음 충격: 사인파 음높이가 빠르게 떨어짐 (몸으로 느끼는 반동)
function gThump(f0, f1, dur, gain, when = 0, send = 0) {
  if (!actx) return; const t = actx.currentTime + sfxOff + when;
  const o = actx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  o.connect(g); g.connect(master);
  if (send && revIn) { const sg = actx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(revIn); }
  o.start(t); o.stop(t + dur + 0.05);
}
// 금속 기계음: 짧은 잡음 + 아주 짧은 금속 울림
function gClick(freq, gain, when = 0, dur = 0.035) {
  freq *= 0.7;
  gBurst({ type: 'bandpass', f0: freq, q: 3.5, dur, gain, when, att: 0.0005 });
}
// 떨리는 잡음 (금속 마찰 · 증기 · 플라스마 · 웅웅거림) — 음정 있는 발진기를 쓰지 않음
function gNoiseHold(o) {
  if (!actx) return; const t = actx.currentTime + sfxOff + (o.when || 0), dur = o.dur;
  const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = actx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
  f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur * (o.glide || 0.9));
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + (o.att || 0.05));
  g.gain.setValueAtTime(o.gain, t + Math.max(o.att || 0.05, dur - (o.rel || 0.3))); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  src.connect(f); let node = f;
  if (o.drive) { const sh = shaperNode(); f.connect(sh); node = sh; }
  if (o.trem) { const tg = actx.createGain(); tg.gain.value = 1 - o.trem[1]; const lfo = actx.createOscillator(); lfo.type = o.tremWave || 'sine'; lfo.frequency.value = o.trem[0]; const ld = actx.createGain(); ld.gain.value = o.trem[1]; lfo.connect(ld); ld.connect(tg.gain); node.connect(tg); node = tg; lfo.start(t); lfo.stop(t + dur + 0.05); }
  node.connect(g); g.connect(master);
  if (o.send && revIn) { const sg = actx.createGain(); sg.gain.value = o.send; g.connect(sg); sg.connect(revIn); }
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
  return { src, f, g };
}
// 총기별 소리 설계: crack[고역 균열 주파수, 세기] · body[시작 · 끝 주파수, 길이, 세기] · thump[시작 · 끝 Hz, 길이, 세기] · send 잔향 · mech 기계음
const GUN_SND = {
  pistol:      { crack: [1736, 0.38], body: [2860, 637, 0.149, 1.03], thump: [150, 55, 0.096, 0.65], send: 0.32, mech: 'slide' },
  revolver:    { crack: [1488, 0.47], body: [2310, 360, 0.276, 1.26], thump: [115, 40, 0.18, 1.04], send: 0.5, drive: true, mech: 'hammer' },
  smg:         { crack: [2108, 0.28], body: [3410, 975, 0.086, 0.83], thump: [165, 70, 0.06, 0.42], send: 0.22 },
  carbine:     { crack: [1984, 0.35], body: [3575, 712, 0.115, 1.03], thump: [130, 48, 0.096, 0.65], send: 0.36 },
  burst:       { crack: [1922, 0.35], body: [3410, 675, 0.115, 1.03], thump: [125, 46, 0.096, 0.65], send: 0.36 },
  rifle:       { crack: [2232, 0.5], body: [3960, 487, 0.23, 1.26], thump: [105, 38, 0.156, 0.98], send: 0.62, drive: true, mech: 'slide' },
  lmg:         { crack: [1860, 0.33], body: [3080, 570, 0.138, 1.09], thump: [115, 44, 0.108, 0.78], send: 0.34, drive: true },
  shotgun:     { crack: [1364, 0.42], body: [1760, 240, 0.368, 1.49], thump: [92, 34, 0.24, 1.3], send: 0.6, drive: true, mech: 'pump' },
  autoshotgun: { crack: [1426, 0.4], body: [1870, 270, 0.276, 1.38], thump: [96, 36, 0.18, 1.17], send: 0.48, drive: true },
  amr:         { crack: [2356, 0.6], body: [2310, 172, 0.552, 1.67], thump: [72, 24, 0.432, 1.62], send: 0.95, drive: true, mech: 'bolt' },
  launcher:    { body: [715, 195, 0.253, 0.92], thump: [95, 48, 0.192, 1.17], send: 0.3, mech: 'tube' },
  railgun:     { crack: [2604, 0.45], body: [3850, 675, 0.207, 0.92], thump: [90, 30, 0.3, 1.17], send: 0.6 },
};
// far: 0(가까움) ~ 1(멀리) — 멀수록 고음이 깎이고 잔향 비율이 커짐
function gunShot(id, vol = 1, far = 0) {
  const P = GUN_SND[id] || GUN_SND.carbine, j = 1 + (Math.random() - 0.5) * 0.12, lp = 1 - 0.78 * far;
  if (P.crack) gBurst({ type: 'highpass', f0: P.crack[0] * j, dur: 0.014 + 0.012 * far, gain: P.crack[1] * vol * (1 - 0.85 * far), att: 0.0004, send: P.send * 0.3 });
  gBurst({ type: 'lowpass', f0: P.body[0] * j * lp, f1: P.body[1] * j, dur: P.body[2] * (1 + 0.6 * far), gain: P.body[3] * vol, att: 0.0015, drive: P.drive, send: P.send + 0.55 * far, q: 0.9 });
  gThump(P.thump[0] * j, P.thump[1], P.thump[2], P.thump[3] * vol * (1 - 0.55 * far), 0, P.send * 0.35);
  if (far < 0.2 && P.mech) gunMech(P.mech, vol);
}
function gunMech(k, v = 1) {
  if (k === 'slide') { gClick(3600, 0.14 * v, 0.05); gClick(2600, 0.1 * v, 0.085); }
  else if (k === 'hammer') gClick(2900, 0.16 * v, 0.004);
  else if (k === 'pump') { gClick(1700, 0.32 * v, 0.34, 0.05); gBurst({ type: 'bandpass', f0: 1100, q: 1.5, dur: 0.09, gain: 0.18 * v, when: 0.37 }); gClick(2400, 0.36 * v, 0.47, 0.05); }
  else if (k === 'bolt') { gClick(2100, 0.3 * v, 0.55, 0.05); gBurst({ type: 'bandpass', f0: 1500, q: 1.2, dur: 0.12, gain: 0.16 * v, when: 0.6 }); gClick(2800, 0.34 * v, 0.76, 0.05); }
  else if (k === 'tube') gClick(1200, 0.18 * v, 0.03, 0.05);
}
function sNoise(dur, freq, q, gain, type = 'lowpass', when = 0) {
  if (!actx) return; const t = actx.currentTime + sfxOff + when;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}
function sTone(freq, dur, type, gain, freqEnd, when = 0) {
  if (!actx) return; const t = actx.currentTime + sfxOff + when;
  const o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
let chgOsc = null, chgGain = null, chgFilt = null;
async function sfxRender(seq, len) {
  const save0 = [actx, master, noiseBuf, revIn];
  const ctx = new OfflineAudioContext(2, Math.ceil(44100 * len), 44100), g = audioGraph(ctx);
  actx = ctx; master = g.m; noiseBuf = g.nb; revIn = g.ri;
  try { for (const [t, fn] of seq) { sfxOff = t; fn(); } } finally { sfxOff = 0; }
  [actx, master, noiseBuf, revIn] = save0;
  return await ctx.startRendering();
}
const SFX = {
  shot(w) { gunShot(w, 1, 0); },
  eshot(type, dist) {
    const far = clamp(dist / 55, 0, 1), v = clamp(1 - dist / 70, 0.1, 1) * 0.6;
    if (type === 'heavy') gunShot('lmg', v * 1.1, far);
    else if (type === 'sniper') gunShot('rifle', Math.max(v, 0.3) * 1.2, far * 0.6);
    else if (type === 'scout') gunShot('smg', v * 0.8, far);
    else gunShot('carbine', v, far);
  },
  hit(kind) {
    if (kind === 'weak') { sTone(1900, 0.06, 'triangle', 0.32); sTone(2700, 0.07, 'sine', 0.2, null, 0.03); }
    else if (kind === 'armor') { sTone(650, 0.05, 'square', 0.13, 480); sNoise(0.05, 5200, 1, 0.18, 'highpass'); }
    else if (kind === 'kill') { sTone(880, 0.07, 'square', 0.22, 440); sTone(440, 0.14, 'square', 0.18, 220, 0.06); }
    else sTone(1250, 0.04, 'triangle', 0.24);
  },
  brk() { sNoise(0.32, 900, 0.6, 0.6); sTone(420, 0.2, 'square', 0.18, 90); },
  explode(dist) {
    const v = clamp(1 - dist / 70, 0.12, 1), far = clamp(dist / 60, 0, 1);
    gBurst({ type: 'lowpass', f0: 3200 * (1 - 0.65 * far), f1: 110, dur: 1.4, gain: 1.35 * v, att: 0.003, drive: true, send: 0.55 + 0.4 * far });
    gBurst({ type: 'highpass', f0: 1600, dur: 0.06, gain: 0.7 * v * (1 - far), att: 0.0005 });
    gThump(68, 22, 0.95, 1.3 * v, 0, 0.3);
    gBurst({ type: 'bandpass', f0: 700, q: 0.8, dur: 0.9, gain: 0.25 * v, when: 0.12, send: 0.4 });
  },
  shutdown() { sTone(600, 0.6, 'sawtooth', 0.15, 60); },
  pickup() { sTone(660, 0.07, 'triangle', 0.3); sTone(990, 0.1, 'triangle', 0.3, null, 0.07); },
  reload() { gClick(2300, 0.28, 0); gBurst({ type: 'bandpass', f0: 1400, q: 1.4, dur: 0.12, gain: 0.14, when: 0.05 }); gClick(1600, 0.34, 0.32, 0.05); gClick(3000, 0.24, 0.42); },
  empty() { gClick(3400, 0.22, 0, 0.02); },
  hurt() { sNoise(0.14, 800, 1, 0.38); sTone(160, 0.12, 'sawtooth', 0.18, 90); },
  ui() { sTone(1000, 0.04, 'triangle', 0.12); },
  chargeStart() {
    if (!actx) return; this.chargeStop();
    const t = actx.currentTime, o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 160; f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); chgOsc = o; chgGain = g; chgFilt = f;
  },
  chargeSet(k) { if (!chgOsc) return; const t = actx.currentTime; chgOsc.frequency.setTargetAtTime(160 + 1100 * k * k, t, 0.04); chgFilt.frequency.setTargetAtTime(900 + 3200 * k, t, 0.05); chgGain.gain.setTargetAtTime(0.07 + 0.06 * k, t, 0.05); },
  chargeStop() {
    if (!chgOsc || !actx) { chgOsc = null; return; }
    const t = actx.currentTime + sfxOff; try { chgGain.gain.cancelScheduledValues(t); chgGain.gain.setTargetAtTime(0.0001, t, 0.03); chgOsc.stop(t + 0.15); } catch (e) { }
    chgOsc = null; chgGain = null; chgFilt = null;
  },
  rail(k) {
    gBurst({ type: 'highpass', f0: 4500, dur: 0.025, gain: 0.6 + 0.6 * k, att: 0.0004, send: 0.3 });
    gBurst({ type: 'bandpass', f0: 6500, f1: 700, q: 1.1, dur: 0.22 + 0.45 * k, gain: 0.45 + 0.6 * k, send: 0.45 + 0.4 * k });
    sTone(1800, 0.22 + 0.3 * k, 'sine', 0.1 + 0.12 * k, 160);
    gThump(110, 30, 0.2 + 0.5 * k, 0.5 + 0.8 * k, 0, 0.4);
    if (k >= 0.999) { gBurst({ type: 'lowpass', f0: 2500, f1: 90, dur: 1.2, gain: 0.9, drive: true, send: 0.8 }); gThump(60, 22, 1.0, 1.1, 0.02, 0.5); }
  },
  achievement() { [523, 659, 784, 1047].forEach((f, i) => sTone(f, 0.18, 'triangle', 0.22, null, i * 0.07)); },
  toss() { sNoise(0.12, 900, 1, 0.25, 'bandpass'); },
  emp() { sTone(1200, 0.5, 'sawtooth', 0.2, 60); sTone(80, 0.6, 'sine', 0.4, 30); sNoise(0.5, 3000, 0.8, 0.3, 'highpass'); },
  skill(id) {
    if (id === 'dash') sNoise(0.25, 1800, 0.6, 0.4, 'bandpass');
    else if (id === 'focus') { sTone(400, 0.8, 'sine', 0.25, 90); }
    else if (id === 'shield') { sTone(500, 0.4, 'triangle', 0.25, 900); }
    else { sTone(700, 0.12, 'triangle', 0.25); sTone(1050, 0.18, 'triangle', 0.22, null, 0.1); }
  },
  dragonRoar() { sTone(340, 1.3, 'sawtooth', 0.24, 110); sTone(520, 1.0, 'square', 0.07, 180, 0.1); sNoise(1.1, 900, 0.6, 0.32); },
  breath() { sNoise(1.4, 2600, 0.7, 0.32, 'bandpass'); sTone(600, 1.3, 'sine', 0.14, 300); },
  thunder(dist) { const v = clamp(1 - dist / 70, 0.15, 1); sNoise(1.2, 1200, 0.4, 0.9 * v); sTone(60, 0.9, 'sine', 0.5 * v, 25); sNoise(0.15, 6000, 1, 0.5 * v, 'highpass'); },
  roar() { sTone(150, 1.4, 'sawtooth', 0.32, 45); sNoise(1.2, 420, 0.7, 0.45); sTone(95, 1.2, 'square', 0.14, 40, 0.1); },
  missile() { sNoise(0.45, 1700, 0.8, 0.28, 'bandpass'); },
  shock() { sTone(60, 0.8, 'sine', 0.6, 25); sNoise(0.7, 300, 0.5, 0.55); },
  laser() { sTone(220, 2.2, 'sawtooth', 0.22, 180); sTone(440, 2.2, 'square', 0.08, 300); sNoise(2.2, 2500, 0.8, 0.18, 'bandpass'); },
  lock() { sTone(1800, 0.08, 'square', 0.13); sTone(2400, 0.08, 'square', 0.11, null, 0.1); },
  spider() { sTone(820, 0.6, 'sawtooth', 0.14, 260); sTone(1240, 0.45, 'square', 0.05, 500, 0.05); sNoise(0.7, 1400, 0.7, 0.25); },
  objective() { sTone(523, 0.12, 'triangle', 0.28); sTone(784, 0.22, 'triangle', 0.28, null, 0.12); },
};
// 게임 전체 효과음 (전자음 없이)
Object.assign(SFX, {
  hit(kind) {
    if (kind === 'weak') { gClick(2600, 0.34, 0, 0.025); gBurst({ type: 'highpass', f0: 2600, dur: 0.03, gain: 0.16 }); }
    else if (kind === 'armor') { gClick(1700, 0.26, 0, 0.04); gBurst({ type: 'bandpass', f0: 2300, q: 4, dur: 0.06, gain: 0.14 }); }
    else if (kind === 'kill') { gBurst({ type: 'lowpass', f0: 1400, f1: 220, dur: 0.2, gain: 0.5, drive: true, send: 0.2 }); gThump(120, 48, 0.14, 0.55); }
    else gClick(2100, 0.22, 0, 0.025);
  },
  brk() { gBurst({ type: 'lowpass', f0: 2200, f1: 260, dur: 0.38, gain: 0.6, drive: true, send: 0.3 }); for (let i = 0; i < 4; i++) gClick(900 + Math.random() * 900, 0.16, 0.06 + i * 0.07 + Math.random() * 0.04, 0.035); },
  shutdown() { gNoiseHold({ type: 'lowpass', f0: 1400, f1: 110, glide: 1, q: 1.2, dur: 0.75, gain: 0.32, att: 0.01, rel: 0.5, send: 0.3 }); gThump(90, 30, 0.5, 0.45); },
  pickup() { gClick(1300, 0.24, 0, 0.03); gBurst({ type: 'lowpass', f0: 800, f1: 260, dur: 0.09, gain: 0.32, when: 0.02 }); },
  hurt() { gBurst({ type: 'lowpass', f0: 1200, f1: 180, dur: 0.18, gain: 0.5 }); gThump(90, 40, 0.15, 0.6); },
  ui() { gClick(2000, 0.12, 0, 0.02); },
  achievement() { gThump(100, 62, 0.35, 0.45, 0, 0.5); gBurst({ type: 'bandpass', f0: 1300, f1: 700, q: 1.6, dur: 0.45, gain: 0.2, send: 0.7 }); gClick(1600, 0.16, 0.08); },
  objective() { gThump(88, 44, 0.55, 0.6, 0, 0.6); gBurst({ type: 'bandpass', f0: 900, f1: 520, q: 1.4, dur: 0.6, gain: 0.26, send: 0.8 }); },
  toss() { gBurst({ type: 'bandpass', f0: 700, q: 1, dur: 0.14, gain: 0.25 }); },
  emp() { gNoiseHold({ f0: 2400, f1: 220, glide: 1, q: 1.6, dur: 0.65, gain: 0.38, att: 0.01, rel: 0.4, trem: [33, 0.6], tremWave: 'square', send: 0.5 }); gThump(80, 28, 0.6, 0.7, 0, 0.4); for (let i = 0; i < 5; i++) gClick(1500 + Math.random() * 1200, 0.14, Math.random() * 0.4, 0.02); },
  skill(id) {
    if (id === 'dash') gNoiseHold({ f0: 380, f1: 1600, glide: 0.8, q: 1, dur: 0.3, gain: 0.4, att: 0.02, rel: 0.2 });
    else if (id === 'focus') { gNoiseHold({ type: 'lowpass', f0: 1500, f1: 160, glide: 1, dur: 0.9, gain: 0.32, att: 0.02, rel: 0.6, send: 0.6 }); gThump(70, 30, 0.8, 0.6, 0, 0.5); }
    else if (id === 'shield') { gNoiseHold({ f0: 500, f1: 1400, glide: 0.7, q: 1.4, dur: 0.45, gain: 0.3, att: 0.02, rel: 0.3, send: 0.4 }); gThump(110, 60, 0.3, 0.4); }
    else { gBurst({ type: 'lowpass', f0: 1500, f1: 300, dur: 0.22, gain: 0.35, send: 0.3 }); gThump(100, 50, 0.2, 0.45); }
  },
  thunder(dist) {
    const v = clamp(1 - dist / 70, 0.15, 1);
    gBurst({ type: 'highpass', f0: 2400, dur: 0.06, gain: 0.55 * v, att: 0.0005 });
    gBurst({ type: 'lowpass', f0: 2600, f1: 90, dur: 1.7, gain: 1.0 * v, drive: true, send: 0.85 });
    gThump(58, 22, 1.2, 1.0 * v, 0, 0.5);
  },
  lock() { gClick(2300, 0.26, 0, 0.025); gClick(2300, 0.26, 0.11, 0.025); },
  armTick() { gClick(1700, 0.32, 0, 0.03); gClick(1700, 0.32, 0.15, 0.03); gClick(1900, 0.38, 0.3, 0.035); },
  // 보스: 낮고 웅장하게, 음정 있는 소리 없이
  roar() {
    gThump(46, 22, 1.6, 1.1, 0.05, 0.5);
    gNoiseHold({ type: 'lowpass', f0: 420, f1: 170, q: 0.9, dur: 1.7, gain: 0.95, att: 0.12, rel: 0.6, drive: true, trem: [19, 0.55], send: 0.85 });
    gNoiseHold({ f0: 260, f1: 180, q: 2, dur: 1.5, gain: 0.5, att: 0.1, rel: 0.6, drive: true, trem: [27, 0.6], tremWave: 'square', send: 0.8 });
    gNoiseHold({ type: 'highpass', f0: 1300, dur: 0.7, gain: 0.1, att: 0.2, rel: 0.4, when: 1.1, send: 0.55 });
  },
  dragonRoar() {
    gThump(60, 26, 1.2, 0.85, 0, 0.5);
    gNoiseHold({ type: 'lowpass', f0: 700, f1: 260, q: 1.1, dur: 1.6, gain: 0.85, att: 0.1, rel: 0.6, drive: true, trem: [29, 0.5], send: 0.95 });
    gNoiseHold({ f0: 520, f1: 300, q: 3, dur: 1.4, gain: 0.38, att: 0.06, rel: 0.5, trem: [41, 0.7], tremWave: 'square', send: 0.85 });
  },
  breath() {
    gThump(52, 30, 1.3, 0.6, 0, 0.4);
    gNoiseHold({ type: 'lowpass', f0: 350, f1: 1300, glide: 0.35, q: 0.7, dur: 1.4, gain: 0.6, att: 0.12, rel: 0.5, drive: true, send: 0.75 });
    gNoiseHold({ f0: 1600, q: 2, dur: 1.3, gain: 0.1, att: 0.1, rel: 0.5, trem: [37, 0.6], send: 0.6 });
  },
  spider() {
    gThump(55, 30, 0.9, 0.7, 0, 0.5);
    for (let i = 0; i < 14; i++) gClick(750 + Math.random() * 800, 0.14 + Math.random() * 0.1, i * 0.045 + Math.random() * 0.015, 0.03);
    gNoiseHold({ f0: 300, f1: 420, q: 2, dur: 0.8, gain: 0.3, att: 0.05, rel: 0.3, drive: true, trem: [26, 0.5], send: 0.65 });
  },
  missile() {
    if (actx && actx.currentTime - (this.lastMis || -1) < 0.18) return; if (actx) this.lastMis = actx.currentTime;
    gThump(60, 30, 0.3, 0.22, 0, 0.25);
    gBurst({ type: 'lowpass', f0: 1000, f1: 220, dur: 0.18, gain: 0.2, drive: true, send: 0.3 });
    gNoiseHold({ f0: 350, f1: 1100, glide: 0.8, q: 1.4, dur: 0.5, gain: 0.11, att: 0.04, rel: 0.3, send: 0.4 });
  },
  laserCharge(dur) {
    gNoiseHold({ f0: 160, f1: 900, glide: 1, q: 5, dur: dur + 0.1, gain: 0.32, att: 0.05, rel: 0.12, drive: true, send: 0.5 });
    gThump(70, 40, dur, 0.35, 0, 0.3);
  },
  shock() {
    gThump(58, 20, 1.1, 1.3, 0, 0.4);
    gBurst({ type: 'lowpass', f0: 600, f1: 70, dur: 1.2, gain: 0.95, drive: true, send: 0.75 });
    gNoiseHold({ type: 'lowpass', f0: 160, dur: 1.4, gain: 0.4, att: 0.05, rel: 0.9, trem: [14, 0.5], send: 0.65 });
    for (let i = 0; i < 6; i++) gClick(500 + Math.random() * 500, 0.12, 0.15 + i * 0.09 + Math.random() * 0.05, 0.04);
  },
  laser() {
    gThump(55, 48, 2.2, 0.5, 0, 0.4);
    gNoiseHold({ f0: 140, q: 6, dur: 2.2, gain: 0.7, att: 0.25, rel: 0.4, drive: true, trem: [50, 0.4], send: 0.6 });
    gNoiseHold({ f0: 800, q: 1.5, dur: 2.2, gain: 0.16, att: 0.2, rel: 0.4, trem: [17, 0.8], tremWave: 'square', send: 0.6 });
  },
  rail(k) {
    gBurst({ type: 'highpass', f0: 3000, dur: 0.025, gain: 0.4 + 0.4 * k, att: 0.0004, send: 0.3 });
    gBurst({ type: 'bandpass', f0: 3200, f1: 400, q: 1.1, dur: 0.22 + 0.45 * k, gain: 0.45 + 0.6 * k, send: 0.5 + 0.4 * k });
    gThump(100, 28, 0.2 + 0.5 * k, 0.6 + 0.8 * k, 0, 0.4);
    if (k >= 0.999) { gBurst({ type: 'lowpass', f0: 1600, f1: 80, dur: 1.2, gain: 0.9, drive: true, send: 0.85 }); gThump(55, 20, 1.0, 1.1, 0.02, 0.5); }
  },
  // 레일건 충전: 잡음이 점점 높아지는 '쓔우웅'
  chargeStart() {
    if (!actx) return; this.chargeStop();
    const h = gNoiseHold({ f0: 180, q: 4, dur: 30, gain: 0.22, att: 0.12, rel: 0.1, drive: true });
    if (h) { chgOsc = h.src; chgGain = h.g; chgFilt = h.f; }
  },
  chargeSet(k) { if (!chgOsc || !actx) return; const t = actx.currentTime + sfxOff; chgFilt.frequency.setTargetAtTime(180 + 1300 * k * k, t, 0.05); chgGain.gain.setTargetAtTime(0.22 + 0.2 * k, t, 0.05); },
});
// 기계(적) 소리는 기계 소리 버스로 보냄
for (const k of ['eshot', 'roar', 'dragonRoar', 'breath', 'spider', 'missile', 'shock', 'laser', 'laserCharge', 'thunder']) {
  const f = SFX[k]; if (!f) continue;
  SFX[k] = function (...a) {
    if (!busE || !actx || busE.context !== actx) return f.apply(this, a);
    const m0 = master, r0 = revIn; master = busE; revIn = revE;
    try { return f.apply(this, a); } finally { master = m0; revIn = r0; }
  };
}

export { SFX, aOut, actx, applyVolume, busE, busS, initAudio, master, sfxRender, vol };
