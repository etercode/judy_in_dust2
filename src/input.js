import * as THREE from 'three';
import { MAP_SCALE, NOCLIP_VERTICAL_SPEED } from './worldScale.js';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight',
  'KeyQ', 'KeyE',
]);

function moveModeFromKeys(keys, crouching) {
  const moving = keys.w || keys.a || keys.s || keys.d;

  if (!moving) return crouching ? 'crouch' : 'idle';
  if (keys.shift) return 'sprint';
  if (crouching) return 'crouchWalk';
  return 'walk';
}

export function createInput() {
  const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false,
    q: false,
    e: false,
  };
  let crouching = false;
  let orbitEnabled = false;
  let noclipEnabled = false;
  let jumpRequested = false;
  let slideRequested = false;

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const direction = new THREE.Vector3();
  function setKey(code, pressed) {
    switch (code) {
      case 'KeyW': keys.w = pressed; break;
      case 'KeyA': keys.a = pressed; break;
      case 'KeyS': keys.s = pressed; break;
      case 'KeyD': keys.d = pressed; break;
      case 'ShiftLeft':
      case 'ShiftRight': keys.shift = pressed; break;
      case 'KeyQ': keys.q = pressed; break;
      case 'KeyE': keys.e = pressed; break;
    }
  }

  function onKeyDown(event) {
    if (event.code === 'KeyC') {
      if (event.repeat) return;
      event.preventDefault();
      const moving = keys.w || keys.a || keys.s || keys.d;
      if (!noclipEnabled && moving && keys.shift) {
        slideRequested = true;
        return;
      }
      crouching = !crouching;
      return;
    }

    if (event.code === 'Numpad0') {
      if (event.repeat) return;
      event.preventDefault();
      orbitEnabled = !orbitEnabled;
      return;
    }

    if (event.code === 'Numpad1' || event.code === 'KeyN') {
      if (event.repeat) return;
      event.preventDefault();
      noclipEnabled = !noclipEnabled;
      if (noclipEnabled) {
        orbitEnabled = false;
      }
      return;
    }

    if (event.code === 'Space' && !noclipEnabled) {
      if (event.repeat) return;
      event.preventDefault();
      jumpRequested = true;
      return;
    }

    if (!GAME_KEYS.has(event.code)) return;

    event.preventDefault();
    setKey(event.code, true);
  }

  function onKeyUp(event) {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    setKey(event.code, false);
  }

  const opts = { capture: true };

  document.addEventListener('keydown', onKeyDown, opts);
  document.addEventListener('keyup', onKeyUp, opts);

  return {
    isOrbitEnabled() {
      return orbitEnabled;
    },

    isNoclipEnabled() {
      return noclipEnabled;
    },

    isCrouching() {
      return crouching;
    },

    consumeJump() {
      if (!jumpRequested) return false;
      jumpRequested = false;
      return true;
    },

    consumeSlide() {
      if (!slideRequested) return false;
      slideRequested = false;
      return true;
    },

    getMoveMode() {
      const moving = keys.w || keys.a || keys.s || keys.d;
      if (crouching && moving && keys.shift) {
        crouching = false;
      }
      return moveModeFromKeys(keys, crouching);
    },

    getMoveDirection(camera) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() === 0) return null;
      forward.normalize();

      right.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();

      direction.set(0, 0, 0);
      if (keys.w) direction.add(forward);
      if (keys.s) direction.sub(forward);
      if (keys.d) direction.add(right);
      if (keys.a) direction.sub(right);

      if (direction.lengthSq() === 0) return null;
      return direction.normalize();
    },

    getNoclipVerticalMove(delta) {
      let y = 0;
      if (keys.e) y += 1;
      if (keys.q) y -= 1;
      if (y === 0) return 0;
      return y * NOCLIP_VERTICAL_SPEED * MAP_SCALE * delta;
    },

  };
}
