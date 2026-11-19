// The screenshot scenes behind ?shot=chase|drive|street|mission. Each one resets the
// world to a fixed seed, stages a real situation (a police chase, a beach drive, a walk
// downtown, a shootout), plays it forward with scripted inputs, and leaves the frame the
// way a short game really looks — so the same seed always gives the same frame.
import { defaultSave } from './save.js';

const STEP = 1 / 60;

function scriptedInput(drive, steer) {
  return {
    drive: () => drive,
    steer: () => steer,
    running: () => false,
    firing: false,
    aiming: false,
    takeMouseDelta: () => ({ x: 0, y: 0 }),
    takeWheel: () => 0,
    takeActions: () => 0,
    takeMute: () => false,
  };
}

function simulate(world, seconds, input) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, input, 0);
}

function placePlayerInCar(world, kind, x, z, heading) {
  const car = world.vehicles.addCar(kind, x, z, heading, {});
  world.enterCar(car);
  car.speed = 0;
  return car;
}

/** Stage `name` and return the screen to draw. Any other name stages the street scene. */
export function stageShot(name, world) {
  world.reset(1, defaultSave());
  const p = world.player;
  const input = scriptedInput(1, 0);
  if (name === 'chase') {
    // Wanted 3, two PD units on the tail, mission objective live: the cover shot.
    const car = placePlayerInCar(world, 'sports', -37, -140, 0);
    car.speed = 30;
    // Clear the chase corridor so the run is not stopped by parked cars or pedestrians.
    for (const other of [...world.vehicles.cars]) {
      if (other !== car && Math.abs(other.x + 37) < 9 && other.z > -200 && other.z < 60) {
        world.vehicles.removeCar(other);
      }
    }
    for (const ped of [...world.peds.peds]) {
      if (Math.abs(ped.x + 37) < 8 && ped.z > -200 && ped.z < 60) {
        world.peds.removePed(ped);
      }
    }
    world.police.setStars(3);
    const cop1 = world.police.spawnCopCar(p);
    cop1.x = -41;
    cop1.z = -168;
    cop1.heading = 0;
    cop1.speed = 30;
    const cop2 = world.police.spawnCopCar(p);
    cop2.x = -33;
    cop2.z = -176;
    cop2.heading = 0;
    cop2.speed = 28;
    world.missions.setStep(2, {
      player: p,
      get playerCar() { return world.playerCar; },
      interactPressed: false,
      setWanted: (n) => world.police.setStars(n),
      addCash: () => {},
      emit: () => {},
      spawnEnemies: () => [],
      aliveEnemies: () => 0,
      get time() { return world.state.time; },
    });
    p.cameraYaw = Math.PI;
    p.cameraPitch = 0.22;
    p.cameraDist = 11;
    simulate(world, 2.6, input);
    // One PD unit ahead as a roadblock, so the chase reads from the cover frame.
    cop2.x = -31;
    cop2.z = -8;
    cop2.heading = Math.PI;
    cop2.speed = 0;
    cop2.mesh.position.set(cop2.x, 0, cop2.z);
    cop2.mesh.rotation.y = cop2.heading;
    return { screen: 'play' };
  }
  if (name === 'drive') {
    // A cruise down the Boardwalk road, traffic around, ocean on the left. The street is
    // cleared of pedestrians for a clean cruise (respawns would wander back onto the road).
    const car = placePlayerInCar(world, 'sedan', 0, 333, Math.PI / 2);
    car.speed = 20;
    for (const ped of [...world.peds.peds]) {
      world.peds.removePed(ped);
    }
    p.cameraYaw = Math.PI / 2 + Math.PI;
    p.cameraPitch = 0.24;
    p.cameraDist = 11;
    simulate(world, 2.2, input);
    return { screen: 'play' };
  }
  if (name === 'mission') {
    // The Old Town ambush: four Vipers up the road, the player aiming down the street.
    // The HUD objective reads the real shootout step from mission 4, "The Exchange".
    const missionCtx = {
      player: p,
      get playerCar() { return world.playerCar; },
      interactPressed: false,
      setWanted: (n) => world.police.setStars(n),
      addCash: () => {},
      emit: () => {},
      spawnEnemies: () => [],
      aliveEnemies: () => world.combat.enemies.length,
      get time() { return world.state.time; },
    };
    world.missions.startMission(3, missionCtx);
    world.missions.setStep(1, missionCtx);
    world.missions.state.stepState.spawned = true;
    p.x = -259;
    p.z = -240;
    p.heading = 0;
    p.cameraYaw = Math.PI;
    p.cameraPitch = 0.18;
    p.cameraDist = 7;
    const enemies = world.combat.spawnEnemies(4, p);
    const spots = [[-259, -218], [-255, -212], [-263, -208], [-259, -200]];
    enemies.forEach((enemy, i) => {
      enemy.x = spots[i][0];
      enemy.z = spots[i][1];
      enemy.mesh.position.set(enemy.x, 0, enemy.z);
    });
    p.aiming = true;
    const ray = {
      origin: { x: p.x, y: 1.5, z: p.z },
      dir: { x: Math.sin(p.heading), y: -0.02, z: Math.cos(p.heading) },
    };
    world.playerShoot(ray);
    simulate(world, 0.9, scriptedInput(0, 0));
    return { screen: 'play' };
  }
  // street: on foot in the Marina, looking south down the avenue toward the water,
  // pedestrians, parked cars and a passing taxi for life.
  p.x = -259;
  p.z = 185;
  p.heading = 0;
  p.cameraYaw = Math.PI;
  p.cameraPitch = 0.28;
  p.cameraDist = 9;
  world.vehicles.addCar('sedan', -262, 220, 0, { parked: true });
  world.vehicles.addCar('taxi', -256, 250, Math.PI, { parked: true });
  world.vehicles.spawnTraffic(3, { x: -259, z: 185 });
  simulate(world, 1.2, scriptedInput(0, 0));
  return { screen: 'play' };
}
