// Global tunables. Expect to iterate on the physics numbers constantly during M1.
//
// ORIENTATION: 480×854 portrait (9:16). This is the canonical game size.
// Mobile plays in portrait natively; desktop gets a centered portrait window.

export const GAME_W = 480;
export const GAME_H = 854;

// Tall tower: the world is GAME_W wide and TOWER_H tall.
// At 854px viewport, this gives roughly 5+ screens of vertical climbing.
export const TOWER_H = 5000;

// Physics tuning — the soul of the rope feel lives here.
//
// ROPE INVARIANT: L/R keys are a pendulum PUMP, not free air steering.
// Gravity drives the swing. The player needs 2-3 full arcs to build height.
// If "just pressing arrow = all strength", swingPump is too large.
export const PHYSICS = {
  gravityY: 1.0,
  positionIterations: 10,  // more → constraint feels stiffer (important for Worms feel)
  velocityIterations: 8,
  constraintIterations: 6,

  player: {
    mass: 1.0,
    frictionAir: 0.003,  // LOW — swing momentum must persist between arcs
    friction: 0.08,
    restitution: 0.0,
    maxSpeed: 30,         // raised — don't kill pendulum at peak speed
  },

  rope: {
    stiffness: 1.0,       // truly rigid rod (Worms feel); never go below 0.9
    damping: 0.01,        // minimal — pendulum must persist
    reelSpeed: 200,       // px/s
    maxLength: 380,       // px — matches portrait world width
    minLength: 24,        // px
    fireTravelMs: 110,    // hook-animation time ms
    detachImpulse: 0.010, // jump-off kick on detach
    // Horizontal pump force applied per physics step during swing.
    // INTENTIONALLY TINY: gravity is the engine, not arrow keys.
    swingPump: 0.003,
  },
} as const;
