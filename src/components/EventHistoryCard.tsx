// Used in: (tabs)/profile.tsx, (tabs)/user-profile.tsx
// Past event row: colored left bar, emoji, name/date/location, rating,
// hosted or attended pill
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { categoryColor, colors, fonts } from '../constants/colors';

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
    rating?: number | null;
  };
}

export default function EventHistoryCard({ event }: Props) {
  const color = categoryColor(event.category);
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
        {event.rating != null && (
          <Text style={styles.rating}>★ {event.rating.toFixed(2)}</Text>
        )}
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
  info: { flex: 1, paddingVertical: 12 },
  name: { fontSize: 14, fontFamily: fonts.bold, color: colors.text, marginBottom: 3 },
  meta: { fontSize: 12, fontFamily: fonts.body, color: colors.muted },
  rating: { fontSize: 12, fontFamily: fonts.bold, color: colors.star, marginTop: 3 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillHosted:   { backgroundColor: 'rgba(124,58,237,0.25)' },
  pillAttended: { backgroundColor: colors.emberSoft },
  pillText: { fontSize: 11, fontFamily: fonts.bold, color: colors.text },
});
