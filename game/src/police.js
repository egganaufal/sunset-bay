// The wanted level and the Solmara PD. Stars rise with crime and fall with quiet time;
// police cars and foot cops spawn near the player, chase, ram, and bust the player on foot
// if they hold them long enough. Out of sight long enough, the heat fades.
import { WANTED } from './config.js';

export function createPolice(city, vehicles, random) {
  const state = {
    stars: 0,
    quietTimer: 0,
    bustedTimer: 0,
    cops: [], // {car} or {x, z, heading, speed, mesh}
  };

  function desiredCopCars() {
    return state.stars === 0 ? 0 : Math.min(3, 1 + Math.floor(state.stars / 2));
  }

  function desiredFootCops() {
    return state.stars === 0 ? 0 : Math.min(4, state.stars);
  }

  function spawnCopCar(near) {
    const p = city.randomRoadPoint(near, 160);
    const car = vehicles.addCar('police', p.x, p.z, 0, {});
    car.isPolice = true;
    state.cops.push({ car, foot: false });
    return car;
  }

  function spawnFootCop(near) {
    const p = city.randomRoadPoint(near, 120);
    const cop = { foot: true, x: p.x, z: p.z, heading: 0, speed: 6.2, mesh: null };
    state.cops.push(cop);
    return cop;
  }

  function setStars(n) {
    state.stars = Math.max(0, Math.min(WANTED.maxStars, n));
    state.quietTimer = 0;
    if (state.stars === 0) state.bustedTimer = 0;
  }

  function addHeat(n) {
    if (state.stars < WANTED.maxStars) state.stars += 1;
    if (n > 1) state.stars = Math.min(WANTED.maxStars, state.stars + (n - 1));
    state.quietTimer = 0;
  }

  function step(dt, ctx) {
    const player = ctx.player;
    // Quiet time decays one star at a time.
    if (state.stars > 0) {
      state.quietTimer += dt;
      if (state.quietTimer >= WANTED.decaySeconds) {
        state.stars -= 1;
        state.quietTimer = 0;
      }
    }
    // Keep the right number of cops on the street.
    const copCars = state.cops.filter((c) => !c.foot);
    const footCops = state.cops.filter((c) => c.foot);
    if (copCars.length < desiredCopCars()) spawnCopCar(player);
    if (footCops.length < desiredFootCops()) {
      const cop = spawnFootCop(player);
      cop.mesh = ctx.buildCopMesh();
    }
    if (state.stars === 0) {
      // Heat gone: cops leave. Foot cops walk away, cars drive off and despawn.
      for (const cop of [...state.cops]) {
        if (cop.foot) {
          ctx.removeCopMesh(cop);
          state.cops.splice(state.cops.indexOf(cop), 1);
        } else {
          vehicles.removeCar(cop.car);
          state.cops.splice(state.cops.indexOf(cop), 1);
        }
      }
      return;
    }
    const playerCar = ctx.playerCar;
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    for (const cop of state.cops) {
      if (!cop.foot) {
        // Chase: steer toward the player, faster than traffic, ramming on contact.
        const car = cop.car;
        const dx = px - car.x;
        const dz = pz - car.z;
        const dist = Math.hypot(dx, dz);
        const wantHeading = Math.atan2(dx, dz);
        let diff = wantHeading - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-1, Math.min(1, diff * 2.5));
        car.steer += (turn * 0.55 - car.steer) * Math.min(1, 8 * dt);
        const wantSpeed = Math.min(46, 24 + state.stars * 3);
        car.speed += Math.max(-14 * dt, Math.min(14 * dt, wantSpeed - car.speed));
        car.heading += (car.speed / 2.9) * Math.tan(car.steer) * dt;
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        if (dist < 4.6 && playerCar) {
          // Ram: shove the player's car and slow it.
          playerCar.speed *= 0.92;
          playerCar.x += (dx / (dist || 1)) * -0.4;
          playerCar.z += (dz / (dist || 1)) * -0.4;
          ctx.onRam(Math.abs(car.speed));
        }
        if (dist > 320) {
          const p = city.randomRoadPoint(player, 150);
          car.x = p.x;
          car.z = p.z;
        }
      } else {
        // Foot cop runs the player down.
        const dx = player.x - cop.x;
        const dz = player.z - cop.z;
        const dist = Math.hypot(dx, dz);
        if (playerCar) {
          // The player is driving: cops give up the chase on foot and hold position.
          cop.mesh.position.set(cop.x, 0, cop.z);
          continue;
        }
        const wantHeading = Math.atan2(dx, dz);
        let diff = wantHeading - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cop.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
        cop.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.z += Math.cos(cop.heading) * cop.speed * dt;
        const hit = city.collides(cop.x, cop.z, 0.5);
        if (hit) {
          cop.x -= Math.sin(cop.heading) * 1.2;
          cop.z -= Math.cos(cop.heading) * 1.2;
          cop.heading += Math.PI / 2;
        }
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.y = cop.heading;
        const swing = Math.sin(ctx.time * 12) * 0.6;
        cop.mesh.userData.legs[0].rotation.x = swing;
        cop.mesh.userData.legs[1].rotation.x = -swing;
        if (dist < 1.4) {
          state.bustedTimer += dt;
          if (state.bustedTimer >= WANTED.bustedSeconds) ctx.onBusted();
        } else {
          state.bustedTimer = Math.max(0, state.bustedTimer - dt);
        }
      }
    }
  }

  return { state, setStars, addHeat, step, spawnCopCar };
}
