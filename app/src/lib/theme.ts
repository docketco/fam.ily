import { Platform } from 'react-native';

/**
 * Placeholder visual system until the product designs land: warm paper neutrals, deep plum
 * ink, one rose accent. Calls use a dark plum stage so the doll is the brightest thing on screen.
 */
export const colors = {
  bg: '#FBF7F4',
  card: '#FFFFFF',
  ink: '#22171D',
  inkSoft: '#7D6B74',
  line: '#EDE2E2',
  pink: '#F08CA8',
  pinkDeep: '#D9467A',
  pinkSoft: '#FBE6EC',
  plum: '#1E1420',
  plumSoft: '#33233A',
  plumLine: 'rgba(255,255,255,0.12)',
  onPlum: '#FFF6F9',
  onPlumSoft: 'rgba(255,246,249,0.68)',
  danger: '#E5484D',
  success: '#2F855A',
  overlay: 'rgba(20, 12, 18, 0.45)',
} as const;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fonts = {
  rounded: Platform.select({ ios: 'ui-rounded', default: undefined }),
} as const;

export const type = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 13, letterSpacing: 0.2 },
} as const;
