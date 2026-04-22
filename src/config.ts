// Global tunables.
//
// ORIENTATION: 480×854 portrait (9:16). This is the canonical game size.
// Mobile plays in portrait natively; desktop gets a centered portrait window.

export const GAME_W = 480;
export const GAME_H = 854;

// World dimensions — wider than viewport to give swing room.
// Camera zooms out to show the full width (zoom = GAME_W / WORLD_W = 0.75).
export const WORLD_W = 640;

// Tall tower: the world is WORLD_W wide and TOWER_H tall.
export const TOWER_H = 5000;

// Physics tuning — defaults for the rope feel.
// These are the starting values; the live tuning panel (press `) and URL
// params can override them at runtime via src/tuning.ts.
//
// TUNNELING PREVENTION: maxSpeed must be less than the thinnest wall (24px).
// Platform thickness in GameScene is 24px; side-walls/floor are 32px.
export const PHYSICS = {
  gravityY: 0.50,
  positionIterations: 14,
  velocityIterations: 10,
  constraintIterations: 10,

  player: {
    mass: 1.0,
    frictionAir: 0.010,
    friction: 0,
    restitution: 0.0,
    maxSpeed: 5,
    slideThreshold: 1.0,
    slideMinDuration: 200,
    floorFriction: 0.98,
  },

  rope: {
    stiffness: 1.0,
    damping: 0.01,
    reelSpeed: 80,
    maxLength: 200,
    minLength: 24,
    fireTravelMs: 110,
    swingPump: 0.0005,
  },

} as const;
