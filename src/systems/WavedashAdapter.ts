// Thin wrapper over the Wavedash JS SDK.
//
// The SDK is injected by the Wavedash host at runtime as `window.WavedashJS`.
// On itch.io, GitHub Pages, and `vite preview` it isn't present, so every
// method here is wrapped in a `typeof WavedashJS !== 'undefined'` guard and
// no-ops elsewhere — one `dist/` ships to all three platforms.
//
// The SDK surface this module touches is intentionally small:
//   - getUser()                          → { name }
//   - uploadLeaderboardScore({ score })  → Promise<void>
//
// All calls are best-effort: any failure is swallowed and logged once. The
// game must never block on or crash from a missing/erroring leaderboard.
//
// Score convention
// ----------------
// Wavedash leaderboards rank "higher is better" by default (matches the
// CLAUDE.md `bestHeightCm` example). Our scoring is a *time attack* (lower
// is better) so we transform:
//
//   score = max(0, MAX_TIME_MS − bestTimeMs)
//
// A 60 s climb scores 540 000; a 10-minute slog scores 0; ties resolve by
// `keepBest: true`. If we ever ship `bestHeightCm` as the primary metric
// instead, swap `uploadTimeScore` for an `uploadHeightScore` helper.

const MAX_TIME_MS = 600_000; // 10 minutes — a deliberately generous cap.

interface WavedashUser { name?: string }
interface WavedashSDK {
  ready?: () => Promise<void>;
  getUser?: () => Promise<WavedashUser | null> | WavedashUser | null;
  uploadLeaderboardScore?: (opts: { score: number; keepBest?: boolean }) => Promise<void> | void;
}

declare global {
  interface Window {
    WavedashJS?: WavedashSDK;
  }
}

let warnedMissing = false;

function sdk(): WavedashSDK | null {
  if (typeof window === 'undefined') return null;
  const w = window.WavedashJS;
  if (!w) {
    if (!warnedMissing) {
      // eslint-disable-next-line no-console
      console.info('[wavedash] SDK not present — leaderboard disabled (running on itch/Pages).');
      warnedMissing = true;
    }
    return null;
  }
  return w;
}

function timeToScore(bestTimeMs: number): number {
  return Math.max(0, MAX_TIME_MS - Math.round(bestTimeMs));
}

export const Wavedash = {
  /** Cheap "is the SDK around" check for HUD / branching. */
  isAvailable(): boolean {
    return sdk() !== null;
  },

  /**
   * Fetches the current Wavedash user (for HUD player name). Returns null
   * when the SDK isn't there or the call fails.
   */
  async getUserName(): Promise<string | null> {
    const w = sdk();
    if (!w?.getUser) return null;
    try {
      const u = await Promise.resolve(w.getUser());
      const name = u?.name;
      return typeof name === 'string' && name.length > 0 ? name : null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[wavedash] getUser failed', err);
      return null;
    }
  },

  /**
   * Fire-and-forget time score upload. Higher derived score = lower time.
   * Caller doesn't await this — leaderboard sync must never block the
   * win sequence.
   */
  async uploadTimeScore(bestTimeMs: number): Promise<void> {
    const w = sdk();
    if (!w?.uploadLeaderboardScore) return;
    try {
      if (w.ready) await w.ready();
      await Promise.resolve(w.uploadLeaderboardScore({
        score: timeToScore(bestTimeMs),
        keepBest: true,
      }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[wavedash] uploadLeaderboardScore failed', err);
    }
  },
};
