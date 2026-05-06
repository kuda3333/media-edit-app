export const colors = {
  bg: '#05050A',
  surface: '#121218',
  surfaceElevated: '#1C1C26',
  glass: 'rgba(28, 28, 38, 0.7)',
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textDisabled: '#52525B',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.2)',
  brand: '#E11D48',
  brandHover: '#BE123C',
  accent: '#FACC15',
  statusRendering: '#FACC15',
  statusDone: '#10B981',
  statusError: '#EF4444',
  statusParsing: '#3B82F6',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

export const typography = {
  h1: { fontSize: 32, lineHeight: 38, letterSpacing: -0.5, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 26, lineHeight: 32, letterSpacing: -0.3, fontWeight: '700' as const, color: colors.textPrimary },
  h3: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, color: colors.textPrimary },
  h4: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  small: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase' as const, color: colors.textSecondary, fontWeight: '600' as const },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: colors.textSecondary },
};

export const STYLE_OPTIONS = [
  { id: 'flat_2d', label: '2D Flat', image: 'https://images.pexels.com/photos/15971283/pexels-photo-15971283.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' },
  { id: 'anime', label: 'Anime', image: 'https://images.pexels.com/photos/15971283/pexels-photo-15971283.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' },
  { id: 'comic_book', label: 'Comic Book', image: 'https://images.pexels.com/photos/6654172/pexels-photo-6654172.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' },
  { id: 'cut_out', label: 'Cut-out', image: 'https://images.pexels.com/photos/34069005/pexels-photo-34069005.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' },
  { id: 'rubber_hose', label: 'Rubber Hose', image: 'https://images.pexels.com/photos/34069005/pexels-photo-34069005.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' },
  { id: 'motion_comic', label: 'Motion Comic', image: 'https://images.pexels.com/photos/6654172/pexels-photo-6654172.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' },
];
