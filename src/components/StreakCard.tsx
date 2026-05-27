// Used in: (tabs)/profile.tsx
// Animated streak display: pulsing fire emoji + week dots + longest streak
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

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
    backgroundColor: '#13131c',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    padding: 20,
    gap: 20,
  },
  fire: { fontSize: 48 },
  right: { flex: 1 },
  number: { fontSize: 40, fontWeight: '800', color: '#fbbf24', lineHeight: 44 },
  subtitle: { fontSize: 14, color: '#7a7a9a', marginBottom: 12 },
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotFilled: { backgroundColor: '#fbbf24', borderColor: '#fbbf24' },
  dotLabel: { fontSize: 9, fontWeight: '700', color: '#0a0a0f' },
  longest: { fontSize: 12, color: '#7a7a9a' },
});
