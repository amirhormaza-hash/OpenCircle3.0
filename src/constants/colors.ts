// OpenCircle theme tokens.
// One accent (ember), one neutral ramp, category hues that carry information.
// Fonts: Nunito is loaded in _layout.tsx as separate families per weight —
// always set fontFamily from `fonts`, never rely on fontWeight alone
// (on iOS fontWeight is ignored for these single-face families).

export const colors = {
  // Neutral ramp (dark ink with a violet undertone)
  bg: '#0F0F13',
  card: '#1A1A24',
  cardAlt: '#1E1E28',
  line: '#2E2E40',
  text: '#F0F0FA',
  textSoft: '#C0C0D8',
  muted: '#7878A0',
  mutedDeep: '#5A5A78',

  // Accent — the one orange
  ember: '#FF6B00',
  emberSoft: 'rgba(255,107,0,0.14)',

  // Status
  danger: '#EF4444',
  dangerSoft: 'rgba(255,68,68,0.12)',
  success: '#22C55E',
  star: '#FFB800',
};

// Category hues — used for the small chip on event cards and anywhere a
// category needs identification at a glance. Keyed lowercase.
export const categoryColors: Record<string, string> = {
  sports: '#45D483',
  party: '#C36BFF',
  food: '#FFB13D',
  study: '#4FA8FF',
  networking: '#38C6CF',
  ride: '#8B93FF',
  outdoors: '#9BCE4B',
  zen: '#7FD8C4',
  other: '#9A97B5',
};

export function categoryColor(category?: string | null): string {
  if (!category) return categoryColors.other;
  return categoryColors[category.trim().toLowerCase()] ?? categoryColors.other;
}

// Type roles — explicit Nunito families (see note at top).
export const fonts = {
  display: 'Nunito_900Black',
  heading: 'Nunito_800ExtraBold',
  bold: 'Nunito_700Bold',
  body: 'Nunito_600SemiBold',
  regular: 'Nunito_400Regular',
};

export const radius = {
  card: 22,
  control: 14,
  pill: 999,
};
