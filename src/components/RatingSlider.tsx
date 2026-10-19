// Shared 1–10 rating input. Used by the event rating row on event cards and
// by the rate-a-user modal on a profile, so the two cannot drift apart.
//
// The component deliberately does not submit anything. Picking a value and
// committing it are separate steps: with ten positions, dragging is
// exploratory, and a stray touch should not file a rating the way tapping one
// of five stars used to.

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '../constants/colors';
import {
  MIN_RATING,
  MAX_RATING,
  NEUTRAL_RATING,
  ratingLabel,
  ratingSentiment,
} from '../lib/ratingSystem';

const THUMB = 26;
const STEPS = MAX_RATING - MIN_RATING; // 9 gaps between 10 positions
const SPRING = { damping: 18, stiffness: 220 };

/** Colour for a score, by which side of neutral it falls on. */
export function sentimentColor(score: number): string {
  switch (ratingSentiment(score)) {
    case 'positive': return colors.success;
    case 'negative': return colors.danger;
    default:         return colors.muted;
  }
}

export default function RatingSlider({
  value,
  onChange,
  disabled = false,
}: {
  /** null means the user has not chosen yet — the track sits at neutral. */
  value: number | null;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const usable = Math.max(0, trackWidth - THUMB);

  const chosen = value != null;
  const shown = value ?? NEUTRAL_RATING;
  const tint = chosen ? sentimentColor(shown) : colors.muted;

  // Mirrors the value for the gesture worklet, which cannot read React state.
  const live = useSharedValue(shown);

  function emit(next: number) {
    if (next !== value) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(next);
  }

  // x → nearest whole rating. Stays a worklet so dragging runs on the UI
  // thread; only the snapped integer crosses back to JS, and only on change.
  const pan = Gesture.Pan()
    .enabled(!disabled && usable > 0)
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      const ratio = Math.min(1, Math.max(0, (e.x - THUMB / 2) / usable));
      const next = Math.round(MIN_RATING + ratio * STEPS);
      live.value = next;
      runOnJS(emit)(next);
    })
    .onUpdate((e) => {
      'worklet';
      const ratio = Math.min(1, Math.max(0, (e.x - THUMB / 2) / usable));
      const next = Math.round(MIN_RATING + ratio * STEPS);
      if (next !== live.value) {
        live.value = next;
        runOnJS(emit)(next);
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(((live.value - MIN_RATING) / STEPS) * usable, SPRING) }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: withSpring(THUMB / 2 + ((live.value - MIN_RATING) / STEPS) * usable, SPRING),
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.readout}>
        <Text style={[styles.score, { color: tint }, !chosen && styles.scoreIdle]}>
          {chosen ? shown : '–'}
        </Text>
        <Text style={styles.outOf}>/ {MAX_RATING}</Text>
      </View>

      <Text style={[styles.word, { color: tint }]}>
        {chosen ? ratingLabel(shown) : 'Drag to rate'}
      </Text>

      <GestureDetector gesture={pan}>
        <View
          style={styles.track}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <View style={styles.rail} />
          <Animated.View style={[styles.fill, { backgroundColor: tint }, fillStyle]} />
          {/* Neutral marker: the point where the meaning flips. */}
          <View style={[styles.midTick, { left: THUMB / 2 + usable / 2 - 1 }]} />
          <Animated.View
            style={[styles.thumb, { borderColor: tint }, thumbStyle, disabled && styles.thumbLocked]}
          />
        </View>
      </GestureDetector>

      <View style={styles.scaleRow}>
        <Text style={styles.scaleEnd}>{MIN_RATING}</Text>
        <Text style={styles.scaleEnd}>neutral</Text>
        <Text style={styles.scaleEnd}>{MAX_RATING}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  score: { fontSize: 34, fontFamily: fonts.bold },
  scoreIdle: { opacity: 0.5 },
  outOf: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted },
  word: {
    fontSize: 13,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginBottom: 6,
  },
  track: { height: THUMB, justifyContent: 'center' },
  rail: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: THUMB / 2,
  },
  fill: { position: 'absolute', left: 0, height: 6, borderRadius: 3 },
  midTick: {
    position: 'absolute',
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.card,
    borderWidth: 3,
  },
  thumbLocked: { opacity: 0.6 },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  scaleEnd: { fontSize: 11, fontFamily: fonts.regular, color: colors.mutedDeep },
});
