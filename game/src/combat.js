// Combat: the player's pistol, rival crew gunmen, health pickups and the particles that
// sell a hit. Shooting is hitscan from the camera through the crosshair; walls block it
// (sampled along the ray), enemies return fire when they can see the player.
import * as THREE from 'three';

function segmentBlocked(city, ax, az, bx, bz) {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.floor(dist));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (city.collides(ax + (bx - ax) * t, az + (bz - az) * t, 0.4)) return true;
  }
  return false;
}

export function createCombat(city, random) {
  const group = new THREE.Group();
  const enemies = [];
  const particles = [];
  const tracers = [];
  const pickups = [];
  let nextId = 1;

  // One THREE.Points cloud, refilled every frame from the particle list.
  const maxParticles = 300;
  const positions = new Float32Array(maxParticles * 3);
  const colors = new Float32Array(maxParticles * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95 }));
  points.frustumCulled = false;
  group.add(points);

  function buildEnemyMesh() {
    const g = new THREE.Group();
    const mat = (color) => new THREE.MeshLambertMaterial({ color });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), mat(0x8e2f2f));
    torso.position.y = 1.08;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xc99a7a));
    head.position.y = 1.6;
    g.add(head);
    const legs = [];
    for (const sx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.21), mat(0x222222));
      leg.geometry.translate(0, -0.36, 0);
      leg.position.set(sx, 0.72, 0);
      g.add(leg);
      legs.push(leg);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), mat(0x33cc44));
    bar.position.y = 1.95;
    g.add(bar);
    const barBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), mat(0x661111));
    barBack.position.y = 1.95;
    barBack.position.z = -0.02;
    g.add(barBack);
    g.userData.legs = legs;
    g.userData.bar = bar;
    g.userData.barBack = barBack;
    return g;
  }

  function spawnEnemies(count, near) {
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + random() * 0.5;
      const dist = 14 + random() * 10;
      let x = near.x + Math.sin(angle) * dist;
      let z = near.z + Math.cos(angle) * dist;
      if (city.collides(x, z, 0.6)) {
        x = near.x + 10;
        z = near.z + 10;
      }
      const mesh = buildEnemyMesh();
      mesh.position.set(x, 0, z);
      group.add(mesh);
      const enemy = { id: nextId, x, z, heading: 0, health: 100, mesh, shootTimer: 0.5 + random(), walkPhase: random() * 10, alive: true };
      nextId += 1;
      enemies.push(enemy);
      made.push(enemy);
    }
    return made;
  }

  function burst(x, y, z, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (particles.length >= maxParticles) return;
      const a = random() * Math.PI * 2;
      const b = random() * Math.PI - Math.PI / 2;
      particles.push({
        x, y, z,
        vx: Math.cos(a) * Math.cos(b) * speed * random(),
        vy: Math.abs(Math.sin(b)) * speed * random() + 1,
        vz: Math.sin(a) * Math.cos(b) * speed * random(),
        life: 0.5 + random() * 0.4, color,
      });
    }
  }

  function addTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    line.frustumCulled = false;
    group.add(line);
    tracers.push({ line, life: 0.09 });
  }

  /** Hitscan from `origin` along `dir` (both {x,y,z}); returns the enemy hit, if any. */
  function shoot(origin, dir, maxDist, shooter) {
    const end = { x: origin.x + dir.x * maxDist, y: origin.y + dir.y * maxDist, z: origin.z + dir.z * maxDist };
    // Walls first: walk the ray and stop at the first building.
    let wallDist = maxDist;
    const steps = Math.floor(maxDist);
    for (let i = 1; i <= steps; i += 1) {
      const x = origin.x + dir.x * i;
      const z = origin.z + dir.z * i;
      if (city.collides(x, z, 0.3)) { wallDist = i; break; }
    }
    // Enemies: closest one whose centre passes near the ray before the wall.
    let hitEnemy = null;
    let hitDist = wallDist;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const ex = enemy.x - origin.x;
      const ez = enemy.z - origin.z;
      const along = ex * dir.x + ez * dir.z;
      if (along < 0 || along > wallDist) continue;
      const perp = Math.abs(ex * dir.z - ez * dir.x);
      if (perp < 1.1 && along < hitDist) {
        hitDist = along;
        hitEnemy = enemy;
      }
    }
    const hitPoint = { x: origin.x + dir.x * hitDist, y: Math.max(0.2, origin.y + dir.y * hitDist), z: origin.z + dir.z * hitDist };
    addTracer(origin, hitPoint);
    if (hitEnemy) {
      hitEnemy.health -= shooter === 'player' ? 34 : 0;
      burst(hitPoint.x, 1.2, hitPoint.z, 0xcc2222, 10, 3);
      if (hitEnemy.health <= 0) {
        hitEnemy.alive = false;
        group.remove(hitEnemy.mesh);
        burst(hitEnemy.x, 1, hitEnemy.z, 0xcc2222, 22, 4);
      }
    } else {
      burst(hitPoint.x, hitPoint.y, hitPoint.z, 0xcccccc, 6, 2);
    }
    return hitEnemy;
  }

  function spawnPickups(spots) {
    for (const spot of spots) {
      const mesh = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x22cc44, emissiveIntensity: 0.7 }));
      box.position.y = 0.8;
      mesh.add(box);
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.05), new THREE.MeshLambertMaterial({ color: 0x22cc44 }));
      cross1.position.set(0, 0.8, 0.36);
      mesh.add(cross1);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.05), new THREE.MeshLambertMaterial({ color: 0x22cc44 }));
      cross2.position.set(0, 0.8, 0.36);
      mesh.add(cross2);
      mesh.position.set(spot.x, 0, spot.z);
      group.add(mesh);
      pickups.push({ x: spot.x, z: spot.z, mesh, taken: false, phase: random() * 6 });
    }
  }

  function step(dt, ctx) {
    const player = ctx.player;
    // Enemies: close to firing range, shoot with spread; walk animation.
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = player.x - enemy.x;
      const dz = player.z - enemy.z;
      const dist = Math.hypot(dx, dz);
      const blocked = segmentBlocked(city, enemy.x, enemy.z, player.x, player.z);
      enemy.heading = Math.atan2(dx, dz);
      enemy.mesh.rotation.y = enemy.heading;
      enemy.mesh.userData.bar.scale.x = Math.max(0.01, enemy.health / 100);
      enemy.mesh.userData.barBack.scale.x = 1;
      if (dist > 22) {
        enemy.x += Math.sin(enemy.heading) * 3.4 * dt;
        enemy.z += Math.cos(enemy.heading) * 3.4 * dt;
        enemy.walkPhase += dt * 8;
        const swing = Math.sin(enemy.walkPhase) * 0.5;
        enemy.mesh.userData.legs[0].rotation.x = swing;
        enemy.mesh.userData.legs[1].rotation.x = -swing;
      } else {
        enemy.walkPhase += dt * 2;
      }
      enemy.mesh.position.set(enemy.x, 0, enemy.z);
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && dist < 42 && !blocked && player.onFoot) {
        enemy.shootTimer = 0.9 + random() * 0.7;
        const dir = {
          x: (dx / dist) + (random() - 0.5) * 0.24,
          y: -0.02,
          z: (dz / dist) + (random() - 0.5) * 0.24,
        };
        const from = { x: enemy.x, y: 1.4, z: enemy.z };
        const to = { x: player.x, y: 1.2, z: player.z };
        addTracer(from, to);
        ctx.onEnemyShot(enemy);
        if (random() < 0.45) ctx.damagePlayer(6 + Math.floor(random() * 7));
      }
    }
    // Pickups bob and heal on touch.
    for (const pickup of pickups) {
      if (pickup.taken) continue;
      pickup.phase += dt * 2;
      pickup.mesh.position.y = Math.sin(pickup.phase) * 0.15;
      pickup.mesh.rotation.y += dt;
      if (Math.hypot(player.x - pickup.x, player.z - pickup.z) < 1.6 && player.onFoot) {
        pickup.taken = true;
        pickup.mesh.visible = false;
        ctx.onPickup(pickup);
      }
    }
    // Particles fall and fade.
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0) { p.y = 0; p.vy *= -0.4; }
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        group.remove(t.line);
        t.line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
    // Refill the points cloud.
    for (let i = 0; i < maxParticles; i += 1) {
      const p = particles[i];
      if (p) {
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        const color = new THREE.Color(p.color);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      } else {
        positions[i * 3 + 1] = -100;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  return {
    group, enemies, pickups, spawnEnemies, spawnPickups, shoot, burst, step,
    get aliveEnemies() { return enemies.filter((e) => e.alive).length; },
  };
}
