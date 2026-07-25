// Used in: (tabs)/profile.tsx
// Colored pill showing a reputation tag with icon and count
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fonts } from '../constants/colors';

type TagConfig = { icon: string; color: string; bg: string };

const TAG_CONFIG: Record<string, TagConfig> = {
  'Friendly':     { icon: '😊', color: '#45D483', bg: 'rgba(69,212,131,0.12)' },
  'Punctual':     { icon: '⏰', color: '#4FA8FF', bg: 'rgba(79,168,255,0.12)' },
  'Great Energy': { icon: '⚡', color: '#FFB800', bg: 'rgba(255,184,0,0.12)' },
  'Skilled':      { icon: '🏆', color: '#FF6B00', bg: 'rgba(255,107,0,0.12)' },
};

const DEFAULT_CONFIG: TagConfig = { icon: '👍', color: '#C36BFF', bg: 'rgba(195,107,255,0.12)' };

interface Props {
  tag: string;
  count: number;
}

export default function ReputationTag({ tag, count }: Props) {
  const cfg = TAG_CONFIG[tag] ?? DEFAULT_CONFIG;

  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
      <Text style={styles.icon}>{cfg.icon}</Text>
      <Text style={[styles.label, { color: cfg.color }]}>{tag}</Text>
      <View style={[styles.countBadge, { backgroundColor: cfg.color }]}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
    gap: 6,
  },
  icon: { fontSize: 14 },
  label: { fontSize: 13, fontFamily: fonts.bold },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  countText: { color: '#fff', fontSize: 11, fontFamily: fonts.bold },
});
