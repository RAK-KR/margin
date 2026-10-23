import { GS } from './state.js?v=39';
import { GRENADES } from '../data/data.js?v=39';

// =====================================================================
//  저장
// =====================================================================
const SAVE_KEY = 'margin_save_v1';
function defaultSave() {
  return { credits: 2000, weapons: { pistol: true }, utils: {}, mods: { dmg: 0, recoil: 0, reload: 0, mag: 0, move: 0 }, skills: {}, slots: ['', ''], inv: { emp: 0, frag: 0, stim: 0, ammo: 0 }, grenadeSel: 'emp', hardSel: false, wlv: {}, bag: 0, carry: [], binds: {}, ach: { done: {}, c: {} }, equipped: 'pistol', armor: 0, salvage: 0,
    unlocked: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, T: true, H: false }, kills: 0, records: {}, deaths: 0, totalEarned: 0, sens: 1,
    stats: { A: { runs: 0, clears: 0, best: 0 }, B: { runs: 0, clears: 0, best: 0 }, C: { runs: 0, clears: 0, best: 0 }, D: { runs: 0, clears: 0, best: 0 }, E: { runs: 0, clears: 0, best: 0 }, F: { runs: 0, clears: 0, best: 0 }, G: { runs: 0, clears: 0, best: 0 }, T: { runs: 0, clears: 0, best: 0 }, H: { runs: 0, clears: 0, best: 0 } }, lore: {}, ended: false };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const d = Object.assign(defaultSave(), JSON.parse(raw));
    d.weapons = Object.assign({ pistol: true }, d.weapons); d.utils = Object.assign({}, d.utils);
    const df = defaultSave(); d.mods = Object.assign(df.mods, d.mods); d.skills = Object.assign({}, d.skills); d.inv = Object.assign(df.inv, d.inv);
    if (d.inv.smoke) { d.credits += d.inv.smoke * 200; } delete d.inv.smoke; if (!GRENADES.includes(d.grenadeSel)) d.grenadeSel = 'emp';
    if (!Array.isArray(d.slots) || d.slots.length !== 2) d.slots = ['', ''];
    d.wlv = Object.assign({}, d.wlv); d.binds = Object.assign({}, d.binds); d.bag = +d.bag || 0;
    d.carry = Array.isArray(d.carry) ? d.carry.filter(id => d.weapons[id] && id !== 'pistol') : [];
    d.ach = Object.assign({ done: {}, c: {} }, d.ach); d.ach.done = Object.assign({}, d.ach.done); d.ach.c = Object.assign({}, d.ach.c);
    d.unlocked = { A: true, B: true, C: true, D: true, E: true, F: true, G: true, T: true, H: !!((d.unlocked && d.unlocked.H) || (d.stats && d.stats.G && d.stats.G.clears > 0)) };
    d.lore = Object.assign({}, d.lore); d.records = Object.assign({}, d.records);
    d.stats = Object.assign(defaultSave().stats, d.stats);
    if (!d.weapons[d.equipped]) d.equipped = 'pistol';
    return d;
  } catch (e) { return defaultSave(); }
}
GS.save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(GS.save)); } catch (e) { } }

export { defaultSave, writeSave };
