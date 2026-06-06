import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { placeOnFloor } from './floor.js';
import { firstClip } from './clips.js';
import {
  MAP_SCALE,
  JUDY_SCALE,
  SPAWN_POSITION,
  WALK_SPEED,
  CROUCH_WALK_SPEED,
  SPRINT_SPEED,
} from './worldScale.js';

const MODEL_URL = '/Judy/TPose.glb';

const ANIM_URLS = {
  idle: '/Judy/Standing.glb',
  walk: '/Judy/Walking.glb',
  crouch: '/Judy/CrouchIdle.glb',
  crouchWalk: '/Judy/CrouchWalk.glb',
  hipHopDance: '/Judy/HipHopDance.glb',
  standingJump: '/Judy/StandingJump.glb',
  runningJump: '/Judy/RunningJump.glb',
  runningSlide: '/Judy/RunningSlide.glb',
  sprint: '/Judy/Sprint.glb',
};

const MODE_LABELS = {
  idle: 'idle',
  walk: 'walking',
  crouch: 'crouching',
  crouchWalk: 'crouch walk',
  hipHopDance: 'hip hop dance',
  standingJump: 'standing jump',
  runningJump: 'running jump',
  runningSlide: 'running slide',
  sprint: 'sprinting',
};

const IDLE_DANCE_DELAY = 5;

const SPEEDS = {
  walk: WALK_SPEED * MAP_SCALE,
  crouchWalk: CROUCH_WALK_SPEED * MAP_SCALE,
  sprint: SPRINT_SPEED * MAP_SCALE,
};

const ANIM_BASE_SPEED = {
  walk: 2.2 * MAP_SCALE,
  crouchWalk: 1.2 * MAP_SCALE,
  sprint: 4.5 * MAP_SCALE,
};

const TURN_SPEED = 10;

function lerpAngle(current, target, t) {
  let delta = target - current;
  delta = ((delta % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return current + delta * t;
}

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function createLoopAction(mixer, clip) {
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat);
  return action;
}

function createOneShotAction(mixer, clip) {
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce);
  action.clampWhenFinished = true;
  return action;
}

export function loadCharacter({
  scene,
  camera,
  controls,
  loader,
  statusEl,
  clockEl,
  positionEl,
  input,
  footsteps,
  collision,
  spawn,
  onReady,
  onError,
}) {
  let mixer = null;
  let model = null;
  let currentAction = null;
  let moveMode = null;
  let ready = false;
  let idleTimer = 0;
  let dancing = false;
  let jumping = false;
  let jumpMode = null;
  let sliding = false;
  let velocityY = 0;
  const actions = {};

  function fadeToAction(action, duration = 0.2) {
    if (!action || currentAction === action) return;

    action.reset();
    action.play();

    if (currentAction) {
      currentAction.crossFadeTo(action, duration, true);
    }

    currentAction = action;
  }

  function playOneShot(mode) {
    moveMode = mode;
    statusEl.textContent = MODE_LABELS[mode] ?? mode;

    const action = actions[mode];
    action.reset();
    action.play();

    if (currentAction) {
      currentAction.crossFadeTo(action, 0.2, true);
    }

    currentAction = action;
  }

  function setMoveMode(mode) {
    if (!ready || dancing || jumping || sliding) return;

    const action = actions[mode];
    if (!action) return;
    if (mode === moveMode) return;

    moveMode = mode;
    statusEl.textContent = MODE_LABELS[mode] ?? mode;

    const baseSpeed = ANIM_BASE_SPEED[mode];
    action.timeScale = baseSpeed
      ? (SPEEDS[mode] ?? SPEEDS.walk) / baseSpeed
      : 1;

    footsteps?.reset();
    fadeToAction(action);
  }

  function playDance() {
    dancing = true;
    idleTimer = 0;
    playOneShot('hipHopDance');
  }

  function finishDance() {
    dancing = false;
    moveMode = null;
    idleTimer = 0;
    setMoveMode('idle');
  }

  function playJump(mode) {
    jumping = true;
    jumpMode = mode;
    idleTimer = 0;
    footsteps?.playGrunt(mode);
    playOneShot(mode);
  }

  function finishJump() {
    jumping = false;
    jumpMode = null;
    moveMode = null;
    setMoveMode(input.getMoveMode());
  }

  function tryJump(mode, direction) {
    if (jumping || sliding || dancing || input.isCrouching()) return;

    const grounded = !collision || collision.isGrounded(model.position);
    if (!grounded) return;

    if (direction || mode === 'walk' || mode === 'sprint') {
      playJump('runningJump');
    } else if (mode === 'idle') {
      playJump('standingJump');
    }

    if (collision) {
      velocityY = collision.getJumpVelocity();
    }
  }

  function playSlide() {
    sliding = true;
    idleTimer = 0;
    footsteps?.playSlide();
    playOneShot('runningSlide');
  }

  function finishSlide() {
    sliding = false;
    moveMode = null;
    setMoveMode(input.getMoveMode());
  }

  function trySlide(mode) {
    if (sliding || jumping || dancing) return;
    if (mode === 'sprint') {
      playSlide();
    }
  }

  function updateClock(standingIdle) {
    if (!clockEl) return;

    if (dancing) {
      clockEl.textContent = 'dancing';
      return;
    }

    if (jumping) {
      clockEl.textContent = MODE_LABELS[jumpMode] ?? 'jumping';
      return;
    }

    if (sliding) {
      clockEl.textContent = MODE_LABELS.runningSlide;
      return;
    }

    if (!standingIdle) {
      clockEl.textContent = `${IDLE_DANCE_DELAY}s`;
      return;
    }

    const remaining = Math.max(0, IDLE_DANCE_DELAY - idleTimer);
    clockEl.textContent = `${Math.ceil(remaining)}s`;
  }

  function frameCamera(box) {
    const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray());
    const center = box.getCenter(new THREE.Vector3());

    camera.position.copy(center).add(new THREE.Vector3(maxDim * 1.5, maxDim, maxDim * 2.5));
    controls.target.copy(center);
    controls.update();

    return maxDim;
  }

  async function init() {
    try {
      const [
        modelGltf,
        idleGltf,
        walkGltf,
        crouchIdleGltf,
        crouchWalkGltf,
        hipHopDanceGltf,
        standingJumpGltf,
        runningJumpGltf,
        runningSlideGltf,
        sprintGltf,
      ] = await Promise.all([
        loadGltf(loader, MODEL_URL),
        loadGltf(loader, ANIM_URLS.idle),
        loadGltf(loader, ANIM_URLS.walk),
        loadGltf(loader, ANIM_URLS.crouch),
        loadGltf(loader, ANIM_URLS.crouchWalk),
        loadGltf(loader, ANIM_URLS.hipHopDance),
        loadGltf(loader, ANIM_URLS.standingJump),
        loadGltf(loader, ANIM_URLS.runningJump),
        loadGltf(loader, ANIM_URLS.runningSlide),
        loadGltf(loader, ANIM_URLS.sprint),
      ]);

      model = modelGltf.scene;
      model.scale.setScalar(JUDY_SCALE);
      scene.add(model);

      placeOnFloor(model);

      if (spawn) {
        model.position.copy(spawn);
      }

      if (collision) {
        if (SPAWN_POSITION) {
          collision.placeOnSpawn(model.position);
        } else if (!collision.isGrounded(model.position)) {
          collision.placeOnSpawn(model.position);
        }
        velocityY = 0;
      }

      frameCamera(new THREE.Box3().setFromObject(model));

      mixer = new THREE.AnimationMixer(model);
      mixer.addEventListener('finished', (event) => {
        if (event.action === actions.hipHopDance) {
          finishDance();
        } else if (
          event.action === actions.standingJump
          || event.action === actions.runningJump
        ) {
          finishJump();
        } else if (event.action === actions.runningSlide) {
          finishSlide();
        }
      });

      actions.idle = createLoopAction(mixer, firstClip(idleGltf.animations));
      actions.walk = createLoopAction(mixer, walkGltf.animations[0]);
      actions.crouch = createLoopAction(mixer, firstClip(crouchIdleGltf.animations));
      actions.crouchWalk = createLoopAction(mixer, firstClip(crouchWalkGltf.animations));
      actions.hipHopDance = createOneShotAction(mixer, firstClip(hipHopDanceGltf.animations));
      actions.standingJump = createOneShotAction(mixer, firstClip(standingJumpGltf.animations));
      actions.runningJump = createOneShotAction(mixer, firstClip(runningJumpGltf.animations));
      actions.runningSlide = createOneShotAction(mixer, firstClip(runningSlideGltf.animations));
      actions.sprint = createLoopAction(mixer, firstClip(sprintGltf.animations));

      ready = true;
      velocityY = 0;
      onReady?.();
      setMoveMode('idle');
    } catch (error) {
      console.error('Character load failed:', error);
      statusEl.textContent = 'load failed';
      onError?.(error);
    }
  }

  init();

  return {
    getModel() {
      return model;
    },

    update(delta) {
      if (!ready || !mixer || !model) return;

      mixer.update(delta);

      if (positionEl) {
        const { x, y, z } = model.position;
        positionEl.textContent = `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
      }

      const noclip = input.isNoclipEnabled();
      const mode = input.getMoveMode();
      const direction = input.getMoveDirection(camera);

      if (noclip) {
        statusEl.textContent = `noclip · ${MODE_LABELS[mode] ?? mode}`;
        velocityY = 0;
        jumping = false;
        sliding = false;
        if (direction || mode !== 'idle') {
          setMoveMode(mode);
        }
      } else {
        if (input.consumeJump()) {
          tryJump(mode, direction);
        }

        if (input.consumeSlide()) {
          trySlide(mode);
        }

        const interrupted = direction || mode !== 'idle' || jumping || sliding;

        if (interrupted) {
          idleTimer = 0;
          if (dancing) {
            dancing = false;
            moveMode = null;
          }
          if (!jumping && !sliding) {
            setMoveMode(mode);
          }
        } else if (dancing) {
          // keep hip-hop dance playing
        } else {
          setMoveMode(mode);
          idleTimer += delta;
          if (idleTimer >= IDLE_DANCE_DELAY) {
            playDance();
          }
        }

        const standingIdle = !interrupted && !dancing;
        updateClock(standingIdle);
      }

      const speed = SPEEDS[mode] ?? SPEEDS.walk;
      const canMoveHorizontally = direction
        && (noclip || !(jumping && jumpMode === 'standingJump'));
      const movedDistance = canMoveHorizontally ? speed * delta : 0;

      if (noclip) {
        if (canMoveHorizontally) {
          model.position.addScaledVector(direction, movedDistance);
        }
        model.position.y += input.getNoclipVerticalMove(delta);
      } else if (collision) {
        const physics = collision.step(
          model.position,
          velocityY,
          delta,
          canMoveHorizontally ? direction : null,
          movedDistance
        );
        velocityY = physics.velocityY;
      } else if (canMoveHorizontally) {
        model.position.addScaledVector(direction, movedDistance);
      }

      if (canMoveHorizontally && !sliding && !jumping) {
        footsteps?.update(mode, movedDistance);
      }

      if (canMoveHorizontally) {
        const targetYaw = Math.atan2(direction.x, direction.z);
        const turnAmount = 1 - Math.exp(-TURN_SPEED * delta);
        model.rotation.y = lerpAngle(model.rotation.y, targetYaw, turnAmount);
      }
    },
  };
}

export function createCharacterLoader(manager) {
  return new GLTFLoader(manager);
}
