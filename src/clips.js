/** Each animation GLB exports a single in-place clip. */
export function firstClip(animations) {
  if (!animations.length) {
    throw new Error('GLB has no animations');
  }

  return animations[0];
}
