import { Platform } from 'react-native';

export const colors = {
  bg: '#FFF6F1',
  card: '#FFFFFF',
  ink: '#3B2A35',
  inkSoft: '#8A7480',
  line: '#F1DCE0',
  pink: '#FF8FB1',
  pinkDeep: '#E8648E',
  pinkSoft: '#FFE3EC',
  lilac: '#B9A6FF',
  mint: '#7FD8BE',
  danger: '#E5484D',
  overlay: 'rgba(20, 12, 18, 0.45)',
} as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fonts = {
  rounded: Platform.select({ ios: 'ui-rounded', default: undefined }),
} as const;
