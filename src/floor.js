import * as THREE from 'three';

export function placeOnFloor(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  box.setFromObject(object);
  return box;
}

export function addFloor(scene, maxDim) {
  const floorSize = Math.max(maxDim * 6, 8);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.95 })
  );
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);

  const grid = new THREE.GridHelper(floorSize, 20, 0x555577, 0x333355);
  grid.position.y = 0.01;
  scene.add(grid);
}
