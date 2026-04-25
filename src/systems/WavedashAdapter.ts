// Thin wrapper over the Wavedash JS SDK.
//
// The SDK is injected by the Wavedash host at runtime as `window.Wavedash`
// (Promise) or `window.WavedashJS` (older docs/examples). On itch.io, GitHub
// Pages, and `vite preview` it isn't present, so every method here is guarded
// and no-ops elsewhere — one `dist/` ships to all three platforms.
//
// The SDK surface this module touches is intentionally small:
//   - updateLoadProgressZeroToOne(...)
//   - init(...)                          → removes the Wavedash loading screen
//   - getUser()/getUsername()            → HUD name
//   - getOrCreateLeaderboard(...) + uploadLeaderboardScore(...)
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
interface WavedashUser { name?: string; username?: string }
interface WavedashResponse<T> {
  success: boolean;
  data: T | null;
  message?: string;
}
interface WavedashLeaderboard { id: string }
interface WavedashSDK {
  ready?: () => Promise<void>;
  init?: (config?: { debug?: boolean; deferEvents?: boolean }) => boolean;
  readyForEvents?: () => void;
  updateLoadProgressZeroToOne?: (progress: number) => void;
  loadComplete?: () => void;
  getUser?: () => Promise<WavedashUser | null> | WavedashUser | null;
  getUsername?: () => string | null;
  getOrCreateLeaderboard?: (
    name: string,
    sortOrder: number,
    displayType: number,
  ) => Promise<WavedashResponse<WavedashLeaderboard>> | WavedashResponse<WavedashLeaderboard>;
  uploadLeaderboardScore?: (
    leaderboardId: string,
    score: number,
    keepBest: boolean,
  ) => Promise<WavedashResponse<{ globalRank: number }> | void> | WavedashResponse<{ globalRank: number }> | void;
}

declare global {
  interface Window {
    Wavedash?: WavedashSDK | Promise<WavedashSDK>;
    WavedashJS?: WavedashSDK | Promise<WavedashSDK>;
  }
}

let warnedMissing = false;
let sdkPromise: Promise<WavedashSDK | null> | null = null;
let initStarted = false;

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function sdkSource(): WavedashSDK | Promise<WavedashSDK> | null {
  if (typeof window === 'undefined') return null;
  return window.Wavedash ?? window.WavedashJS ?? null;
}

function sdkSync(): WavedashSDK | null {
  const source = sdkSource();
  if (!source || isPromiseLike<WavedashSDK>(source)) return null;
  return source;
}

async function sdk(): Promise<WavedashSDK | null> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const source = sdkSource();
    if (!source) {
      if (!warnedMissing) {
        // eslint-disable-next-line no-console
        console.info('[wavedash] SDK not present — platform features disabled (running on itch/Pages).');
        warnedMissing = true;
      }
      return null;
    }
    try {
      return await Promise.resolve(source);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[wavedash] SDK injection failed', err);
      return null;
    }
  })();
  return sdkPromise;
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, progress));
}

async function withSDK(fn: (w: WavedashSDK) => void | Promise<void>): Promise<void> {
  const w = await sdk();
  if (!w) return;
  try {
    await fn(w);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[wavedash] SDK call failed', err);
  }
}

function legacyUpload(
  w: WavedashSDK,
  score: number,
): Promise<unknown> | unknown {
  const upload = w.uploadLeaderboardScore as unknown as
    | ((opts: { score: number; keepBest?: boolean }) => Promise<unknown> | unknown)
    | undefined;
  return upload?.({ score, keepBest: true });
}

function isWavedashPresent(): boolean {
  const source = sdkSource();
  if (!source) {
    if (!warnedMissing) {
      // eslint-disable-next-line no-console
      console.info('[wavedash] SDK not present — platform features disabled (running on itch/Pages).');
      warnedMissing = true;
    }
    return false;
  }
  return true;
}

function timeToScore(bestTimeMs: number): number {
  return Math.max(0, MAX_TIME_MS - Math.round(bestTimeMs));
}

export const Wavedash = {
  /** Cheap "is the SDK around" check for HUD / branching. */
  isAvailable(): boolean {
    return isWavedashPresent();
  },

  /**
   * Updates the Wavedash shell loading bar. Safe to call before the injected
   * SDK Promise has resolved; it will replay once available.
   */
  reportLoadProgress(progress: number): void {
    const value = clampProgress(progress);
    const w = sdkSync();
    if (w?.updateLoadProgressZeroToOne) {
      w.updateLoadProgressZeroToOne(value);
      return;
    }
    void withSDK((asyncSdk) => { asyncSdk.updateLoadProgressZeroToOne?.(value); });
  },

  /**
   * Required on Wavedash. Their host keeps the game hidden behind the loading
   * screen until init() or loadComplete() fires. No-ops on itch/GitHub Pages.
   */
  initOnce(): void {
    if (initStarted) return;
    initStarted = true;
    void withSDK(async (w) => {
      if (w.ready) await w.ready();
      w.updateLoadProgressZeroToOne?.(1);
      if (w.init) {
        w.init({ debug: false });
      } else {
        w.loadComplete?.();
        w.readyForEvents?.();
      }
    });
  },

  /**
   * Fetches the current Wavedash user (for HUD player name). Returns null
   * when the SDK isn't there or the call fails.
   */
  async getUserName(): Promise<string | null> {
    const w = await sdk();
    if (!w) return null;
    try {
      if (w.getUsername) {
        const username = w.getUsername();
        if (typeof username === 'string' && username.length > 0) return username;
      }
      if (!w.getUser) return null;
      const u = await Promise.resolve(w.getUser());
      const name = u?.name ?? u?.username;
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
    const w = await sdk();
    if (!w?.uploadLeaderboardScore) return;
    try {
      if (w.ready) await w.ready();
      const score = timeToScore(bestTimeMs);
      if (w.getOrCreateLeaderboard) {
        const board = await Promise.resolve(w.getOrCreateLeaderboard('best-time', 1, 0));
        if (board.success && board.data?.id) {
          await Promise.resolve(w.uploadLeaderboardScore(board.data.id, score, true));
          return;
        }
      }
      await Promise.resolve(legacyUpload(w, score));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[wavedash] uploadLeaderboardScore failed', err);
    }
  },
};
