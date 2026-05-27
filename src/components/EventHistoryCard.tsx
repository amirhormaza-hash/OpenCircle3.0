// Used in: (tabs)/profile.tsx
// Past event row: colored left bar, emoji, name/date/location, hosted or attended pill
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CATEGORY_COLOR: Record<string, string> = {
  Sports:     '#F97316',
  Party:      '#f472b6',
  Food:       '#fbbf24',
  Study:      '#60a5fa',
  Networking: '#34d399',
  Ride:       '#F97316',
  Outdoors:   '#34d399',
  Zen:        '#a78bfa',
  Other:      '#7a7a9a',
};

const CATEGORY_EMOJI: Record<string, string> = {
  Sports:     '⚽',
  Party:      '🎉',
  Food:       '🍕',
  Study:      '📚',
  Networking: '🤝',
  Ride:       '🚗',
  Outdoors:   '🌿',
  Zen:        '🧘',
  Other:      '✨',
};

interface Props {
  event: {
    id: string;
    name: string;
    date_time: string;
    address?: string;
    category?: string;
    isHosted: boolean;
  };
}

export default function EventHistoryCard({ event }: Props) {
  const color = CATEGORY_COLOR[event.category ?? ''] ?? '#7a7a9a';
  const emoji = CATEGORY_EMOJI[event.category ?? ''] ?? '✨';
  const dateStr = new Date(event.date_time).toLocaleDateString([], {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={[styles.leftBar, { backgroundColor: color }]} />
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{event.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {dateStr}{event.address ? ` · ${event.address}` : ''}
        </Text>
      </View>
      <View style={[styles.pill, event.isHosted ? styles.pillHosted : styles.pillAttended]}>
        <Text style={styles.pillText}>{event.isHosted ? 'Hosted' : 'Attended'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 10,
    overflow: 'hidden',
    gap: 12,
    paddingRight: 12,
  },
  leftBar: { width: 4, alignSelf: 'stretch' },
  emoji: { fontSize: 22 },
  info: { flex: 1, paddingVertical: 14 },
  name: { fontSize: 14, fontWeight: '700', color: '#f0f0f5', marginBottom: 3 },
  meta: { fontSize: 12, color: '#7a7a9a' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillHosted:   { backgroundColor: 'rgba(124,58,237,0.25)' },
  pillAttended: { backgroundColor: 'rgba(249,115,22,0.2)' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#f0f0f5' },
});
