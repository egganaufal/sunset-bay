// The world: every system assembled into one simulation. It owns the fixed-step update,
// the enter/exit-car and steal rules, the taxi flagging, ped hits, health regen and the
// event queue the main loop turns into sound and toasts. Rendering stays in render.js.
import * as THREE from 'three';
import { createCity } from './city.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_HORN, ACTION_INTERACT, ACTION_RELOAD } from './input.js';
import { WANTED } from './config.js';

function buildCopMesh() {
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), mat(0x1d2f55));
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xd9a986));
  head.position.y = 1.6;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.1, 10), mat(0x111c33));
  cap.position.y = 1.77;
  group.add(cap);
  const legs = [];
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.21), mat(0x1a2233));
    leg.geometry.translate(0, -0.36, 0);
    leg.position.set(sx, 0.72, 0);
    group.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-0.35, 0.35]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.16), mat(0x1d2f55));
    arm.geometry.translate(0, -0.29, 0);
    arm.position.set(sx, 1.34, 0);
    group.add(arm);
    arms.push(arm);
  }
  group.userData.legs = legs;
  group.userData.arms = arms;
  return group;
}

export function createWorld(seed, save) {
  const group = new THREE.Group();
  const copGroup = new THREE.Group();
  group.add(copGroup);
  let city;
  let vehicles;
  let peds;
  let player;
  let police;
  let combat;
  let missions;
  let random;

  const state = {
    time: 0,
    cash: 0,
    screen: 'title',
    events: [],
    gunshotAt: null,
    taxiClient: null,
    taxiOfferTimer: 0,
    lastDamageAt: -100,
    ended: false,
    interactPrompt: '',
  };

  function emit(type, data) {
    state.events.push({ type, data: data || {} });
  }

  function drainEvents() {
    const out = state.events;
    state.events = [];
    return out;
  }

  function init(seedArg, saveArg) {
    random = createRandom(seedArg);
    city = createCity(random);
    vehicles = createVehicles(city, random);
    peds = createPedestrians(city, random);
    player = createPlayer(city);
    police = createPolice(city, vehicles, random);
    combat = createCombat(city, random);
    missions = createMissions(city, random);
    while (group.children.length > 1) group.remove(group.children[group.children.length - 1]);
    while (copGroup.children.length > 0) copGroup.remove(copGroup.children[0]);
    group.add(city.group, vehicles.group, peds.group, player.mesh, combat.group, missions.group);
    state.time = 0;
    state.cash = saveArg.cash || 0;
    state.ended = false;
    state.gunshotAt = null;
    state.taxiClient = null;
    state.taxiOfferTimer = 0;
    state.lastDamageAt = -100;
    const start = saveArg.player || { x: 0, z: 37, heading: Math.PI / 2 };
    player.state.x = start.x;
    player.state.z = start.z;
    player.state.heading = start.heading || 0;
    player.state.health = 100;
    player.state.ammo = 12;
    player.state.onFoot = true;
    player.state.car = null;
    player.mesh.visible = true;
    vehicles.spawnTraffic(14, { x: start.x, z: start.z });
    vehicles.spawnParked(16, { x: start.x, z: start.z });
    peds.spawn(26, { x: start.x, z: start.z });
    const pickupSpots = [];
    for (let i = 0; i < 6; i += 1) {
      pickupSpots.push(city.randomRoadPoint({ x: (i - 2) * 120, z: (i % 2 ? -120 : 120) }, 90));
    }
    combat.spawnPickups(pickupSpots);
    missions.startMission(saveArg.missionIndex || 0, missionCtx());
    missions.restorePackages(saveArg.packages || []);
    police.setStars(0);
  }

  function missionCtx() {
    return {
      player: player.state,
      get playerCar() { return vehicles.playerCar; },
      interactPressed: false,
      setWanted: (n) => police.setStars(n),
      addCash: (n) => { state.cash += n; },
      emit,
      spawnEnemies: (n, near) => combat.spawnEnemies(n, near),
      aliveEnemies: () => combat.aliveEnemies,
      get time() { return state.time; },
    };
  }

  function addCash(n) {
    state.cash += n;
    emit('cash', { amount: n });
  }

  function damagePlayer(n) {
    const p = player.state;
    if (p.invulnerable > 0 || state.ended) return;
    p.health -= n;
    p.invulnerable = 0.6;
    state.lastDamageAt = state.time;
    emit('hurt', { health: p.health });
    if (p.health <= 0) {
      p.health = 0;
      state.ended = true;
      emit('wasted', {});
    }
  }

  function enterCar(car) {
    car.isPlayer = true;
    car.isTraffic = false;
    car.parked = false;
    player.state.onFoot = false;
    player.state.car = car;
    player.mesh.visible = false;
    const witnessed = police.state.stars > 0
      || peds.peds.some((ped) => Math.hypot(ped.x - car.x, ped.z - car.z) < 25)
      || police.state.cops.some((cop) => {
        const cx = cop.foot ? cop.x : cop.car.x;
        const cz = cop.foot ? cop.z : cop.car.z;
        return Math.hypot(cx - car.x, cz - car.z) < 60;
      });
    if (witnessed) {
      police.addHeat(WANTED.stealHeat);
      emit('steal', { witnessed: true });
    } else {
      emit('steal', { witnessed: false });
    }
  }

  function exitCar() {
    const car = player.state.car;
    if (!car) return;
    car.isPlayer = false;
    car.parked = true;
    car.speed = 0;
    const px = car.x - Math.cos(car.heading) * 2.6;
    const pz = car.z + Math.sin(car.heading) * 2.6;
    player.state.x = px;
    player.state.z = pz;
    player.state.heading = car.heading;
    player.state.onFoot = true;
    player.state.car = null;
    player.mesh.visible = true;
    player.mesh.position.set(px, 0, pz);
  }

  function playerShoot(ray) {
    const p = player.state;
    if (!p.onFoot || p.ammo <= 0 || p.reloadTimer > 0 || state.ended) return false;
    p.ammo -= 1;
    combat.shoot(ray.origin, ray.dir, 90, 'player');
    state.gunshotAt = { x: p.x, z: p.z, at: state.time };
    const seen = police.state.cops.some((cop) => {
      const cx = cop.foot ? cop.x : cop.car.x;
      const cz = cop.foot ? cop.z : cop.car.z;
      return Math.hypot(cx - p.x, cz - p.z) < 70;
    }) || peds.peds.some((ped) => Math.hypot(ped.x - p.x, ped.z - p.z) < 25);
    if (seen) police.addHeat(WANTED.shootHeat);
    emit('shot', {});
    return true;
  }

  function step(dt, input, actions) {
    state.time += dt;
    const p = player.state;
    const playerCar = vehicles.playerCar;
    const interactPressed = !!(actions & ACTION_INTERACT);
    const jumpPressed = !!(actions & ACTION_CONFIRM) && p.onFoot;
    if (actions & ACTION_HORN) emit('horn', {});
    if (actions & ACTION_RELOAD && p.onFoot && p.ammo < 12 && p.reloadTimer <= 0) {
      p.reloadTimer = 1.2;
      emit('reload', {});
    }
    if (p.reloadTimer > 0 && p.reloadTimer - dt <= 0 && p.ammo < 12) {
      p.ammo = 12;
      emit('reload-done', {});
    }

    if (p.onFoot) {
      player.stepOnFoot(dt, input, { jumpPressed });
      if (interactPressed) {
        const car = vehicles.nearestStealable(p.x, p.z, 3.6);
        if (car) enterCar(car);
      }
    } else if (playerCar) {
      if (interactPressed) {
        // A taxi client nearby takes priority over getting out.
        const client = state.taxiClient;
        if (client && Math.hypot(client.x - p.x, client.z - p.z) < 5) {
          if (missions.offerTaxi(client)) {
            peds.removePed(client);
            state.taxiClient = null;
            emit('taxi-pickup', {});
          }
        } else {
          exitCar();
        }
      }
    }

    vehicles.step(dt, { input });
    if (playerCar && playerCar.crashed) emit('crash', { speed: Math.abs(playerCar.speed) });
    // On foot the player moves themselves; in a car they go where the car goes.
    if (playerCar) {
      p.x = playerCar.x;
      p.z = playerCar.z;
      p.heading = playerCar.heading;
    }
    peds.step(dt, { player: p, playerCar, gunshotAt: state.gunshotAt });
    police.step(dt, {
      player: p,
      playerCar,
      time: state.time,
      buildCopMesh: () => {
        const mesh = buildCopMesh();
        copGroup.add(mesh);
        return mesh;
      },
      removeCopMesh: (cop) => copGroup.remove(cop.mesh),
      onRam: (speed) => { if (speed > 10) emit('crash', { speed }); },
      onBusted: () => {
        if (!state.ended) {
          state.ended = true;
          emit('busted', {});
        }
      },
    });
    combat.step(dt, {
      player: p,
      onEnemyShot: () => emit('enemy-shot', {}),
      damagePlayer,
      onPickup: () => {
        p.health = Math.min(100, p.health + 40);
        emit('health', { health: p.health });
      },
    });
    const mctx = missionCtx();
    mctx.interactPressed = interactPressed;
    missions.step(dt, mctx);

    // Taxi flagging: a pedestrian waves the player down while they drive.
    if (!missions.state.taxi && !state.taxiClient && playerCar) {
      state.taxiOfferTimer -= dt;
      if (state.taxiOfferTimer <= 0) {
        state.taxiOfferTimer = 2;
        const near = peds.nearest(p.x, p.z, 26);
        if (near && Math.random() < 0.5) {
          near.taxiClient = true;
          state.taxiClient = near;
          emit('taxi-available', {});
        }
      }
    }
    if (state.taxiClient) {
      const d = Math.hypot(state.taxiClient.x - p.x, state.taxiClient.z - p.z);
      state.interactPrompt = playerCar && d < 5 ? 'E — Pick up fare' : '';
      if (d > 60) {
        state.taxiClient.taxiClient = false;
        state.taxiClient = null;
      }
    } else if (p.onFoot && !playerCar) {
      const car = vehicles.nearestStealable(p.x, p.z, 3.6);
      state.interactPrompt = car ? 'E — Steal car' : '';
    } else {
      state.interactPrompt = '';
    }
    const missionTarget = missions.objective().target;
    if (!state.interactPrompt && missionTarget) {
      const d = Math.hypot(p.x - missionTarget.x, p.z - missionTarget.z);
      const step = missions.objective().step;
      if (step === 'pickup' && d < 4) state.interactPrompt = 'E — Pick up';
    }

    // The player's car running a pedestrian over.
    if (playerCar && Math.abs(playerCar.speed) > 6) {
      for (const ped of [...peds.peds]) {
        if (Math.hypot(ped.x - playerCar.x, ped.z - playerCar.z) < 2.3) {
          peds.removePed(ped);
          police.addHeat(WANTED.hitPedHeat);
          emit('hit-ped', {});
          emit('crash', { speed: Math.abs(playerCar.speed) });
        }
      }
    }
    // Traffic running the player over on foot.
    if (p.onFoot && p.invulnerable <= 0) {
      for (const car of vehicles.cars) {
        if (car.isPlayer || car.parked) continue;
        if (Math.abs(car.speed) > 5 && Math.hypot(car.x - p.x, car.z - p.z) < 2.4) {
          damagePlayer(15);
          p.x += Math.sin(car.heading) * 3;
          p.z += Math.cos(car.heading) * 3;
          break;
        }
      }
    }
    // Health regen after five quiet seconds.
    if (state.time - state.lastDamageAt > 5 && p.health > 0 && p.health < 100) {
      p.health = Math.min(100, p.health + 8 * dt);
    }
    if (state.gunshotAt && state.time - state.gunshotAt.at > 2) state.gunshotAt = null;
  }

  /** Attract mode behind the title screen: traffic and pedestrians move, nobody plays. */
  function stepAttract(dt) {
    state.time += dt;
    vehicles.step(dt, { input: { drive: () => 0, steer: () => 0 } });
    peds.step(dt, { player: player.state, playerCar: null, gunshotAt: null });
    combat.step(dt, {
      player: player.state,
      onEnemyShot: () => {},
      damagePlayer: () => {},
      onPickup: () => {},
    });
  }

  init(seed, save);

  return {
    state, group,
    step, stepAttract, drainEvents, damagePlayer, addCash, playerShoot, enterCar, exitCar,
    reset: (seedArg, saveArg) => init(seedArg, saveArg),
    get city() { return city; },
    get vehicles() { return vehicles; },
    get peds() { return peds; },
    get player() { return player.state; },
    get playerMesh() { return player.mesh; },
    get police() { return police; },
    get combat() { return combat; },
    get missions() { return missions; },
    get playerCar() { return vehicles.playerCar; },
  };
}
