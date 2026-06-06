import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { MAP_SCALE, JUDY_SCALE, JUMP_SPEED } from './worldScale.js';

if (!THREE.BufferGeometry.prototype.computeBoundsTree) {
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
}

THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Player capsule must match Judy's actual rendered size (JUDY_SCALE), NOT the
// map scale. The map is scaled up by MAP_SCALE, but Judy stays ~1.7 units tall,
// so tunnels/doors are sized for a ~1.7-unit human. A MAP_SCALE-sized capsule
// would be ~5x too big and could not fit through them.
const PLAYER_SCALE = JUDY_SCALE;

const PLAYER_RADIUS = 0.28 * PLAYER_SCALE;
const PLAYER_HEIGHT = 1.7 * PLAYER_SCALE;
const GROUND_EPSILON = 0.04 * PLAYER_SCALE;
const GROUNDED_THRESHOLD = 0.3 * PLAYER_SCALE;
const MOVE_SUBSTEP = PLAYER_RADIUS * 0.5;

// Dynamics stay tuned to MAP_SCALE for game feel.
const GRAVITY = -28 * MAP_SCALE;
const JUMP_VELOCITY = JUMP_SPEED * MAP_SCALE;
const MAX_PHYSICS_DELTA = 1 / 30;

const CT_SPAWN_GRID = {
  xMin: 0.08,
  xMax: 0.26,
  zMin: 0.38,
  zMax: 0.72,
  xSteps: 5,
  zSteps: 5,
};

const origin = new THREE.Vector3();
const downDir = new THREE.Vector3(0, -1, 0);
const size = new THREE.Vector3();
const worldNormal = new THREE.Vector3();

const segment = new THREE.Line3();
const triPoint = new THREE.Vector3();
const capsulePoint = new THREE.Vector3();
const pushDir = new THREE.Vector3();
const deltaVector = new THREE.Vector3();
const capsuleBox = new THREE.Box3();
const prePos = new THREE.Vector3();

function surfaceNormalY(hit) {
  if (hit.normal) return hit.normal.y;
  if (!hit.face) return 1;
  worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
  return worldNormal.y;
}

function isFloorHit(hit) {
  return surfaceNormalY(hit) > 0.42;
}

function isCeilingHit(hit) {
  return surfaceNormalY(hit) < -0.42;
}

// Merge every map mesh into a single world-space geometry so all collision
// queries run in world coordinates without per-mesh scale/transform math.
function buildColliderGeometry(root) {
  root.updateMatrixWorld(true);

  const positions = [];
  const vertex = new THREE.Vector3();

  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    const geometry = child.geometry;
    const posAttr = geometry.attributes.position;
    if (!posAttr) return;

    const matrix = child.matrixWorld;
    const index = geometry.index;

    if (index) {
      for (let i = 0; i < index.count; i++) {
        vertex.fromBufferAttribute(posAttr, index.getX(i)).applyMatrix4(matrix);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        vertex.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    }
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  merged.computeBoundsTree();
  return merged;
}

export function createCollision(map) {
  map.updateMatrixWorld(true);

  const colliderGeometry = buildColliderGeometry(map);
  const colliderMesh = new THREE.Mesh(colliderGeometry);
  colliderMesh.updateMatrixWorld(true);
  const bvh = colliderGeometry.boundsTree;

  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;

  const mapBox = new THREE.Box3().setFromObject(map);
  mapBox.getSize(size);

  const triCount = colliderGeometry.attributes.position.count / 3;
  console.log(`Collision: ${triCount | 0} triangles`);

  function castRay(from, dir, far) {
    raycaster.set(from, dir);
    raycaster.far = far;
    const hits = raycaster.intersectObject(colliderMesh, false);
    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  function getGroundBelow(position, maxDistance) {
    origin.set(position.x, position.y + 0.35, position.z);
    const hits = castRay(origin, downDir, maxDistance);

    for (const hit of hits) {
      if (isFloorHit(hit)) return hit;
    }
    return hits[0] ?? null;
  }

  function sampleGround(x, z) {
    origin.set(x, mapBox.max.y + 10, z);
    const hits = castRay(origin, downDir, mapBox.max.y - mapBox.min.y + 20);
    const hit = hits.find(isFloorHit) ?? hits[0];
    return hit?.point ?? null;
  }

  function isGrounded(position) {
    const hit = getGroundBelow(position, GROUNDED_THRESHOLD + 0.75);
    if (!hit) return false;
    return position.y - hit.point.y <= GROUNDED_THRESHOLD + GROUND_EPSILON;
  }

  // Resolve the player capsule against the collision mesh, pushing it out of
  // any penetrating triangles. Returns the net push-out vector via deltaVector.
  function resolveCapsule(position) {
    segment.start.set(position.x, position.y + PLAYER_RADIUS, position.z);
    segment.end.set(
      position.x,
      position.y + PLAYER_HEIGHT - PLAYER_RADIUS,
      position.z
    );

    capsuleBox.makeEmpty();
    capsuleBox.expandByPoint(segment.start);
    capsuleBox.expandByPoint(segment.end);
    capsuleBox.min.addScalar(-PLAYER_RADIUS);
    capsuleBox.max.addScalar(PLAYER_RADIUS);

    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(capsuleBox),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(
          segment,
          triPoint,
          capsulePoint
        );

        if (distance < PLAYER_RADIUS) {
          const depth = PLAYER_RADIUS - distance;
          pushDir.subVectors(capsulePoint, triPoint);
          if (pushDir.lengthSq() < 1e-10) return false;
          pushDir.normalize();

          segment.start.addScaledVector(pushDir, depth);
          segment.end.addScaledVector(pushDir, depth);
        }

        return false;
      },
    });

    const resolvedX = segment.start.x;
    const resolvedY = segment.start.y - PLAYER_RADIUS;
    const resolvedZ = segment.start.z;

    deltaVector.set(
      resolvedX - position.x,
      resolvedY - position.y,
      resolvedZ - position.z
    );
  }

  function findSpawnPoint() {
    let best = null;
    let bestFlatness = -1;

    const xStep = (CT_SPAWN_GRID.xMax - CT_SPAWN_GRID.xMin) / (CT_SPAWN_GRID.xSteps - 1);
    const zStep = (CT_SPAWN_GRID.zMax - CT_SPAWN_GRID.zMin) / (CT_SPAWN_GRID.zSteps - 1);

    for (let xi = 0; xi < CT_SPAWN_GRID.xSteps; xi++) {
      for (let zi = 0; zi < CT_SPAWN_GRID.zSteps; zi++) {
        const xFrac = CT_SPAWN_GRID.xMin + xStep * xi;
        const zFrac = CT_SPAWN_GRID.zMin + zStep * zi;
        const x = mapBox.min.x + size.x * xFrac;
        const z = mapBox.min.z + size.z * zFrac;
        const ground = sampleGround(x, z);

        if (!ground) continue;

        const flatness = surfaceNormalY(
          getGroundBelow(
            new THREE.Vector3(ground.x, ground.y + GROUND_EPSILON, ground.z),
            1
          ) ?? { normal: { y: 1 } }
        );

        if (flatness > bestFlatness) {
          bestFlatness = flatness;
          best = new THREE.Vector3(ground.x, ground.y + GROUND_EPSILON, ground.z);
        }
      }
    }

    if (best) return best;

    const x = mapBox.min.x + size.x * 0.18;
    const z = mapBox.min.z + size.z * 0.55;
    const fallback = sampleGround(x, z);
    if (fallback) {
      return new THREE.Vector3(fallback.x, fallback.y + GROUND_EPSILON, fallback.z);
    }

    const centerX = mapBox.min.x + size.x * 0.5;
    const centerZ = mapBox.min.z + size.z * 0.5;
    const centerGround = sampleGround(centerX, centerZ);
    if (centerGround) {
      return new THREE.Vector3(
        centerGround.x,
        centerGround.y + GROUND_EPSILON,
        centerGround.z
      );
    }

    return new THREE.Vector3(centerX, mapBox.max.y + 8, centerZ);
  }

  function snapToGround(position) {
    const ground = sampleGround(position.x, position.z);
    if (!ground) return false;

    position.set(ground.x, ground.y + GROUND_EPSILON, ground.z);
    return true;
  }

  function placeOnSpawn(position) {
    origin.set(position.x, position.y + 2, position.z);
    const hits = castRay(origin, downDir, 40);

    let hit = null;
    for (const candidate of hits) {
      if (!isFloorHit(candidate)) continue;
      if (candidate.point.y <= position.y + 0.5) {
        hit = candidate;
        break;
      }
    }

    if (!hit) hit = hits.find(isFloorHit) ?? null;
    if (!hit) return false;

    position.y = hit.point.y + GROUND_EPSILON;
    return true;
  }

  function resolveSpawn(preferred) {
    return new THREE.Vector3(preferred.x, preferred.y, preferred.z);
  }

  function recoverFromFall(position) {
    if (position.y > mapBox.min.y - 10) return false;
    placeOnSpawn(position);
    return true;
  }

  function step(position, velocityY, delta, moveDirection = null, moveDistance = 0) {
    delta = Math.min(delta, MAX_PHYSICS_DELTA);

    let nextVelocityY = velocityY + GRAVITY * delta;
    const verticalMove = nextVelocityY * delta;
    const horizontalMove = moveDirection && moveDistance > 0 ? moveDistance : 0;

    // Sub-step the whole motion so no single move exceeds the capsule radius,
    // which prevents tunneling through floors/walls during fast falls.
    const totalMove = Math.abs(verticalMove) + horizontalMove;
    const subCount = Math.max(1, Math.ceil(totalMove / (PLAYER_RADIUS * 0.5)));

    let grounded = false;
    let hitCeiling = false;

    for (let i = 0; i < subCount; i++) {
      if (horizontalMove > 0) {
        position.x += (moveDirection.x * horizontalMove) / subCount;
        position.z += (moveDirection.z * horizontalMove) / subCount;
      }
      position.y += verticalMove / subCount;

      prePos.copy(position);
      resolveCapsule(position);

      const offset = Math.max(0, deltaVector.length() - 1e-5);
      if (offset > 0) {
        deltaVector.normalize().multiplyScalar(offset);
        position.add(deltaVector);
      }

      const pushThreshold = Math.abs(verticalMove / subCount) * 0.25;
      if (deltaVector.y > pushThreshold) {
        grounded = true;
      }
      if (deltaVector.y < -1e-4) {
        hitCeiling = true;
      }
    }

    if (grounded && nextVelocityY < 0) {
      nextVelocityY = 0;
    }
    if (hitCeiling && nextVelocityY > 0) {
      nextVelocityY = 0;
    }

    if (recoverFromFall(position)) {
      nextVelocityY = 0;
    }

    return {
      velocityY: nextVelocityY,
      grounded,
    };
  }

  return {
    findSpawnPoint,
    resolveSpawn,
    snapToGround,
    placeOnSpawn,
    step,
    isGrounded,
    getJumpVelocity() {
      return JUMP_VELOCITY;
    },
  };
}
