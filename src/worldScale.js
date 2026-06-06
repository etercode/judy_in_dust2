// de_dust2 GLB is much smaller than Judy — scale map to human-sized units.
// Too low = Judy looks giant. Too high = Judy looks like an ant.
export const MAP_SCALE = 5;

// Fine-tune Judy size on top of map scale (1 = default).
export const JUDY_SCALE = 1;

// Movement tuning (multiplied by MAP_SCALE where noted in code).
export const WALK_SPEED = 0.7;
export const CROUCH_WALK_SPEED = 0.4;
export const SPRINT_SPEED = 1.4;
export const JUMP_SPEED = 2.5;
export const NOCLIP_VERTICAL_SPEED = 0.9;

// Set after reading position from the HUD (Noclip + Numpad 1). null = auto spawn.
// Example: { x: 12.34, y: 1.02, z: -8.90 }
export const SPAWN_POSITION = { x: -21.66, y: 16.58, z: 70.58 };
