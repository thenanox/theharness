// All theme-adjacent strings and colors live here.
// When the jam theme drops, this is (ideally) the only file touched.

export const THEME = {
  title: 'The Harness',
  tagline: 'One rope. One life. One tower.',
  heroName: 'Climber',

  palette: {
    background: 0x0a0a0f,
    sky: 0x141424,
    player: 0xf5f5f5,
    rope: 0xe0c080,
    ropeHook: 0xffd080,
    stone: 0x4a4a5a,
    ice: 0x8ac8e8,
    moss: 0x4a8a4a,
    uiFg: 0xf5f5f5,
    uiBg: 0x00000088,
    accent: 0xffd080,
  },

  labels: {
    heightUnit: 'm',
    heightLabel: 'HEIGHT',
    startPrompt: 'CLICK TO BEGIN',
    winBanner: 'YOU REACHED THE TOP',
    givenUpBanner: 'YOU GAVE UP',
  },

  audio: {
    ambientTrack: 'ambient-climb',
  },
} as const;

export type ThemePalette = typeof THEME.palette;
