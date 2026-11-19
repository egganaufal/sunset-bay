// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between title, play,
// paused, game over, busted and story-complete screens. ?seed=N fixes the city; ?shot=
// chase|drive|street|mission stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { clearSave, defaultSave, loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const input = createInput(canvas);
const audio = createAudio();
let save = loadSave();
const world = createWorld(seed, save);
const renderer = createRenderer(canvas, world);

let screen = 'title';
let shootCooldown = 0;
let autosaveTimer = 0;

function currentSave() {
  return {
    cash: world.state.cash,
    missionIndex: world.missions.missionIndex,
    packages: world.missions.spots.map((s, i) => (s.found ? i : -1)).filter((i) => i >= 0),
    stats: { carsStolen: 0, fares: 0, arrests: 0 },
    player: { x: world.player.x, z: world.player.z, heading: world.player.heading },
  };
}

function saveGame() {
  save = currentSave();
  if (writeSave(save)) hud.toast('Progress saved');
}

function hudState() {
  const objective = world.missions.objective();
  return {
    time: world.state.time,
    cash: world.state.cash,
    wanted: world.police.state.stars,
    player: world.player,
    playerCar: world.playerCar,
    city: world.city,
    cars: world.vehicles.cars,
    enemies: world.combat.enemies,
    packageSpots: world.missions.spots,
    taxiClient: world.state.taxiClient,
    missionTitle: objective.title,
    missionText: objective.text,
    missionTarget: objective.target,
    interactPrompt: world.state.interactPrompt,
  };
}

function setScreen(name) {
  screen = name;
  world.state.screen = name;
  hud.showScreen(name);
  if (name === 'play') audio.unlock();
}

function startGame(fresh) {
  if (fresh) {
    clearSave();
    save = defaultSave();
  }
  world.reset(seed, save);
  setScreen('play');
  hud.toast(fresh ? 'Welcome to Solmara. Milo is waiting downtown.' : 'Welcome back to Solmara.');
}

const hud = createHud({
  audioUnlock: () => audio.unlock(),
  onNewGame: () => startGame(true),
  onContinue: () => startGame(false),
  onResume: () => setScreen('play'),
  onSave: () => saveGame(),
  onRestart: () => startGame(false),
  onQuitToTitle: () => setScreen('title'),
});

function handleEvents(events) {
  for (const event of events) {
    switch (event.type) {
      case 'shot':
        audio.gunshot();
        renderer.addShake(0.25);
        break;
      case 'enemy-shot':
        audio.enemyShot();
        break;
      case 'crash':
        audio.crash();
        renderer.addShake(0.5);
        break;
      case 'hurt':
        audio.hurt();
        hud.damageFlash();
        break;
      case 'health':
        audio.pickup();
        hud.toast('Health +40');
        break;
      case 'package':
        audio.cash();
        hud.toast(`Package found (${event.data.count}/12) — $150`);
        break;
      case 'fare-done':
        audio.cash();
        hud.toast(`Fare paid: $${event.data.fare}`);
        break;
      case 'mission-done':
        audio.missionDone();
        hud.toast(`Mission complete: ${event.data.title} — $${event.data.reward}`);
        saveGame();
        break;
      case 'mission-start':
        hud.toast(`${event.data.title}: ${event.data.brief}`, 5);
        break;
      case 'story-done':
        setScreen('complete');
        break;
      case 'steal':
        hud.toast(event.data.witnessed ? 'Stolen — the law saw that!' : 'Car taken. Quietly.');
        break;
      case 'hit-ped':
        hud.toast('You hit a pedestrian!');
        break;
      case 'taxi-available':
        hud.toast('A fare is waving you down — pull up close');
        break;
      case 'taxi-pickup':
        audio.pickup();
        break;
      case 'horn':
        audio.horn();
        break;
      case 'reload':
        hud.toast('Reloading…');
        break;
      case 'wasted':
        setScreen('over');
        break;
      case 'busted':
        setScreen('busted');
        break;
      default:
        break;
    }
  }
}

// Title screen: Continue only when a save exists.
const continueButton = document.getElementById('btn-continue');
if (continueButton && save.cash === 0 && save.missionIndex === 0 && save.savedAt === 0) {
  continueButton.style.display = 'none';
}

function runShot(name) {
  stageShot(name, world);
  setScreen('play');
  hud.update(hudState(), 0);
  // Snap the camera onto the staged scene first: the follow camera eases toward its
  // target, and two normal frames would leave it mid-flight inside a building.
  renderer.render(10, null);
  renderer.render(STEP, null);
  window.__shotReady = true;
}

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  let actions = input.takeActions();
  if (input.takeMute()) audio.setMuted(!audio.muted);
  if (screen === 'play' && (actions & ACTION_PAUSE)) {
    setScreen('pause');
  } else if (screen === 'pause' && (actions & ACTION_PAUSE)) {
    setScreen('play');
  }
  if (screen === 'title' && (actions & ACTION_CONFIRM)) {
    startGame(false);
  }
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    accumulator -= STEP;
    steps += 1;
    if (screen === 'play') {
      world.step(STEP, input, actions);
      // Shooting: hold the mouse to fire the pistol, from the camera through the crosshair.
      shootCooldown -= STEP;
      if (input.firing && world.player.onFoot && shootCooldown <= 0) {
        if (world.playerShoot(renderer.getAimRay())) {
          shootCooldown = 0.28;
        } else {
          shootCooldown = 0.1;
        }
      }
      autosaveTimer += STEP;
      if (autosaveTimer > 20) {
        autosaveTimer = 0;
        saveGame();
      }
    } else if (screen === 'title') {
      world.stepAttract(STEP);
    }
    actions = 0;
  }
  if (steps === 5) accumulator = 0;
  handleEvents(world.drainEvents());
  if (screen === 'play') {
    hud.update(hudState(), frameDt);
    const car = world.playerCar;
    audio.setEngine(car ? Math.abs(car.speed) / 42 : 0, !!car);
    audio.setSiren(world.police.state.stars > 0);
  } else {
    audio.setEngine(0, false);
    audio.setSiren(false);
  }
  renderer.render(frameDt, screen === 'play' ? input : null);
}

if (shot) {
  runShot(shot);
} else {
  setScreen('title');
  requestAnimationFrame(frame);
}

window.__game = { world, version: 'solmara-1' };
