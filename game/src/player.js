// The player on foot: a box-built figure with a walk cycle, WASD movement relative to the
// camera, running, jumping, and the third-person orbit camera that follows them.
import * as THREE from 'three';
import { PLAYER } from './config.js';

function buildPlayerMesh() {
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), mat(0x2e6f8e));
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.34), mat(0x1d4a5e));
  jacket.position.y = 1.32;
  group.add(jacket);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xd9a986));
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.09, 10), mat(0xd95f4b));
  cap.position.y = 1.76;
  group.add(cap);
  const legs = [];
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.21), mat(0x2b3240));
    leg.geometry.translate(0, -0.36, 0);
    leg.position.set(sx, 0.72, 0);
    group.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-0.35, 0.35]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.16), mat(0x2e6f8e));
    arm.geometry.translate(0, -0.29, 0);
    arm.position.set(sx, 1.34, 0);
    group.add(arm);
    arms.push(arm);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), mat(0x1a1a1a));
  gun.position.set(0.35, 1.02, 0.2);
  group.add(gun);
  group.userData.legs = legs;
  group.userData.arms = arms;
  group.userData.gun = gun;
  return group;
}

export function createPlayer(city) {
  const mesh = buildPlayerMesh();
  const state = {
    x: 0, z: 37, y: 0, vy: 0, heading: 0, speed: 0,
    onFoot: true, car: null, health: PLAYER.maxHealth, ammo: 12,
    cameraYaw: Math.PI * 1.5, cameraPitch: 0.32, cameraDist: 9,
    walkPhase: 0, aiming: false, reloadTimer: 0, invulnerable: 0,
  };

  function stepOnFoot(dt, input, ctx) {
    // The camera owns the mouse: render.js turns drags into cameraYaw/cameraPitch.
    // Movement here is relative to that yaw.
    state.aiming = input.aiming;

    const fwd = input.drive();
    const strafe = input.steer();
    if (fwd !== 0 || strafe !== 0) {
      const targetHeading = state.cameraYaw + Math.PI - Math.atan2(strafe, fwd);
      let diff = targetHeading - state.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.heading += Math.max(-10 * dt, Math.min(10 * dt, diff));
      const targetSpeed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      state.speed += (targetSpeed - state.speed) * Math.min(1, 10 * dt);
    } else {
      state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), 30 * dt);
    }
    state.x += Math.sin(state.heading) * state.speed * dt;
    state.z += Math.cos(state.heading) * state.speed * dt;
    if (!city.isInCity(state.x, state.z)) {
      state.x = Math.max(-360, Math.min(360, state.x));
      state.z = Math.max(-360, Math.min(360, state.z));
    }
    const hit = city.collides(state.x, state.z, PLAYER.radius);
    if (hit) {
      const pushLeft = state.x + PLAYER.radius - hit.minX;
      const pushRight = hit.maxX - (state.x - PLAYER.radius);
      const pushUp = state.z + PLAYER.radius - hit.minZ;
      const pushDown = hit.maxZ - (state.z - PLAYER.radius);
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) state.x = hit.minX - PLAYER.radius;
      else if (min === pushRight) state.x = hit.maxX + PLAYER.radius;
      else if (min === pushUp) state.z = hit.minZ - PLAYER.radius;
      else state.z = hit.maxZ + PLAYER.radius;
      state.speed *= 0.5;
    }
    // Jump and gravity.
    if (state.y === 0 && ctx.jumpPressed) state.vy = 6.5;
    state.vy -= 18 * dt;
    state.y = Math.max(0, state.y + state.vy * dt);
    if (state.y === 0) state.vy = 0;
    if (state.invulnerable > 0) state.invulnerable -= dt;
    if (state.reloadTimer > 0) state.reloadTimer -= dt;
    state.walkPhase += dt * Math.abs(state.speed) * 1.9;
    mesh.position.set(state.x, state.y, state.z);
    mesh.rotation.y = state.heading;
    const swing = Math.sin(state.walkPhase) * (Math.abs(state.speed) > 0.5 ? 0.6 : 0);
    mesh.userData.legs[0].rotation.x = swing;
    mesh.userData.legs[1].rotation.x = -swing;
    mesh.userData.arms[0].rotation.x = state.aiming ? -1.2 : -swing * 0.7;
    mesh.userData.arms[1].rotation.x = state.aiming ? -1.2 : swing * 0.7;
    mesh.userData.gun.visible = true;
  }

  return { mesh, state, stepOnFoot };
}
