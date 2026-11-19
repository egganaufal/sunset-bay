// Cars: their meshes, arcade driving physics and traffic. Every car is one box-built mesh
// (body, cabin, four spinning wheels, lights); traffic follows the road graph and keeps
// right, parked cars wait to be stolen, and the player's car answers the keyboard.
import * as THREE from 'three';
import { CAR } from './config.js';
import { pick, range, rangeInt } from './random.js';

const CAR_COLORS = [0xc0392b, 0x2e6fb7, 0xe8e8e8, 0x2b2b2b, 0x7a4a9e, 0x3a7d5d, 0xd8a13a, 0x8899aa];
const TAXI_COLOR = 0xf2c230;
const POLICE_COLORS = { body: 0x1a1d22, door: 0xe8e8e8 };

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** One box-built car, front at +z. Wheels spin and steer; lights glow. */
export function buildCarMesh(kind, color) {
  const group = new THREE.Group();
  const bodyColor = kind === 'taxi' ? TAXI_COLOR : kind === 'police' ? POLICE_COLORS.body : color;
  const body = box(1.9, 0.55, 4.2, bodyColor, 0, 0.55, 0);
  group.add(body);
  const cabin = box(1.6, 0.5, 2.1, kind === 'truck' ? bodyColor : 0x1c2733, 0, 1.05, -0.2);
  group.add(cabin);
  if (kind === 'truck') {
    const bed = box(1.8, 0.35, 1.6, 0x6b6f75, 0, 0.95, -1.3);
    group.add(bed);
  }
  if (kind === 'taxi') {
    const sign = box(0.7, 0.18, 0.3, 0xf2c230, 0, 1.45, -0.2);
    sign.material = new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0xaa7d00, emissiveIntensity: 0.7 });
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = box(1.1, 0.16, 0.4, 0x223344, 0, 1.42, -0.2);
    group.add(bar);
    const red = box(0.45, 0.18, 0.42, 0xff2222, -0.28, 1.42, -0.2);
    red.material = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 });
    const blue = box(0.45, 0.18, 0.42, 0x2244ff, 0.28, 1.42, -0.2);
    blue.material = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 });
    group.add(red);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  for (const sx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    head.position.set(sx, 0.62, 2.12);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.18, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xaa0000, emissiveIntensity: 0.8 }),
    );
    tail.position.set(sx, 0.62, -2.12);
    group.add(tail);
  }
  const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x16181c });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  return group;
}

export function createVehicles(city, random) {
  const group = new THREE.Group();
  const cars = [];
  let nextId = 1;

  function addCar(kind, x, z, heading, opts = {}) {
    const color = kind === 'police' ? 0 : pick(random, CAR_COLORS);
    const mesh = buildCarMesh(kind, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    group.add(mesh);
    const car = {
      id: nextId, kind, color, x, z, heading, speed: 0, steer: 0,
      mesh, isPlayer: false, isPolice: kind === 'police', isTraffic: !!opts.traffic,
      parked: !!opts.parked, target: null, targetSpeed: range(random, 9, 14),
      route: [], routeIndex: 0, respawnTimer: 0, sirenPhase: random() * 10,
    };
    nextId += 1;
    cars.push(car);
    return car;
  }

  function nearestIntersection(x, z) {
    let best = city.intersections[0];
    let bestD = Infinity;
    for (const p of city.intersections) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function planRoute(car) {
    const start = nearestIntersection(car.x, car.z);
    const route = [start];
    let current = start;
    for (let i = 0; i < 6; i += 1) {
      const neighbours = city.intersections.filter((p) => {
        const dx = Math.abs(p.x - current.x);
        const dz = Math.abs(p.z - current.z);
        return (dx === 74 && dz === 0) || (dx === 0 && dz === 74);
      });
      current = pick(random, neighbours.length ? neighbours : city.intersections);
      route.push(current);
    }
    car.route = route;
    car.routeIndex = 1;
  }

  function spawnTraffic(count, near) {
    for (let i = 0; i < count; i += 1) {
      const p = city.randomRoadPoint(near, 180);
      const kind = pick(random, ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'van']);
      const car = addCar(kind, p.x + range(random, -4, 4), p.z + range(random, -4, 4), range(random, 0, Math.PI * 2), { traffic: true });
      planRoute(car);
    }
  }

  function spawnParked(count, near) {
    for (let i = 0; i < count; i += 1) {
      const p = city.randomRoadPoint(near, 200);
      const alongX = random() < 0.5;
      const kind = pick(random, ['sedan', 'sedan', 'sports', 'taxi']);
      const x = p.x + (alongX ? range(random, -30, 30) : (random() < 0.5 ? -5.4 : 5.4));
      const z = p.z + (alongX ? (random() < 0.5 ? -5.4 : 5.4) : range(random, -30, 30));
      const heading = alongX ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      addCar(kind, x, z, heading, { parked: true });
    }
  }

  function collideBuildings(car) {
    const hit = city.collides(car.x, car.z, CAR.radius);
    if (!hit) return false;
    const pushLeft = car.x + CAR.radius - hit.minX;
    const pushRight = hit.maxX - (car.x - CAR.radius);
    const pushUp = car.z + CAR.radius - hit.minZ;
    const pushDown = hit.maxZ - (car.z - CAR.radius);
    const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
    if (min === pushLeft) car.x = hit.minX - CAR.radius;
    else if (min === pushRight) car.x = hit.maxX + CAR.radius;
    else if (min === pushUp) car.z = hit.minZ - CAR.radius;
    else car.z = hit.maxZ + CAR.radius;
    return true;
  }

  function stepPlayerCar(car, dt, input) {
    const drive = input.drive();
    const steerInput = input.steer();
    if (drive > 0) car.speed += CAR.accel * drive * dt;
    else if (drive < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    }
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steerTarget = steerInput * CAR.steerAngle * Math.min(1, Math.abs(car.speed) / 8 + 0.25);
    car.steer += (steerTarget - car.steer) * Math.min(1, 10 * dt);
    car.heading += (car.speed / 2.9) * Math.tan(car.steer) * dt;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (!city.isInCity(car.x, car.z)) {
      car.x = Math.max(-360, Math.min(360, car.x));
      car.z = Math.max(-360, Math.min(360, car.z));
      car.speed *= 0.5;
    }
    if (collideBuildings(car)) {
      if (Math.abs(car.speed) > 12) car.crashed = true;
      car.speed *= 0.4;
    }
  }

  function stepTrafficCar(car, dt) {
    if (!car.route || car.routeIndex >= car.route.length) planRoute(car);
    const target = car.route[car.routeIndex];
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) {
      car.routeIndex += 1;
      return;
    }
    // Keep right: aim for a point offset to the right of the travel direction.
    const headingTo = Math.atan2(dx, dz);
    const rightX = -Math.cos(headingTo);
    const rightZ = Math.sin(headingTo);
    const aimX = target.x + rightX * 3.2;
    const aimZ = target.z + rightZ * 3.2;
    const wantHeading = Math.atan2(aimX - car.x, aimZ - car.z);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-1, Math.min(1, diff * 2.2));
    car.steer += (turn * 0.5 - car.steer) * Math.min(1, 8 * dt);
    const wantSpeed = Math.abs(diff) > 0.6 ? 5 : car.targetSpeed;
    car.speed += Math.max(-8 * dt, Math.min(8 * dt, wantSpeed - car.speed));
    car.heading += (car.speed / 2.9) * Math.tan(car.steer) * dt;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    collideBuildings(car);
  }

  function step(dt, ctx) {
    for (const car of cars) {
      car.crashed = false;
      if (car.isPlayer) stepPlayerCar(car, dt, ctx.input);
      else if (car.isTraffic) stepTrafficCar(car, dt);
      // Car-car push apart.
      for (const other of cars) {
        if (other === car || other.id < car.id) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.01 && dist < 4.4) {
          const push = (4.4 - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;
          car.x -= nx * push;
          car.z -= nz * push;
          other.x += nx * push;
          other.z += nz * push;
          const faster = Math.abs(car.speed) >= Math.abs(other.speed) ? car : other;
          const slower = faster === car ? other : car;
          const wasFast = Math.abs(faster.speed);
          if (wasFast > 8) {
            // A fast car shoves the slower one aside instead of both stopping dead:
            // the faster keeps just over half its speed, the slower is thrown forward
            // and sideways, off the road line. Parked cars move by position, since
            // nothing else drives them.
            faster.speed *= 0.55;
            const side = slower.id % 2 === 0 ? 1 : -1;
            const shoveX = Math.sin(faster.heading) * 2.2 + -nz * 1.4 * side;
            const shoveZ = Math.cos(faster.heading) * 2.2 + nx * 1.4 * side;
            if (slower.parked) {
              slower.x += shoveX;
              slower.z += shoveZ;
              slower.speed = 0;
            } else {
              slower.speed = Math.sign(faster.speed || 1) * wasFast * 0.7;
              slower.x += -nz * 1.4 * side;
              slower.z += nx * 1.4 * side;
            }
            car.crashed = true;
            other.crashed = true;
          } else {
            const avg = (car.speed + other.speed) / 2;
            car.speed = avg * 0.7;
            other.speed = avg * 0.7;
          }
        }
      }
      // Sync the mesh.
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = car.speed * dt * 2.8;
      for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
      if (car.mesh.userData.wheels[0]) {
        car.mesh.userData.wheels[0].rotation.y = car.steer * 0.9;
        car.mesh.userData.wheels[1].rotation.y = car.steer * 0.9;
      }
      if (car.isPolice) {
        car.sirenPhase += dt * 6;
        const on = Math.sin(car.sirenPhase) > 0;
        if (car.mesh.userData.lightRed) {
          car.mesh.userData.lightRed.material.emissiveIntensity = on ? 1.6 : 0.15;
          car.mesh.userData.lightBlue.material.emissiveIntensity = on ? 0.15 : 1.6;
        }
      }
    }
  }

  function nearestStealable(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.isPlayer || car.isPolice) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function removeCar(car) {
    const index = cars.indexOf(car);
    if (index >= 0) cars.splice(index, 1);
    group.remove(car.mesh);
  }

  return {
    group, cars, addCar, spawnTraffic, spawnParked, step, nearestStealable, removeCar,
    get playerCar() { return cars.find((c) => c.isPlayer) || null; },
    get trafficCount() { return cars.filter((c) => c.isTraffic).length; },
  };
}
