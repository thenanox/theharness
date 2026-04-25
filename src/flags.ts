// Build / runtime feature flags.
//
// `IS_DEBUG` is true during `npm run dev` (Vite sets `import.meta.env.DEV`)
// or whenever the URL carries `?debug=1`. The latter is handy when you need
// to investigate something on the deployed Pages preview without rebuilding.
//
// Production builds (`npm run build`) drop everything that's gated on this
// flag — the tuning panel, the debug freecam, the FPS / state line, etc.

function readQueryDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

export const IS_DEBUG: boolean = !!import.meta.env.DEV || readQueryDebug();
