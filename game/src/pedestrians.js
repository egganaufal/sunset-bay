// Pedestrians: the city's foot traffic. They stroll the sidewalks, cross at corners, and
// run from gunshots and speeding cars. Each is one small box-built figure with swinging
// limbs; the module keeps them near the player and recycles them as the player moves.
import * as THREE from 'three';
import { pick, range } from './random.js';

const SHIRT_COLORS = [0xd95f4b, 0x4b7dd9, 0x58a05c, 0xd9b84b, 0x9e6bb5, 0xe8e8e8, 0x333333, 0xdd7fa8];

function buildPedMesh(shirtColor) {
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), mat(shirtColor));
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(0xd9a986));
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);
  const legs = [];
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), mat(0x2b3240));
    leg.position.set(sx, 0.35, 0);
    leg.geometry.translate(0, -0.35, 0);
    leg.position.y = 0.7;
    group.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-0.32, 0.32]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.15), mat(shirtColor));
    arm.position.set(sx, 1.3, 0);
    arm.geometry.translate(0, -0.27, 0);
    arm.position.y = 1.3;
    group.add(arm);
    arms.push(arm);
  }
  group.userData.legs = legs;
  group.userData.arms = arms;
  return group;
}

export function createPedestrians(city, random) {
  const group = new THREE.Group();
  const peds = [];
  let nextId = 1;

  function sidewalkPoint(near, maxDist) {
    for (let tries = 0; tries < 20; tries += 1) {
      const blockX = Math.floor(random() * 9) - 4;
      const blockZ = Math.floor(random() * 9) - 4;
      const cx = blockX * 74;
      const cz = blockZ * 74;
      const x = cx + range(random, -32, 32);
      const z = cz + (random() < 0.5 ? -31.5 : 31.5);
      if (Math.hypot(x - near.x, z - near.z) <= maxDist) return { x, z };
    }
    return { x: near.x + 20, z: near.z };
  }

  function addPed(x, z) {
    const mesh = buildPedMesh(pick(random, SHIRT_COLORS));
    mesh.position.set(x, 0, z);
    group.add(mesh);
    const ped = {
      id: nextId, x, z, heading: range(random, 0, Math.PI * 2), speed: range(random, 1.1, 1.9),
      target: sidewalkPoint({ x, z }, 120), walkPhase: random() * 10, fleeing: false,
      fleeTimer: 0, mesh, taxiClient: false,
    };
    nextId += 1;
    peds.push(ped);
    return ped;
  }

  function spawn(count, near) {
    for (let i = 0; i < count; i += 1) {
      const p = sidewalkPoint(near, 160);
      addPed(p.x, p.z);
    }
  }

  function step(dt, ctx) {
    const player = ctx.player;
    for (const ped of peds) {
      // Flee from gunshots and from a fast car bearing down.
      let threat = null;
      if (ctx.gunshotAt && Math.hypot(ped.x - ctx.gunshotAt.x, ped.z - ctx.gunshotAt.z) < 30) {
        threat = ctx.gunshotAt;
      }
      const playerCar = ctx.playerCar;
      if (playerCar && Math.abs(playerCar.speed) > 8) {
        const d = Math.hypot(ped.x - playerCar.x, ped.z - playerCar.z);
        if (d < 12) threat = playerCar;
      }
      if (threat) {
        ped.fleeing = true;
        ped.fleeTimer = 2;
        ped.target = {
          x: ped.x + (ped.x - threat.x) * 2,
          z: ped.z + (ped.z - threat.z) * 2,
        };
      } else if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) ped.fleeing = false;
      }
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        ped.target = sidewalkPoint({ x: ped.x, z: ped.z }, 120);
      } else {
        const wantHeading = Math.atan2(dx, dz);
        let diff = wantHeading - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        const speed = ped.fleeing ? 5.2 : ped.speed;
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        ped.walkPhase += dt * speed * 3.2;
      }
      // Keep out of buildings.
      const hit = city.collides(ped.x, ped.z, 0.5);
      if (hit) {
        ped.x -= Math.sin(ped.heading) * 1.2;
        ped.z -= Math.cos(ped.heading) * 1.2;
        ped.heading += Math.PI / 2;
        ped.target = sidewalkPoint({ x: ped.x, z: ped.z }, 120);
      }
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.walkPhase) * 0.55;
      ped.mesh.userData.legs[0].rotation.x = swing;
      ped.mesh.userData.legs[1].rotation.x = -swing;
      ped.mesh.userData.arms[0].rotation.x = -swing * 0.7;
      ped.mesh.userData.arms[1].rotation.x = swing * 0.7;
    }
    // Recycle: peds far from the player respawn near them.
    for (const ped of peds) {
      if (Math.hypot(ped.x - player.x, ped.z - player.z) > 260) {
        const p = sidewalkPoint(player, 140);
        ped.x = p.x;
        ped.z = p.z;
        ped.target = sidewalkPoint(player, 140);
        ped.fleeing = false;
      }
    }
  }

  function nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of peds) {
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  function removePed(ped) {
    const index = peds.indexOf(ped);
    if (index >= 0) peds.splice(index, 1);
    group.remove(ped.mesh);
  }

  return { group, peds, spawn, step, nearest, removePed, addPed };
}
