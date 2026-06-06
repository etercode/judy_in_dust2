import { createScene, onResize } from './scene.js';
import { createCharacterLoader, loadCharacter } from './character.js';
import { createLoadingUI } from './ui.js';
import { createInput } from './input.js';
import { createCameraController } from './camera.js';
import { createFootsteps } from './footsteps.js';
import { loadLevel } from './level.js';

const { scene, camera, renderer, controls, timer } = createScene();
const footsteps = createFootsteps(camera);
const { manager, statusEl, clockEl, positionEl } = createLoadingUI();
const loader = createCharacterLoader(manager);
const input = createInput();
const cameraController = createCameraController({
  camera,
  controls,
  input,
  domElement: renderer.domElement,
});

const { collision, spawn } = await loadLevel(scene, loader);

const character = loadCharacter({
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
  onReady: () => timer.reset(),
});

function animate(timestamp) {
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 1 / 30);

  character.update(delta);
  cameraController.update(delta, character.getModel());

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => onResize(camera, renderer));
