import { PHYSICS } from './config';

// Mutable runtime tuning — initialized from PHYSICS defaults.
// Override via URL params: ?gravityY=1.0&swingPump=0.002
// Or adjust live with the in-game tuning panel (press ` to toggle).
export const TUNING: {
  gravityY: number;
  frictionAir: number;
  maxSpeed: number;
  slideThreshold: number;
  slideMinDuration: number;
  reelSpeed: number;
  maxLength: number;
  detachImpulse: number;
  swingPump: number;
  aimRotateSpeed: number;
} = {
  gravityY: PHYSICS.gravityY,
  frictionAir: PHYSICS.player.frictionAir,
  maxSpeed: PHYSICS.player.maxSpeed,
  slideThreshold: PHYSICS.player.slideThreshold,
  slideMinDuration: PHYSICS.player.slideMinDuration,
  reelSpeed: PHYSICS.rope.reelSpeed,
  maxLength: PHYSICS.rope.maxLength,
  detachImpulse: PHYSICS.rope.detachImpulse,
  swingPump: PHYSICS.rope.swingPump,
  aimRotateSpeed: PHYSICS.aim.rotateSpeed,
};

try {
  const p = new URLSearchParams(window.location.search);
  for (const key of Object.keys(TUNING) as (keyof typeof TUNING)[]) {
    const v = p.get(key);
    if (v !== null && !isNaN(parseFloat(v))) {
      TUNING[key] = parseFloat(v);
    }
  }
} catch { /* SSR / test safe */ }
