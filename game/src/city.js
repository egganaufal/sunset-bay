// SOLMARA, the city: a procedural sun-soaked coastal grid. One ground texture paints the
// roads, sidewalks and beach; buildings, palms and lamps are instanced meshes; the module
// also owns the road graph and the building colliders the physics uses.
import * as THREE from 'three';
import { CITY } from './config.js';
import { pick, range, rangeInt } from './random.js';

const GROUND_SIZE = 740;
const WORLD_TO_UV = 2048 / GROUND_SIZE;

function worldToPx(v) {
  return (v + GROUND_SIZE / 2) * WORLD_TO_UV;
}

/** Four facade paints: glass tower, concrete, brick and modern. Each is a canvas texture. */
function facadeTexture(base, windowColor, litColor, random) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 12;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = random() < 0.22;
      ctx.fillStyle = lit ? litColor : windowColor;
      ctx.fillRect(8 + c * 20, 10 + r * 20, 12, 12);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function groundTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  // Base: warm concrete.
  ctx.fillStyle = '#8f8a7d';
  ctx.fillRect(0, 0, 2048, 2048);
  // Road centre lines sit halfway between block edges.
  const centres = [];
  for (let k = 0; k <= CITY.blocks; k += 1) {
    centres.push(-CITY.half + k * CITY.pitch);
  }
  // Sidewalks: pale strips hugging each block.
  ctx.fillStyle = '#b5ad9c';
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const cx = (i - (CITY.blocks - 1) / 2) * CITY.pitch;
      const cz = (j - (CITY.blocks - 1) / 2) * CITY.pitch;
      ctx.fillRect(worldToPx(cx - CITY.blockSize / 2 - 3), worldToPx(cz - CITY.blockSize / 2 - 3), (CITY.blockSize + 6) * WORLD_TO_UV, (CITY.blockSize + 6) * WORLD_TO_UV);
    }
  }
  // Block interiors: concrete, grass parks, or plaza tiles.
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const cx = (i - (CITY.blocks - 1) / 2) * CITY.pitch;
      const cz = (j - (CITY.blocks - 1) / 2) * CITY.pitch;
      const park = (i + j * 3) % 7 === 0;
      ctx.fillStyle = park ? '#6f9e5a' : pick(random, ['#a39d8e', '#a8a292', '#9d978a']);
      ctx.fillRect(worldToPx(cx - CITY.blockSize / 2), worldToPx(cz - CITY.blockSize / 2), CITY.blockSize * WORLD_TO_UV, CITY.blockSize * WORLD_TO_UV);
    }
  }
  // Beach: sand south of the last road, with a foam edge. Painted before the roads so
  // the Boardwalk road itself stays asphalt.
  ctx.fillStyle = '#e0c98f';
  ctx.fillRect(0, worldToPx(CITY.half + CITY.roadWidth / 2), 2048, 2048 - worldToPx(CITY.half + CITY.roadWidth / 2));
  ctx.fillStyle = '#f2e3b3';
  ctx.fillRect(0, worldToPx(CITY.half + CITY.roadWidth / 2), 2048, 10);
  // North edge: the airport runway, beyond the last road.
  ctx.fillStyle = '#4a4d52';
  ctx.fillRect(worldToPx(-120), worldToPx(-CITY.half - 18), 240 * WORLD_TO_UV, 18 * WORLD_TO_UV);
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(worldToPx(-120), worldToPx(-CITY.half - 9), 240 * WORLD_TO_UV, 2);
  // Roads: asphalt strips with edge lines, centre dashes and crosswalks.
  ctx.fillStyle = '#3f444b';
  for (const c of centres) {
    ctx.fillRect(worldToPx(c - CITY.roadWidth / 2), 0, CITY.roadWidth * WORLD_TO_UV, 2048);
    ctx.fillRect(0, worldToPx(c - CITY.roadWidth / 2), 2048, CITY.roadWidth * WORLD_TO_UV);
  }
  ctx.strokeStyle = '#e8c33a';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (const c of centres) {
    ctx.beginPath();
    ctx.moveTo(worldToPx(c), 0);
    ctx.lineTo(worldToPx(c), 2048);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, worldToPx(c));
    ctx.lineTo(2048, worldToPx(c));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#e8e8e2';
  for (const cx of centres) {
    for (const cz of centres) {
      for (let s = -1; s <= 1; s += 1) {
        ctx.fillRect(worldToPx(cx - 5 + s * 4), worldToPx(cz - CITY.roadWidth / 2 + 1), 8, 5);
        ctx.fillRect(worldToPx(cx - 5 + s * 4), worldToPx(cz + CITY.roadWidth / 2 - 6), 8, 5);
        ctx.fillRect(worldToPx(cx - CITY.roadWidth / 2 + 1), worldToPx(cz - 5 + s * 4), 5, 8);
        ctx.fillRect(worldToPx(cx + CITY.roadWidth / 2 - 6), worldToPx(cz - 5 + s * 4), 5, 8);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createCity(random) {
  const group = new THREE.Group();
  const colliders = [];
  const centres = [];
  for (let k = 0; k <= CITY.blocks; k += 1) centres.push(-CITY.half + k * CITY.pitch);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ map: groundTexture(random) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Ocean south of the beach.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE + 200, 460),
    new THREE.MeshPhongMaterial({ color: 0x1e6f8e, shininess: 120, specular: 0x99ccff }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, CITY.half + 230);
  group.add(water);

  // Buildings: instanced boxes, one InstancedMesh per facade, plus dark roof caps.
  const facades = [
    facadeTexture('#2e4a66', '#1c2f42', '#ffd27a', random),
    facadeTexture('#b8a88e', '#5d5346', '#ffd27a', random),
    facadeTexture('#8e4a3a', '#4a2a22', '#ffd27a', random),
    facadeTexture('#c9cdd2', '#3d4a55', '#ffe9a8', random),
  ];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buildingSpots = [];
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const cx = (i - (CITY.blocks - 1) / 2) * CITY.pitch;
      const cz = (j - (CITY.blocks - 1) / 2) * CITY.pitch;
      const downtown = Math.abs(i - 4) <= 2 && Math.abs(j - 4) <= 2;
      const count = downtown ? rangeInt(random, 2, 3) : rangeInt(random, 1, 2);
      const park = (i + j * 3) % 7 === 0;
      if (park && !downtown) continue;
      for (let b = 0; b < count; b += 1) {
        const w = range(random, 16, 30);
        const d = range(random, 16, 30);
        const ox = count === 1 ? 0 : (b % 2 === 0 ? -14 : 14);
        const oz = count === 1 ? 0 : (b < 2 ? -14 : 14);
        const h = downtown ? range(random, 24, 58) : range(random, 8, 22);
        const x = cx + ox;
        const z = cz + oz;
        buildingSpots.push({ x, z, w, d, h, variant: rangeInt(random, 0, 3) });
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }
  const dummy = new THREE.Object3D();
  for (let v = 0; v < 4; v += 1) {
    const spots = buildingSpots.filter((s) => s.variant === v);
    if (spots.length === 0) continue;
    const mesh = new THREE.InstancedMesh(boxGeometry, new THREE.MeshLambertMaterial({ map: facades[v] }), spots.length);
    spots.forEach((s, idx) => {
      dummy.position.set(s.x, s.h / 2, s.z);
      dummy.scale.set(s.w, s.h, s.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const roofMesh = new THREE.InstancedMesh(boxGeometry, new THREE.MeshLambertMaterial({ color: 0x2b2f36 }), buildingSpots.length);
  buildingSpots.forEach((s, idx) => {
    dummy.position.set(s.x, s.h + 0.3, s.z);
    dummy.scale.set(s.w + 0.6, 0.6, s.d + 0.6);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    roofMesh.setMatrixAt(idx, dummy.matrix);
  });
  group.add(roofMesh);

  // Palm trees along sidewalks and the beach.
  const palmSpots = [];
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      if (random() < 0.55) {
        const cx = (i - (CITY.blocks - 1) / 2) * CITY.pitch;
        const cz = (j - (CITY.blocks - 1) / 2) * CITY.pitch;
        palmSpots.push({ x: cx + range(random, -26, 26), z: cz + (random() < 0.5 ? -28 : 28) });
      }
    }
  }
  for (let k = 0; k < 24; k += 1) {
    palmSpots.push({ x: range(random, -320, 320), z: CITY.half - 4 + range(random, 0, 22) });
  }
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.32, 6.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6b46 }),
    palmSpots.length,
  );
  const canopyMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(2.4, 0),
    new THREE.MeshLambertMaterial({ color: 0x3f8f4f }),
    palmSpots.length,
  );
  palmSpots.forEach((p, idx) => {
    dummy.position.set(p.x, 3.25, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(idx, dummy.matrix);
    dummy.position.set(p.x, 7.2, p.z);
    dummy.scale.set(1, 0.55, 1);
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(idx, dummy.matrix);
  });
  trunkMesh.castShadow = true;
  canopyMesh.castShadow = true;
  group.add(trunkMesh);
  group.add(canopyMesh);

  // Street lamps at intersections.
  const lampSpots = [];
  for (const cx of centres) {
    for (const cz of centres) {
      if (random() < 0.5) lampSpots.push({ x: cx + 8, z: cz + 8 });
    }
  }
  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.12, 5.5, 5),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
    lampSpots.length,
  );
  const headMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.9 }),
    lampSpots.length,
  );
  lampSpots.forEach((p, idx) => {
    dummy.position.set(p.x, 2.75, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(idx, dummy.matrix);
    dummy.position.set(p.x, 5.6, p.z);
    dummy.updateMatrix();
    headMesh.setMatrixAt(idx, dummy.matrix);
  });
  group.add(poleMesh);
  group.add(headMesh);

  // Named districts, for mission text and the minimap.
  const districts = [
    { name: 'Downtown Solmara', x: 0, z: 0 },
    { name: 'Marina District', x: -260, z: 185 },
    { name: 'Palm Heights', x: 260, z: -185 },
    { name: 'Boardwalk', x: 0, z: 320 },
    { name: 'Solmara Airport', x: 0, z: -330 },
    { name: 'Old Town', x: -260, z: -260 },
  ];
  const intersections = [];
  for (const cx of centres) {
    for (const cz of centres) intersections.push({ x: cx, z: cz });
  }

  function nearestRoadPoint(x, z) {
    let bestX = centres[0];
    let bestDX = Math.abs(x - centres[0]);
    for (const c of centres) {
      const d = Math.abs(x - c);
      if (d < bestDX) { bestDX = d; bestX = c; }
    }
    let bestZ = centres[0];
    let bestDZ = Math.abs(z - centres[0]);
    for (const c of centres) {
      const d = Math.abs(z - c);
      if (d < bestDZ) { bestDZ = d; bestZ = c; }
    }
    // Snap to the closer road: vertical road at bestX or horizontal at bestZ.
    return bestDX <= bestDZ ? { x: bestX, z } : { x, z: bestZ };
  }

  function randomRoadPoint(near, maxDist) {
    for (let tries = 0; tries < 24; tries += 1) {
      const c = pick(random, intersections);
      const dx = c.x - near.x;
      const dz = c.z - near.z;
      if (Math.hypot(dx, dz) <= maxDist) return { x: c.x, z: c.z };
    }
    return { x: intersections[0].x, z: intersections[0].z };
  }

  function collides(x, z, radius) {
    for (const b of colliders) {
      if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) return b;
    }
    return null;
  }

  return {
    group, water, colliders, roadXs: centres, roadZs: centres, intersections, districts,
    nearestRoadPoint, randomRoadPoint, collides,
    isInCity(x, z) { return Math.abs(x) <= CITY.half + 30 && Math.abs(z) <= CITY.half + 30; },
  };
}
