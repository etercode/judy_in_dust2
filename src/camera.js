import * as THREE from 'three';
import { JUDY_SCALE } from './worldScale.js';

const TPP_DISTANCE = 2.4 * JUDY_SCALE;
const TPP_LOOK_HEIGHT = 1.1 * JUDY_SCALE;
const TPP_SMOOTH = 12;
const MIN_PITCH = -0.35;
const MAX_PITCH = Math.PI / 2 - 0.05;
const MOUSE_SENSITIVITY = 0.002;

const pivot = new THREE.Vector3();
const offset = new THREE.Vector3();
const idealPos = new THREE.Vector3();
export function createCameraController({ camera, controls, input, domElement }) {
  let orbitEnabled = input.isOrbitEnabled();
  let noclipWas = input.isNoclipEnabled();
  let anglesSynced = false;
  let yaw = 0;
  let pitch = 0.35;

  controls.enabled = orbitEnabled;

  function clampPitch() {
    pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
  }

  function syncAnglesFromCamera(target) {
    pivot.copy(target.position);
    pivot.y += TPP_LOOK_HEIGHT;

    offset.copy(camera.position).sub(pivot);
    const flatDist = Math.hypot(offset.x, offset.z) || TPP_DISTANCE;
    yaw = Math.atan2(-offset.x, -offset.z);
    pitch = Math.atan2(offset.y, flatDist);
    clampPitch();
  }

  function exitPointerLock() {
    if (document.pointerLockElement === domElement) {
      document.exitPointerLock();
    }
  }

  function onMouseMove(event) {
    if (orbitEnabled || document.pointerLockElement !== domElement) return;

    yaw -= event.movementX * MOUSE_SENSITIVITY;
    pitch += event.movementY * MOUSE_SENSITIVITY;
    clampPitch();
  }

  function onClick() {
    domElement.focus();
    if (!orbitEnabled) {
      domElement.requestPointerLock();
    }
  }

  domElement.addEventListener('click', onClick);
  document.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    update(delta, target) {
      const nextOrbitEnabled = input.isOrbitEnabled();
      const noclip = input.isNoclipEnabled();

      if (noclip !== noclipWas) {
        if (target) {
          syncAnglesFromCamera(target);
        }
        noclipWas = noclip;
      }

      if (nextOrbitEnabled !== orbitEnabled) {
        orbitEnabled = nextOrbitEnabled;
        controls.enabled = orbitEnabled;

        if (orbitEnabled) {
          exitPointerLock();
          if (target) {
            pivot.copy(target.position);
            pivot.y += TPP_LOOK_HEIGHT;
            controls.target.copy(pivot);
          }
        } else if (target) {
          syncAnglesFromCamera(target);
          anglesSynced = true;
        }
      }

      if (orbitEnabled) {
        controls.update();
        return;
      }

      if (!target) return;

      if (!anglesSynced) {
        syncAnglesFromCamera(target);
        anglesSynced = true;
      }

      pivot.copy(target.position);
      pivot.y += TPP_LOOK_HEIGHT;

      const t = 1 - Math.exp(-TPP_SMOOTH * delta);

      const hDist = TPP_DISTANCE * Math.cos(pitch);
      offset.set(
        -Math.sin(yaw) * hDist,
        TPP_DISTANCE * Math.sin(pitch),
        -Math.cos(yaw) * hDist
      );

      idealPos.copy(pivot).add(offset);
      camera.position.lerp(idealPos, t);
      camera.lookAt(pivot);
    },
  };
}
