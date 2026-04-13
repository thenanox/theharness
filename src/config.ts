// Global tunables. Expect to iterate on the physics numbers constantly during M1.

export const GAME_W = 960;
export const GAME_H = 540;

// Physics tuning — the soul of the rope feel lives here.
export const PHYSICS = {
  gravityY: 1.0,
  positionIterations: 8,
  velocityIterations: 6,
  constraintIterations: 4,

  player: {
    mass: 1.0,
    frictionAir: 0.005,
    friction: 0.02,
    restitution: 0.0,
    maxSpeed: 18, // px/tick — cap so Matter doesn't tunnel
  },

  rope: {
    stiffness: 0.9, // rigid Worms feel; lower = bungee
    damping: 0.05,
    reelSpeed: 250, // px/s
    maxLength: 420, // px
    minLength: 24, // px
    fireTravelMs: 120, // hook-animation time
    detachImpulse: 0.012, // jump-off kick on detach
  },
} as const;
