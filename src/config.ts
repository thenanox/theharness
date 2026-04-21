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
  gravityY: 1.2,
  positionIterations: 14,
  velocityIterations: 10,
  constraintIterations: 6,

  player: {
    mass: 1.0,
    frictionAir: 0.004,
    friction: 0,
    restitution: 0.0,
    maxSpeed: 12,
    slideThreshold: 3.0,
    slideMinDuration: 1200,
  },

  rope: {
    stiffness: 1.0,
    damping: 0.01,
    reelSpeed: 220,
    maxLength: 360,
    minLength: 24,
    fireTravelMs: 110,
    detachImpulse: 0.008,
    swingPump: 0.0015,
  },

  aim: {
    rotateSpeed: 2.6,
  },
} as const;
