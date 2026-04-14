/**
 * Rope mechanic tests — RopeStateMachine
 *
 * These tests protect the most critical mechanic in the game.
 * Run with: npm test  (vitest watch)
 *       or: npm run test:run  (CI single pass)
 *
 * See CLAUDE.md § "Rope tests are mandatory" for the invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RopeStateMachine } from '../src/entities/RopeStateMachine';
import type { RopeConfig, PhysicsBody } from '../src/entities/RopeStateMachine';

// ── Test fixtures ───────────────────────────────────────────────────────────

const BASE_CFG: RopeConfig = {
  stiffness: 1.0,
  damping: 0.01,
  reelSpeed: 200,   // px/s
  maxLength: 380,
  minLength: 24,
  detachImpulse: 0.010,
};

function makeBody(x: number, y: number): PhysicsBody {
  return { position: { x, y } };
}

// Helper: build a machine in SWINGING state from a known geometry.
// Player at (100, 300), anchor body at (100, 100) → rope points straight up.
function makeSwinging(cfg = BASE_CFG): { sm: RopeStateMachine; playerPos: { x: number; y: number } } {
  const sm = new RopeStateMachine(cfg);
  const body = makeBody(100, 100);
  const playerPos = { x: 100, y: 300 };
  sm.startFire();
  sm.attach(playerPos, { x: 100, y: 100 }, body);
  return { sm, playerPos };
}

// ── State machine ───────────────────────────────────────────────────────────

describe('State machine', () => {
  it('starts in IDLE', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    expect(sm.state).toBe('IDLE');
    expect(sm.anchor).toBeNull();
  });

  it('transitions IDLE → FIRING on startFire', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    sm.startFire();
    expect(sm.state).toBe('FIRING');
  });

  it('transitions FIRING → SWINGING on attach', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    sm.startFire();
    sm.attach({ x: 0, y: 200 }, { x: 0, y: 0 }, makeBody(0, 0));
    expect(sm.state).toBe('SWINGING');
  });

  it('transitions SWINGING → IDLE on detach', () => {
    const { sm } = makeSwinging();
    sm.detach();
    expect(sm.state).toBe('IDLE');
  });

  it('detach from IDLE is a no-op (stays IDLE)', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    sm.detach();
    expect(sm.state).toBe('IDLE');
  });

  it('detach clears the anchor', () => {
    const { sm } = makeSwinging();
    expect(sm.anchor).not.toBeNull();
    sm.detach();
    expect(sm.anchor).toBeNull();
  });

  it('refire: startFire while in SWINGING is allowed (Rope.ts cleans constraint first)', () => {
    // The state machine does not prevent re-fire; that policy lives in GameScene.
    // But calling detach() followed by startFire() correctly cycles state.
    const { sm } = makeSwinging();
    sm.detach();
    sm.startFire();
    expect(sm.state).toBe('FIRING');
  });
});

// ── Attach geometry ─────────────────────────────────────────────────────────

describe('Attach geometry', () => {
  it('records localOffset correctly', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    const body = makeBody(50, 80);
    sm.startFire();
    sm.attach({ x: 100, y: 300 }, { x: 80, y: 100 }, body);
    // localOffset = hitPoint − body.position
    expect(sm.anchor!.localOffset.x).toBeCloseTo(30);
    expect(sm.anchor!.localOffset.y).toBeCloseTo(20);
  });

  it('sets initial length = distance from player to hit point', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    const body = makeBody(0, 0);
    // Player at (0, 300), hit at (0, 100) → distance = 200
    sm.startFire();
    sm.attach({ x: 0, y: 300 }, { x: 0, y: 100 }, body);
    expect(sm.length).toBeCloseTo(200);
  });

  it('calculates diagonal length correctly', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    const body = makeBody(0, 0);
    // Player at (0, 0), hit at (300, 400) → hypotenuse = 500
    sm.startFire();
    sm.attach({ x: 0, y: 0 }, { x: 300, y: 400 }, body);
    expect(sm.length).toBeCloseTo(500);
  });
});

// ── Anchor world position ───────────────────────────────────────────────────

describe('anchorWorld()', () => {
  it('returns null when not SWINGING', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    expect(sm.anchorWorld()).toBeNull();
  });

  it('returns null in FIRING state (no anchor yet)', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    sm.startFire();
    expect(sm.anchorWorld()).toBeNull();
  });

  it('returns correct world position after attach', () => {
    const body = makeBody(50, 80);
    const sm = new RopeStateMachine(BASE_CFG);
    sm.startFire();
    // hitPoint = (80, 100), body.position = (50, 80) → localOffset = (30, 20)
    sm.attach({ x: 200, y: 300 }, { x: 80, y: 100 }, body);
    const aw = sm.anchorWorld();
    expect(aw).not.toBeNull();
    expect(aw!.x).toBeCloseTo(80); // 50 + 30
    expect(aw!.y).toBeCloseTo(100); // 80 + 20
  });

  it('updates when body moves (dynamic anchor)', () => {
    const body = makeBody(50, 80);
    const sm = new RopeStateMachine(BASE_CFG);
    sm.startFire();
    sm.attach({ x: 200, y: 300 }, { x: 80, y: 100 }, body);

    // Simulate body moving.
    (body as { position: { x: number; y: number } }).position = { x: 60, y: 90 };

    const aw = sm.anchorWorld();
    // world = body.position + localOffset = (60+30, 90+20) = (90, 110)
    expect(aw!.x).toBeCloseTo(90);
    expect(aw!.y).toBeCloseTo(110);
  });
});

// ── Reel length ─────────────────────────────────────────────────────────────

describe('reelLength()', () => {
  it('decreases length on reelUp', () => {
    const { sm } = makeSwinging();
    const before = sm.length; // 200
    sm.reelLength(true, false, 0.5); // 0.5s × 200 px/s = 100
    expect(sm.length).toBeCloseTo(before - 100);
  });

  it('increases length on reelDown', () => {
    const { sm } = makeSwinging();
    const before = sm.length; // 200
    sm.reelLength(false, true, 0.25); // 0.25s × 200 px/s = 50
    expect(sm.length).toBeCloseTo(before + 50);
  });

  it('clamps reelUp to minLength', () => {
    const { sm } = makeSwinging();
    // Reel in hard for a long time — should clamp at minLength.
    sm.reelLength(true, false, 999);
    expect(sm.length).toBe(BASE_CFG.minLength);
  });

  it('clamps reelDown to maxLength', () => {
    const { sm } = makeSwinging();
    // Reel out hard for a long time — should clamp at maxLength.
    sm.reelLength(false, true, 999);
    expect(sm.length).toBe(BASE_CFG.maxLength);
  });

  it('does nothing when neither reelUp nor reelDown', () => {
    const { sm } = makeSwinging();
    const before = sm.length;
    sm.reelLength(false, false, 1.0);
    expect(sm.length).toBe(before);
  });

  it('is a no-op when not SWINGING (IDLE)', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    sm.reelLength(true, false, 1.0);
    expect(sm.length).toBe(0); // never changed from initial
  });

  it('is a no-op when not SWINGING (FIRING)', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    sm.startFire();
    sm.reelLength(true, false, 1.0);
    expect(sm.length).toBe(0);
  });

  it('returns the new length', () => {
    const { sm } = makeSwinging();
    const result = sm.reelLength(true, false, 0.1);
    expect(result).toBe(sm.length);
  });

  it('simultaneous reelUp + reelDown: both cancel — net should not matter but clamps hold', () => {
    // Both true: reelUp runs, then reelDown runs in that order.
    // The result should still be within [minLength, maxLength].
    const { sm } = makeSwinging();
    sm.reelLength(true, true, 999);
    expect(sm.length).toBeGreaterThanOrEqual(BASE_CFG.minLength);
    expect(sm.length).toBeLessThanOrEqual(BASE_CFG.maxLength);
  });
});

// ── Detach impulse ──────────────────────────────────────────────────────────

describe('calcDetachImpulse()', () => {
  it('returns null when not SWINGING', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    expect(sm.calcDetachImpulse({ x: 0, y: 0 })).toBeNull();
  });

  it('returns null in FIRING state', () => {
    const sm = new RopeStateMachine(BASE_CFG);
    sm.startFire();
    expect(sm.calcDetachImpulse({ x: 0, y: 0 })).toBeNull();
  });

  it('returns null after detach', () => {
    const { sm, playerPos } = makeSwinging();
    sm.detach();
    expect(sm.calcDetachImpulse(playerPos)).toBeNull();
  });

  it('force direction is away from anchor (positive dot with rope direction)', () => {
    // Player at (100, 300), anchor at (100, 100) → rope points down from anchor
    // i.e. player-to-anchor = (0, -200). Impulse should push AWAY: (0, +something).
    const { sm, playerPos } = makeSwinging();
    const f = sm.calcDetachImpulse(playerPos)!;

    const aw = sm.anchorWorld()!;
    const ropeDir = { x: playerPos.x - aw.x, y: playerPos.y - aw.y }; // player − anchor
    const dot = f.x * ropeDir.x + f.y * ropeDir.y;
    // Positive dot = force has a component away from anchor.
    expect(dot).toBeGreaterThan(0);
  });

  it('detach impulse has an upward component (fy < 0) when player is at the apex (side of arc)', () => {
    // "Apex release" geometry: player is to the SIDE of the anchor at the same
    // height (3 o'clock position in a pendulum swing). The radial force has no
    // vertical component there, so the upward bias (−k×0.5) dominates → fy < 0.
    // This is the moment a skilled player should detach to fling themselves up.
    const sm = new RopeStateMachine(BASE_CFG);
    const body = makeBody(100, 200); // anchor body at (100, 200)
    sm.startFire();
    // Player to the RIGHT of the anchor at the same height → apex of the leftward arc.
    sm.attach({ x: 300, y: 200 }, { x: 100, y: 200 }, body);

    const apexPlayerPos = { x: 300, y: 200 };
    const f = sm.calcDetachImpulse(apexPlayerPos)!;
    // dy = 0, so radial-y = 0, only the upward bias remains: fy = 0 − k×0.5 < 0.
    expect(f.y).toBeLessThan(0);
  });

  it('magnitude is proportional to config.detachImpulse', () => {
    const cfg2x: RopeConfig = { ...BASE_CFG, detachImpulse: BASE_CFG.detachImpulse * 2 };
    const { sm: sm1, playerPos: pp1 } = makeSwinging(BASE_CFG);
    const { sm: sm2, playerPos: pp2 } = makeSwinging(cfg2x);

    const f1 = sm1.calcDetachImpulse(pp1)!;
    const f2 = sm2.calcDetachImpulse(pp2)!;

    const mag1 = Math.hypot(f1.x, f1.y);
    const mag2 = Math.hypot(f2.x, f2.y);
    expect(mag2).toBeCloseTo(mag1 * 2, 5);
  });

  it('force vector direction is consistent with 45-degree rope angle', () => {
    // Player at (200, 300), anchor at (100, 200) → rope = (100, 100), length ≈141
    const sm = new RopeStateMachine(BASE_CFG);
    const body = makeBody(100, 200);
    sm.startFire();
    sm.attach({ x: 200, y: 300 }, { x: 100, y: 200 }, body);

    const playerPos = { x: 200, y: 300 };
    const f = sm.calcDetachImpulse(playerPos)!;
    const aw = sm.anchorWorld()!;

    const ropeDir = { x: playerPos.x - aw.x, y: playerPos.y - aw.y };
    const ropeMag = Math.hypot(ropeDir.x, ropeDir.y);
    const ropeNorm = { x: ropeDir.x / ropeMag, y: ropeDir.y / ropeMag };

    const fMag = Math.hypot(f.x, f.y);
    const fNorm = { x: f.x / fMag, y: f.y / fMag };

    // The radial component of fNorm should align with ropeNorm (allow upward bias).
    // At minimum, fx/fy ratio should be consistent: fx proportional to dx.
    expect(fNorm.x).toBeGreaterThan(0); // pushing right (away from anchor)
  });
});

// ── Config boundary cases ────────────────────────────────────────────────────

describe('Config edge cases', () => {
  it('minLength === maxLength: reel is a no-op', () => {
    const cfg: RopeConfig = { ...BASE_CFG, minLength: 100, maxLength: 100 };
    const sm = new RopeStateMachine(cfg);
    const body = makeBody(0, 0);
    sm.startFire();
    sm.attach({ x: 0, y: 100 }, { x: 0, y: 0 }, body);
    sm.reelLength(true, false, 1.0);
    expect(sm.length).toBe(100);
    sm.reelLength(false, true, 1.0);
    expect(sm.length).toBe(100);
  });

  it('zero detachImpulse returns a zero vector', () => {
    const cfg: RopeConfig = { ...BASE_CFG, detachImpulse: 0 };
    const { sm, playerPos } = makeSwinging(cfg);
    const f = sm.calcDetachImpulse(playerPos)!;
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(0);
  });
});
