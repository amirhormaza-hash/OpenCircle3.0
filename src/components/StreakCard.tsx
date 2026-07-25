// Used in: (tabs)/profile.tsx
// Animated streak display: pulsing fire emoji + week dots + longest streak
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/colors';

interface Props {
  currentStreak: number;
  longestStreak: number;
}

export default function StreakCard({ currentStreak, longestStreak }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const filledDots = Math.min(currentStreak, 7);

  return (
    <View style={styles.card}>
      <Animated.Text style={[styles.fire, { transform: [{ scale: pulse }] }]}>🔥</Animated.Text>

      <View style={styles.right}>
        <Text style={styles.number}>{currentStreak}</Text>
        <Text style={styles.subtitle}>weeks in a row</Text>

        <View style={styles.dotsRow}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.dot, i < filledDots && styles.dotFilled]}>
              <Text style={styles.dotLabel}>W{i + 1}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.longest}>Best: {longestStreak} week{longestStreak !== 1 ? 's' : ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.2)',
    padding: 20,
    gap: 20,
  },
  fire: { fontSize: 48 },
  right: { flex: 1 },
  number: { fontSize: 40, fontFamily: fonts.display, color: colors.star, lineHeight: 46 },
  subtitle: { fontSize: 14, fontFamily: fonts.body, color: colors.muted, marginBottom: 12 },
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotFilled: { backgroundColor: colors.star, borderColor: colors.star },
  dotLabel: { fontSize: 9, fontFamily: fonts.bold, color: colors.bg },
  longest: { fontSize: 12, fontFamily: fonts.body, color: colors.muted },
});
