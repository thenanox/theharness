// Versioned localStorage schema. Single key, single JSON blob, additive
// migrations. Anything outside this module that persists run state should
// go through `SaveStore.read()` / `SaveStore.write()` so the schema stays
// the source of truth.
//
// v1 fields:
//   bestTimeMs   — best (lowest) climb time in ms (the leaderboard score)
//   bestHeightM  — kept as a placeholder for historical/CLAUDE.md schema;
//                  not currently written by gameplay
//   muted        — whether audio is muted (sticky across runs)
//   unlocks      — sku ids redeemed via x402 (M7+, not yet wired)
//   receipts     — { sku, signedReceipt } tuples for unlock provenance
//
// Reads always succeed (defaults on parse error / unavailable storage) so
// the game runs in private-mode browsers and behind quota errors.

const KEY = 'theharness.save.v1';

export interface SaveDataV1 {
  v: 1;
  bestTimeMs?: number;
  bestHeightM?: number;
  muted?: boolean;
  unlocks: string[];
  receipts: { sku: string; signedReceipt: string }[];
}

const DEFAULT: SaveDataV1 = { v: 1, unlocks: [], receipts: [] };

function safeParse(raw: string | null): SaveDataV1 {
  if (!raw) return { ...DEFAULT };
  try {
    const obj = JSON.parse(raw) as Partial<SaveDataV1>;
    return {
      v: 1,
      bestTimeMs: typeof obj.bestTimeMs === 'number' && obj.bestTimeMs > 0 ? obj.bestTimeMs : undefined,
      bestHeightM: typeof obj.bestHeightM === 'number' && obj.bestHeightM > 0 ? obj.bestHeightM : undefined,
      muted: typeof obj.muted === 'boolean' ? obj.muted : undefined,
      unlocks: Array.isArray(obj.unlocks) ? obj.unlocks.filter((s): s is string => typeof s === 'string') : [],
      receipts: Array.isArray(obj.receipts)
        ? obj.receipts.filter((r): r is { sku: string; signedReceipt: string } =>
            !!r && typeof (r as { sku?: unknown }).sku === 'string' &&
            typeof (r as { signedReceipt?: unknown }).signedReceipt === 'string')
        : [],
    };
  } catch {
    return { ...DEFAULT };
  }
}

export const SaveStore = {
  read(): SaveDataV1 {
    try {
      return safeParse(localStorage.getItem(KEY));
    } catch {
      return { ...DEFAULT };
    }
  },

  write(data: SaveDataV1): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Storage unavailable (private mode / quota). Best is ephemeral.
    }
  },

  /**
   * Updates `bestTimeMs` if the supplied time beats the stored one (or no
   * record exists). Returns `{ wasBest, prev }` so callers can branch on
   * "NEW BEST" UI without re-reading.
   */
  recordBestTime(ms: number): { wasBest: boolean; prev: number | null } {
    const data = this.read();
    const prev = data.bestTimeMs ?? null;
    const wasBest = prev === null || ms < prev;
    if (wasBest) {
      data.bestTimeMs = Math.round(ms);
      this.write(data);
    }
    return { wasBest, prev };
  },

  bestTimeMs(): number | null {
    return this.read().bestTimeMs ?? null;
  },

  isMuted(): boolean {
    return this.read().muted === true;
  },

  setMuted(muted: boolean): void {
    const data = this.read();
    data.muted = muted;
    this.write(data);
  },
};
