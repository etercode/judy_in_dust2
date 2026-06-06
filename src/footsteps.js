import * as THREE from 'three';
import { MAP_SCALE } from './worldScale.js';

const FOOTSTEP_URL = '/Judy/footstep-humanized-.wav';
const SLIDE_URL = '/Judy/slide.wav';
const GRUNT_URL = '/Judy/grunt.wav';

const STEP_DISTANCE = {
  walk: 0.38 * MAP_SCALE,
  crouchWalk: 0.24 * MAP_SCALE,
  sprint: 0.48 * MAP_SCALE,
  runningJump: 0.42 * MAP_SCALE,
};

const STEP_VOLUME = {
  walk: { base: 0.3, range: 0.15 },
  crouchWalk: { base: 0.06, range: 0.03 },
  sprint: { base: 0.35, range: 0.15 },
  runningJump: { base: 0.3, range: 0.12 },
};

export function createFootsteps(camera) {
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const loader = new THREE.AudioLoader();
  let footstepBuffer = null;
  let slideBuffer = null;
  let gruntBuffer = null;
  let distanceSinceStep = 0;

  loader.load(FOOTSTEP_URL, (audioBuffer) => {
    footstepBuffer = audioBuffer;
  });
  loader.load(SLIDE_URL, (audioBuffer) => {
    slideBuffer = audioBuffer;
  });
  loader.load(GRUNT_URL, (audioBuffer) => {
    gruntBuffer = audioBuffer;
  });

  async function unlockAudio() {
    if (listener.context.state === 'suspended') {
      await listener.context.resume();
    }
  }

  async function playBuffer(buffer, volume, playbackRate = 1) {
    if (!buffer) return;

    await unlockAudio();

    const sound = new THREE.Audio(listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.setPlaybackRate(playbackRate);
    sound.play();
  }

  function playStep(mode) {
    const volumeCfg = STEP_VOLUME[mode];
    if (!footstepBuffer || !volumeCfg) return;

    const volume = volumeCfg.base + Math.random() * volumeCfg.range;
    const playbackRate = 0.92 + Math.random() * 0.16;
    playBuffer(footstepBuffer, volume, playbackRate);
  }

  return {
    reset() {
      distanceSinceStep = 0;
    },

    update(mode, movedDistance) {
      const stepDistance = STEP_DISTANCE[mode];
      if (!stepDistance || movedDistance <= 0) {
        distanceSinceStep = 0;
        return;
      }

      distanceSinceStep += movedDistance;

      while (distanceSinceStep >= stepDistance) {
        distanceSinceStep -= stepDistance;
        playStep(mode);
      }
    },

    playSlide() {
      distanceSinceStep = 0;
      playBuffer(slideBuffer, 0.5);
    },

    playGrunt(jumpMode = 'runningJump') {
      distanceSinceStep = 0;
      if (!gruntBuffer) return;

      const volume = 0.22 + Math.random() * 0.06;
      const playbackRate = 0.97 + Math.random() * 0.06;

      if (jumpMode === 'standingJump') {
        setTimeout(() => playBuffer(gruntBuffer, volume, playbackRate), 340);
      } else {
        playBuffer(gruntBuffer, volume, playbackRate);
      }
    },
  };
}
