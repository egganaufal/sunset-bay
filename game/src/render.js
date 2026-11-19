// The 3D view: renderer, sun-soaked sky, lights and shadows, and the third-person
// camera that follows the player on foot and swings behind the car when driving. The
// world owns the meshes; this module only points the camera and paints the frame.
import * as THREE from 'three';

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc3e8);
  scene.fog = new THREE.Fog(0xb8cede, 200, 750);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7c0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -190;
  sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 190;
  sun.shadow.camera.bottom = -190;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(world.group);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);
  const cameraPos = new THREE.Vector3(0, 12, -30);
  const cameraTarget = new THREE.Vector3(0, 2, 0);
  let shake = 0;
  let autoFollowPause = 0;
  let lastDragAt = 0;

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateCamera(dt, input) {
    const p = world.player;
    const car = world.playerCar;
    const dragging = input ? input.takeMouseDelta() : { x: 0, y: 0 };
    if (dragging.x !== 0 || dragging.y !== 0) {
      lastDragAt = world.state.time;
      p.cameraYaw -= dragging.x * 0.004;
      p.cameraPitch = Math.max(-0.05, Math.min(0.9, p.cameraPitch + dragging.y * 0.003));
    }
    if (input) p.cameraDist = Math.max(5, Math.min(16, p.cameraDist + input.takeWheel() * 0.01));
    let target;
    let desiredYaw;
    let desiredPitch = p.cameraPitch;
    let desiredDist = p.cameraDist;
    if (car) {
      target = new THREE.Vector3(car.x, 1.8, car.z);
      // Behind the car, easing onto its heading unless the player just dragged.
      if (world.state.time - lastDragAt > 2.5) {
        desiredYaw = car.heading + Math.PI;
        let diff = desiredYaw - p.cameraYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.cameraYaw += diff * Math.min(1, 1.4 * dt);
      }
      desiredPitch = 0.26;
      desiredDist = 12;
    } else {
      target = new THREE.Vector3(p.x, 1.6 + p.y, p.z);
    }
    const offset = new THREE.Vector3(
      Math.sin(p.cameraYaw) * Math.cos(desiredPitch) * desiredDist,
      Math.sin(desiredPitch) * desiredDist + 1.2,
      Math.cos(p.cameraYaw) * Math.cos(desiredPitch) * desiredDist,
    );
    const desired = target.clone().add(offset);
    // Keep the camera out of buildings: pull it in when a building blocks the view.
    const hit = world.city.collides(desired.x, desired.z, 1);
    if (hit) {
      desired.lerp(target, 0.45);
    }
    const k = 1 - Math.exp(-9 * dt);
    cameraPos.lerp(desired, k);
    cameraTarget.lerp(target, 1 - Math.exp(-12 * dt));
    camera.position.copy(cameraPos);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      camera.position.z += (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - dt * 2.2);
    }
    camera.lookAt(cameraTarget);
    // The sun follows the player so shadows stay crisp wherever they go.
    sun.position.set(p.x + 160, 240, p.z + 90);
    sun.target.position.set(p.x, 0, p.z);
    // The sea breathes.
    world.city.water.position.y = -0.4 + Math.sin(world.state.time * 0.7) * 0.12;
  }

  function getAimRay() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return {
      origin: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      dir: { x: dir.x, y: dir.y, z: dir.z },
    };
  }

  function render(dt, input) {
    updateCamera(dt, input);
    renderer.render(scene, camera);
  }

  function addShake(amount) {
    shake = Math.min(1.2, shake + amount);
  }

  resize();
  window.addEventListener('resize', resize);
  return { render, resize, getAimRay, addShake, camera, scene, renderer };
}
