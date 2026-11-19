// Keyboard and mouse input. Held keys give movement axes; one-shot presses (interact,
// reload, pause, confirm) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice.
export const ACTION_INTERACT = 1;
export const ACTION_RELOAD = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_HORN = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const INTERACT = new Set(['KeyE']);
const RELOAD = new Set(['KeyR']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Enter', 'Space']);
const HORN = new Set(['KeyH']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseRight = false;
  let mouseDX = 0;
  let mouseDY = 0;
  let wheelDelta = 0;
  let mutePressed = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (RELOAD.has(event.code)) actions |= ACTION_RELOAD;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (HORN.has(event.code)) actions |= ACTION_HORN;
    else if (MUTE.has(event.code)) mutePressed = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
    mouseRight = false;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouseDown = true;
    if (event.button === 2) mouseRight = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
    if (event.button === 2) mouseRight = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('mousemove', (event) => {
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  });
  canvas.addEventListener('wheel', (event) => {
    wheelDelta += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  function axis(negative, positive) {
    let value = 0;
    for (const code of negative) if (keys.has(code)) value -= 1;
    for (const code of positive) if (keys.has(code)) value += 1;
    return value;
  }

  return {
    /** -1 back, 1 forward. */
    drive() { return axis(BACK, FORWARD); },
    /** -1 left, 1 right. */
    steer() { return axis(LEFT, RIGHT); },
    running() { return [...RUN].some((code) => keys.has(code)); },
    get firing() { return mouseDown; },
    get aiming() { return mouseRight; },
    takeMouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    takeWheel() {
      const d = wheelDelta;
      wheelDelta = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeMute() {
      const m = mutePressed;
      mutePressed = false;
      return m;
    },
  };
}
