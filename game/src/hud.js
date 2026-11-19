// The HUD: wanted stars, cash, health, ammo, speed, the mission objective, toasts, the
// minimap and every menu screen. DOM overlays over the 3D canvas; the minimap is a 2D
// canvas drawn fresh each frame from the world state.
export function createHud(callbacks) {
  const el = (id) => document.getElementById(id);
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const MAP_SIZE = 200;
  const MAP_RANGE = 120; // metres shown from the player to each edge
  let toastTimer = null;
  let damageTimer = 0;

  function showScreen(name) {
    for (const screen of ['title', 'pause', 'over', 'busted', 'complete']) {
      const node = el(`screen-${screen}`);
      if (node) node.style.display = screen === name ? 'flex' : 'none';
    }
    el('hud').style.display = name === 'play' ? 'block' : 'none';
  }

  function toast(text, seconds = 3) {
    const node = el('toast');
    node.textContent = text;
    node.style.opacity = '1';
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { node.style.opacity = '0'; }, seconds * 1000);
  }

  function drawMinimap(state) {
    const ctx = mapCtx;
    const px = state.player.x;
    const pz = state.player.z;
    const scale = MAP_SIZE / (MAP_RANGE * 2);
    const toMap = (x, z) => [MAP_SIZE / 2 + (x - px) * scale, MAP_SIZE / 2 + (z - pz) * scale];
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Water and beach south.
    ctx.fillStyle = '#1e6f8e';
    const [, waterY] = toMap(0, 372);
    ctx.fillRect(0, waterY, MAP_SIZE, MAP_SIZE - waterY);
    ctx.fillStyle = '#e0c98f';
    const [, sandY] = toMap(0, 340);
    ctx.fillRect(0, sandY, MAP_SIZE, waterY - sandY);
    // Roads.
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = 14 * scale;
    for (const c of state.city.roadXs) {
      const [x1] = toMap(c, 0);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, MAP_SIZE);
      ctx.stroke();
      const [, y1] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(MAP_SIZE, y1);
      ctx.stroke();
    }
    ctx.strokeStyle = '#e8c33a';
    ctx.lineWidth = 1;
    for (const c of state.city.roadXs) {
      const [x1] = toMap(c, 0);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, MAP_SIZE);
      ctx.stroke();
      const [, y1] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(MAP_SIZE, y1);
      ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      if (mx < -4 || mx > MAP_SIZE + 4 || my < -4 || my > MAP_SIZE + 4) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Packages.
    for (const spot of state.packageSpots) {
      if (!spot.found) dot(spot.x, spot.z, '#f2c230', 2.5);
    }
    // Cars, police, enemies.
    for (const car of state.cars) {
      if (car.isPlayer) continue;
      dot(car.x, car.z, car.isPolice ? '#3a86ff' : '#dddddd', car.isPolice ? 4 : 2.5);
    }
    for (const enemy of state.enemies) {
      if (enemy.alive) dot(enemy.x, enemy.z, '#ff3333', 3);
    }
    if (state.taxiClient) dot(state.taxiClient.x, state.taxiClient.z, '#33cc66', 3.5);
    // Mission target: pulsing yellow ring.
    const target = state.missionTarget;
    if (target) {
      const [mx, my] = toMap(target.x, target.z);
      const pulse = 6 + Math.sin(state.time * 5) * 2;
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, pointing along the heading.
    const heading = state.playerCar ? state.playerCar.heading : state.player.heading;
    ctx.save();
    ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, MAP_SIZE - 2, MAP_SIZE - 2);
  }

  function update(state, dt) {
    if (damageTimer > 0) {
      damageTimer -= dt;
      el('damage-flash').style.opacity = String(Math.max(0, damageTimer));
    }
    // Wanted stars.
    const stars = el('stars');
    stars.textContent = '\u2605'.repeat(state.wanted) + '\u2606'.repeat(5 - state.wanted);
    stars.style.color = state.wanted > 0 ? '#ffcf3a' : '#8899aa';
    el('cash').textContent = `$${state.cash.toLocaleString('en-US')}`;
    const healthPct = Math.max(0, Math.min(100, state.player.health));
    el('health-fill').style.width = `${healthPct}%`;
    el('health-fill').style.background = healthPct > 50 ? '#37c978' : healthPct > 25 ? '#f2a93a' : '#e5534b';
    el('ammo').style.display = state.player.onFoot ? 'block' : 'none';
    el('ammo').textContent = state.player.onFoot ? `AMMO ${state.player.ammo} / 12` : '';
    const speed = state.playerCar ? Math.abs(state.playerCar.speed) * 3.6 : Math.abs(state.player.speed) * 3.6;
    el('speed').style.display = state.playerCar ? 'block' : 'none';
    el('speed').textContent = state.playerCar ? `${Math.round(speed)} km/h` : '';
    el('objective-title').textContent = state.missionTitle;
    el('objective-text').textContent = state.missionText;
    const target = state.missionTarget;
    el('objective-dist').textContent = target
      ? `${Math.round(Math.hypot(state.player.x - target.x, state.player.z - target.z))} m`
      : '';
    el('crosshair').style.display = state.player.onFoot && state.player.aiming ? 'block' : 'none';
    const prompt = el('interact-prompt');
    prompt.style.display = state.interactPrompt ? 'block' : 'none';
    if (state.interactPrompt) prompt.textContent = state.interactPrompt;
    drawMinimap(state);
  }

  function damageFlash() {
    damageTimer = 0.7;
    el('damage-flash').style.opacity = '0.7';
  }

  function bindButtons() {
    const bind = (id, fn) => {
      const node = el(id);
      if (node) node.addEventListener('click', () => { callbacks.audioUnlock(); fn(); });
    };
    bind('btn-new', () => callbacks.onNewGame());
    bind('btn-continue', () => callbacks.onContinue());
    bind('btn-resume', () => callbacks.onResume());
    bind('btn-save', () => callbacks.onSave());
    bind('btn-restart', () => callbacks.onRestart());
    bind('btn-quit', () => callbacks.onQuitToTitle());
    bind('btn-again', () => callbacks.onRestart());
    bind('btn-busted-again', () => callbacks.onRestart());
    bind('btn-free-roam', () => callbacks.onResume());
  }

  bindButtons();
  return { update, showScreen, toast, damageFlash };
}
