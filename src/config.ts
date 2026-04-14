// Global tunables.
//
// ORIENTATION: 480×854 portrait (9:16). This is the canonical game size.
// Mobile plays in portrait natively; desktop gets a centered portrait window.

export const GAME_W = 480;
export const GAME_H = 854;

// Tall tower: the world is GAME_W wide and TOWER_H tall.
export const TOWER_H = 5000;

// Physics tuning — the soul of the rope feel lives here.
//
// ROPE INVARIANT: L/R keys are a pendulum PUMP, not free air steering.
// Gravity drives the swing. The player needs 2-3 full arcs to build height.
//
// TUNNELING PREVENTION: maxSpeed must be less than the thinnest wall (24px).
// Platform thickness in GameScene is 24px; side-walls/floor are 32px.
export const PHYSICS = {
  gravityY: 1.0,
  positionIterations: 14,  // high → constraint is stiffer, less tunneling
  velocityIterations: 10,
  constraintIterations: 6,

  player: {
    mass: 1.0,
    frictionAir: 0.003,   // LOW — swing momentum must persist between arcs
    friction: 0.08,
    restitution: 0.0,
    maxSpeed: 15,         // px/frame — MUST be < platform thickness (24) to prevent tunneling
    // Speed threshold at collision that triggers the Worms-style slide punishment.
    // Below this: gentle landing, player stays in control.
    // Above this: player loses control until velocity reaches ~0.
    slideThreshold: 3.5,
  },

  rope: {
    stiffness: 1.0,       // truly rigid rod (Worms feel); never go below 0.9
    damping: 0.01,        // minimal — pendulum must persist
    reelSpeed: 200,       // px/s
    maxLength: 380,       // px
    minLength: 24,        // px
    fireTravelMs: 110,    // hook-animation time ms
    detachImpulse: 0.010, // jump-off kick on detach
    // Horizontal pump force applied per physics step during swing.
    // INTENTIONALLY TINY: gravity is the engine, not arrow keys.
    swingPump: 0.003,
  },

  aim: {
    // Radians per second when A/D held while rope is IDLE.
    // ~150°/sec — takes ~1.2s to sweep a full 180° arc.
    rotateSpeed: 2.6,
  },
} as const;
