// Missions and side work. A five-mission story chain for Rio Vale, a wheelman for hire in
// Solmara, plus taxi fares and hidden packages. Each mission is a list of steps; the
// manager tracks the current step, paints the beacon over its target and pays out on
// completion. Steps: goto, pickup (press E), driveTo, survive, shootout, deliver.
import * as THREE from 'three';
import { MISSION_REWARDS, PACKAGE_REWARD, TAXI_FARE_BASE } from './config.js';
import { pick, range } from './random.js';

const MISSION_DEFS = [
  {
    title: 'First Fare',
    brief: 'Milo needs a driver. Pick up his client downtown and run them to the Boardwalk.',
    steps: [
      { type: 'goto', text: 'Go to Milo\u2019s Garage, Downtown', place: 'Downtown Solmara' },
      { type: 'pickup', text: 'Pick up the client (E)', place: 'Downtown Solmara' },
      { type: 'driveTo', text: 'Drive the client to the Boardwalk', place: 'Boardwalk' },
    ],
  },
  {
    title: 'The Pickup',
    brief: 'A package is waiting at the Marina. Grab it and bring it to Palm Heights. The cops will not like it.',
    steps: [
      { type: 'goto', text: 'Go to the Marina District', place: 'Marina District' },
      { type: 'pickup', text: 'Grab the package (E)', place: 'Marina District' },
      { type: 'driveTo', text: 'Deliver the package to Palm Heights', place: 'Palm Heights', heatOnArrive: 1 },
    ],
  },
  {
    title: 'Getaway',
    brief: 'The PD is on you. Lose them: stay alive and out of their hands for 45 seconds.',
    steps: [
      { type: 'survive', text: 'Lose the cops — survive 45 seconds', seconds: 45, heat: 2 },
    ],
  },
  {
    title: 'The Exchange',
    brief: 'The Vipers want Milo\u2019s turf. Meet them in Old Town and settle it.',
    steps: [
      { type: 'goto', text: 'Go to the meet in Old Town', place: 'Old Town' },
      { type: 'shootout', text: 'Take down the Vipers', count: 4 },
      { type: 'pickup', text: 'Take the case (E)', place: 'Old Town' },
      { type: 'driveTo', text: 'Bring the case to Downtown', place: 'Downtown Solmara' },
    ],
  },
  {
    title: 'King of Solmara',
    brief: 'One last run: the airport drop, a Viper ambush, and the Boardwalk finish. Do this and the city is yours.',
    steps: [
      { type: 'driveTo', text: 'Drive to Solmara Airport', place: 'Solmara Airport' },
      { type: 'shootout', text: 'Survive the ambush', count: 6 },
      { type: 'driveTo', text: 'Deliver the goods to the Boardwalk', place: 'Boardwalk', heat: 3 },
    ],
  },
];

export function createMissions(city, random) {
  const group = new THREE.Group();
  const state = {
    index: 0,
    stepIndex: 0,
    stepState: {},
    target: null,
    objectiveText: '',
    done: false,
    taxi: null, // {client, dest, fare}
    packagesFound: 0,
  };
  const packageSpots = [];
  const packageMeshes = [];
  for (let i = 0; i < 12; i += 1) {
    const p = city.randomRoadPoint({ x: 0, z: 0 }, 400);
    packageSpots.push({ x: p.x + range(random, -20, 20), z: p.z + range(random, -20, 20), found: false });
  }
  for (const spot of packageSpots) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0xaa7d00, emissiveIntensity: 0.8 }),
    );
    mesh.position.set(spot.x, 0.4, spot.z);
    group.add(mesh);
    packageMeshes.push(mesh);
  }

  // The objective beacon: a light column and a floating diamond over the target.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 20;
  beacon.add(column);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xf2c230 }),
  );
  diamond.position.y = 6;
  beacon.add(diamond);
  beacon.visible = false;
  group.add(beacon);

  function placeFor(name) {
    const district = city.districts.find((d) => d.name === name) || city.districts[0];
    return { x: district.x + range(random, -12, 12), z: district.z + range(random, -12, 12) };
  }

  function currentStep() {
    if (state.done) return null;
    const mission = MISSION_DEFS[state.index];
    return mission ? mission.steps[state.stepIndex] : null;
  }

  function beginStep(ctx) {
    const step = currentStep();
    state.stepState = {};
    if (!step) return;
    if (step.type === 'goto' || step.type === 'pickup' || step.type === 'driveTo') {
      state.target = placeFor(step.place);
    } else if (step.type === 'survive') {
      state.stepState.timer = step.seconds;
      ctx.setWanted(step.heat || 2);
      state.target = null;
    } else if (step.type === 'shootout') {
      state.stepState.spawned = false;
      state.target = { x: ctx.player.x + 10, z: ctx.player.z + 10 };
    }
    state.objectiveText = step.text;
  }

  function startMission(index, ctx) {
    state.index = index;
    state.stepIndex = 0;
    state.done = false;
    beginStep(ctx);
  }

  function advanceStep(ctx) {
    state.stepIndex += 1;
    const mission = MISSION_DEFS[state.index];
    if (state.stepIndex >= mission.steps.length) {
      const reward = MISSION_REWARDS[state.index] || 500;
      ctx.addCash(reward);
      ctx.emit('mission-done', { title: mission.title, reward });
      state.index += 1;
      state.stepIndex = 0;
      if (state.index >= MISSION_DEFS.length) {
        state.done = true;
        state.objectiveText = 'Solmara is yours. Free roam — fares and packages still pay.';
        state.target = null;
        ctx.emit('story-done', {});
        return;
      }
      ctx.emit('mission-start', { title: MISSION_DEFS[state.index].title, brief: MISSION_DEFS[state.index].brief });
    }
    beginStep(ctx);
  }

  function step(dt, ctx) {
    const step = currentStep();
    if (step) {
      if (step.type === 'goto' || step.type === 'driveTo') {
        const dist = Math.hypot(ctx.player.x - state.target.x, ctx.player.z - state.target.z);
        if (dist < 6) {
          if (step.heatOnArrive) ctx.setWanted(step.heatOnArrive);
          advanceStep(ctx);
        }
      } else if (step.type === 'pickup') {
        const dist = Math.hypot(ctx.player.x - state.target.x, ctx.player.z - state.target.z);
        if (dist < 4 && ctx.interactPressed) advanceStep(ctx);
      } else if (step.type === 'survive') {
        state.stepState.timer -= dt;
        if (state.stepState.timer <= 0) {
          ctx.setWanted(0);
          advanceStep(ctx);
        }
      } else if (step.type === 'shootout') {
        if (!state.stepState.spawned) {
          state.stepState.spawned = true;
          ctx.spawnEnemies(step.count, ctx.player);
        }
        if (ctx.aliveEnemies() === 0) advanceStep(ctx);
      }
    }
    // Taxi side job: a flagged pedestrian waves the player down.
    if (state.taxi) {
      const taxi = state.taxi;
      if (!taxi.pickedUp) {
        const dist = Math.hypot(ctx.player.x - taxi.client.x, ctx.player.z - taxi.client.z);
        if (dist < 4 && ctx.interactPressed && ctx.playerCar) {
          taxi.pickedUp = true;
          state.target = taxi.dest;
          state.objectiveText = `Take the fare to ${taxi.destName}`;
          ctx.emit('toast', { text: `Fare to ${taxi.destName} — drive!` });
        }
      } else {
        const dist = Math.hypot(ctx.player.x - taxi.dest.x, ctx.player.z - taxi.dest.z);
        if (dist < 7) {
          const fare = taxi.fare;
          ctx.addCash(fare);
          ctx.emit('fare-done', { fare });
          state.taxi = null;
          // Point the beacon back at the mission step, not the finished fare.
          const stepNow = currentStep();
          state.target = stepNow && stepNow.place ? placeFor(stepNow.place) : null;
          state.objectiveText = stepNow ? stepNow.text : '';
        }
      }
    }
    // Packages.
    for (let i = 0; i < packageSpots.length; i += 1) {
      const spot = packageSpots[i];
      if (spot.found) continue;
      if (Math.hypot(ctx.player.x - spot.x, ctx.player.z - spot.z) < 2.6) {
        spot.found = true;
        packageMeshes[i].visible = false;
        state.packagesFound += 1;
        ctx.addCash(PACKAGE_REWARD);
        ctx.emit('package', { count: state.packagesFound });
      }
    }
    // Beacon follows the current target (mission or taxi).
    const target = state.taxi && state.taxi.pickedUp ? state.taxi.dest : state.target;
    if (target && step) {
      beacon.visible = true;
      beacon.position.set(target.x, 0, target.z);
      diamond.rotation.y += dt * 2;
      diamond.position.y = 6 + Math.sin(ctx.time * 2.4) * 0.5;
    } else {
      beacon.visible = false;
    }
    for (let i = 0; i < packageMeshes.length; i += 1) {
      if (!packageSpots[i].found) {
        packageMeshes[i].rotation.y += dt;
        packageMeshes[i].position.y = 0.4 + Math.sin(ctx.time * 2 + i) * 0.12;
      }
    }
  }

  function offerTaxi(client) {
    if (state.taxi) return false;
    const destDistrict = pick(random, city.districts);
    state.taxi = {
      client,
      dest: { x: destDistrict.x + range(random, -10, 10), z: destDistrict.z + range(random, -10, 10) },
      destName: destDistrict.name,
      fare: TAXI_FARE_BASE + Math.floor(random() * 120),
      pickedUp: false,
    };
    return true;
  }

  function setStep(index, ctx) {
    state.stepIndex = index;
    beginStep(ctx);
  }

  function objective() {
    const step = currentStep();
    const target = state.taxi && state.taxi.pickedUp ? state.taxi.dest : state.target;
    return {
      title: state.done ? 'Free roam' : MISSION_DEFS[state.index].title,
      text: state.objectiveText,
      target,
      step: step ? step.type : null,
    };
  }

  return {
    group, state, step, startMission, setStep, offerTaxi, objective,
    spots: packageSpots,
    get missionIndex() { return state.index; },
    get packagesFound() { return state.packagesFound; },
    restorePackages(foundIndices) {
      foundIndices.forEach((i) => {
        if (packageSpots[i]) {
          packageSpots[i].found = true;
          packageMeshes[i].visible = false;
          state.packagesFound += 1;
        }
      });
    },
  };
}
