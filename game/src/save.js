// Save and load, in localStorage only. One JSON object: cash, mission progress, packages
// found, stats and where the player stands. A corrupt or absent save loads as a new game.
import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    cash: 0,
    missionIndex: 0,
    packages: [],
    stats: { carsStolen: 0, fares: 0, arrests: 0 },
    player: { x: 0, z: 37, heading: Math.PI },
    savedAt: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const save = defaultSave();
    if (typeof parsed.cash === 'number') save.cash = parsed.cash;
    if (typeof parsed.missionIndex === 'number') save.missionIndex = parsed.missionIndex;
    if (Array.isArray(parsed.packages)) save.packages = parsed.packages.filter((n) => typeof n === 'number');
    if (parsed.stats) save.stats = { ...save.stats, ...parsed.stats };
    if (parsed.player) save.player = { ...save.player, ...parsed.player };
    return save;
  } catch {
    return defaultSave();
  }
}

export function writeSave(save) {
  try {
    const copy = { ...save, savedAt: Date.now() };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: the game then simply does not persist.
  }
}
