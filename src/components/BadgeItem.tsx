// Used in: (tabs)/profile.tsx
// Badge card: earned = orange tint + emoji, locked = greyed out, unseen = red dot
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/colors';

interface Props {
  emoji: string;
  name: string;
  earned: boolean;
  unseen?: boolean;
}

export default function BadgeItem({ emoji, name, earned, unseen = false }: Props) {
  return (
    <View style={[styles.container, !earned && styles.locked]}>
      {unseen && earned && <View style={styles.unseenDot} />}
      <Text style={[styles.emoji, !earned && styles.dim]}>{emoji}</Text>
      <Text style={[styles.name, !earned && styles.dim]} numberOfLines={1}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,0,0.10)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.25)',
    paddingVertical: 14,
    paddingHorizontal: 4,
    margin: 4,
    position: 'relative',
  },
  locked: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.07)',
    opacity: 0.4,
  },
  unseenDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  emoji: { fontSize: 24, marginBottom: 6 },
  name: { fontSize: 10, fontFamily: fonts.bold, color: colors.text, textAlign: 'center' },
  dim: { opacity: 0.5 },
});
