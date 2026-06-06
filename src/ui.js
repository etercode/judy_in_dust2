import * as THREE from 'three';

export function createLoadingUI() {
  const loadingEl = document.querySelector('#loading');
  const progressEl = document.querySelector('#progress');
  const statusEl = document.querySelector('#status');
  const clockEl = document.querySelector('#clock');
  const positionEl = document.querySelector('#position');

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    progressEl.textContent = `${((loaded / total) * 100) | 0}%`;
  };
  manager.onLoad = () => {
    loadingEl.style.display = 'none';
    document.querySelector('#info').style.display = 'block';
  };
  manager.onError = (url) => {
    loadingEl.textContent = `Failed to load ${url}`;
  };

  return { manager, statusEl, clockEl, positionEl };
}
