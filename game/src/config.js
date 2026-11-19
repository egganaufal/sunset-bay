// Tuning constants for SOLMARA. One place for every number a designer would tweak:
// city size, movement speeds, wanted rules, mission rewards, audio levels.
export const STEP = 1 / 60;

export const CITY = {
  blocks: 9, // blocks per side
  blockSize: 60, // metres of building block
  roadWidth: 14, // metres of road between blocks
  get pitch() { return this.blockSize + this.roadWidth; },
  get half() { return (this.blocks * this.pitch) / 2; },
};

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 11,
  accel: 40,
  radius: 0.6,
  height: 1.8,
  maxHealth: 100,
};

export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 42,
  maxReverse: 12,
  steerAngle: 0.55,
  grip: 6.5,
  radius: 2.2,
};

export const WANTED = {
  decaySeconds: 45, // quiet seconds to lose one star
  stealHeat: 1, // stars added for stealing a car in sight
  hitPedHeat: 1,
  hitCopHeat: 2,
  shootHeat: 1,
  maxStars: 5,
  bustedSeconds: 1.6, // cop contact time to get busted on foot
};

export const MISSION_REWARDS = [400, 700, 900, 1200, 2500];
export const TAXI_FARE_BASE = 60;
export const PACKAGE_REWARD = 150;

export const SAVE_KEY = 'solmara-save-v1';
export const BEST_KEY = 'solmara-best-cash';
