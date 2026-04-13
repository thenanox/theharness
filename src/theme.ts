// All theme-adjacent strings and colors live here.
// When the jam theme drops, this is (ideally) the only file touched.
//
// Visual direction: "Ink & Ember".
// The world is a 4-step cool grey ink-wash. The rope is the only warm
// element on screen — a single ember orange. Reward through contrast.

export const THEME = {
  title: 'The Harness',
  tagline: 'One rope. One life. One tower.',
  heroName: 'Climber',

  palette: {
    // --- world (ink wash, cool greys) ---
    background: 0xf4efe6,   // bone white paper
    sky: 0xece6d8,          // faint warm grey
    fogLow: 0xd8d2c3,       // soft fog fading at bottom
    inkDeep: 0x1b1c21,      // charcoal — deepest ink stroke
    inkMid: 0x3a3b44,       // mid grey stroke
    inkSoft: 0x636572,      // soft grey
    inkGhost: 0x9fa0a9,     // ghosted line (aim guide, parallax back)

    // --- tiles (grayscale + one sage accent) ---
    stone: 0x2a2b32,        // default ink slab
    ice: 0x5d7684,          // cool-grey with a hint of blue
    moss: 0x4d5d3f,         // restrained sage — only non-grey tile hue

    // --- player ---
    player: 0x151519,       // charcoal silhouette
    playerAccent: 0xff7a3d, // ember belt — matches rope

    // --- rope (the only warm thing on screen) ---
    rope: 0xff7a3d,         // ember orange
    ropeGlow: 0xffb98a,     // hotter core for the glow pass
    ropeHook: 0xffe6c2,     // bone-white hook tip
    ember: 0xff9a4d,        // particle ember

    // --- ui ---
    uiFg: 0x1b1c21,         // ink on bone
    uiBg: 0xece6d8aa,       // translucent paper
    uiMuted: 0x636572,
    accent: 0xff7a3d,

    // --- win palette (revealed only on victory) ---
    winSkyTop: 0xffe0b0,
    winSkyBot: 0xff7a3d,
  },

  labels: {
    heightUnit: 'm',
    heightLabel: 'HEIGHT',
    startPrompt: 'CLICK · TAP · BEGIN',
    winBanner: 'YOU REACHED THE TOP',
    givenUpBanner: 'YOU LET GO',
    modeTap: 'TAP — beginner',
    modeAim: 'AIM — hold · drag · release',
  },

  audio: {
    ambientTrack: 'music',
  },
} as const;

export type ThemePalette = typeof THEME.palette;
