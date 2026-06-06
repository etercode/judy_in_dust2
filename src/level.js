import * as THREE from 'three';
import { createCollision } from './collision.js';
import { MAP_SCALE, SPAWN_POSITION } from './worldScale.js';

const MAP_URL = '/Judy/de_dust2.glb';

export function loadLevel(scene, loader) {
  return new Promise((resolve, reject) => {
    loader.load(
      MAP_URL,
      (gltf) => {
        const map = gltf.scene;
        map.scale.setScalar(MAP_SCALE);

        const box = new THREE.Box3().setFromObject(map);
        map.position.y -= box.min.y;
        map.updateMatrixWorld(true);

        map.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
          }
        });

        scene.add(map);

        const collision = createCollision(map);
        const spawn = SPAWN_POSITION
          ? collision.resolveSpawn(SPAWN_POSITION)
          : collision.findSpawnPoint();

        console.log('Spawn:', spawn.x.toFixed(2), spawn.y.toFixed(2), spawn.z.toFixed(2));

        resolve({ map, collision, spawn });
      },
      undefined,
      reject
    );
  });
}
