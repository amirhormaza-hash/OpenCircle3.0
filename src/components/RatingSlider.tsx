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
  useDerivedValue,
  interpolateColor,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '../constants/colors';
import {
  MIN_RATING,
  MAX_RATING,
  NEUTRAL_RATING,
  ratingLabel,
  ratingSentiment,
} from '../lib/ratingSystem';

const STEPS = MAX_RATING - MIN_RATING; // 9 gaps between 10 positions
const SPRING = { damping: 18, stiffness: 220 };

// Anchors for the gradient and the colour interpolation. Sharing one array
// keeps the rail underneath the thumb the same hue as the thumb itself.
const RAMP = [colors.danger, colors.muted, colors.success] as const;
const RAMP_STOPS = [MIN_RATING, NEUTRAL_RATING, MAX_RATING];

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
  compact = false,
}: {
  /** null means the user has not chosen yet — the track sits at neutral. */
  value: number | null;
  onChange: (next: number) => void;
  disabled?: boolean;
  /** Tighter vertical rhythm, for the profile modal. */
  compact?: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);

  const thumb = compact ? 24 : 30;
  const railHeight = compact ? 8 : 10;
  const usable = Math.max(0, trackWidth - thumb);

  const chosen = value != null;
  const shown = value ?? NEUTRAL_RATING;

  // Mirrors the value for the gesture worklet, which cannot read React state.
  const live = useSharedValue(shown);
  // Drives the pop on the number and the idle pulse on the thumb.
  const pop = useSharedValue(1);
  const idle = useSharedValue(chosen ? 0 : 1);

  React.useEffect(() => {
    idle.value = chosen ? withTiming(0, { duration: 180 }) : 1;
  }, [chosen, idle]);

  // Untouched: breathe the thumb so it reads as interactive rather than as a
  // disabled control sitting at the midpoint.
  React.useEffect(() => {
    if (chosen || disabled) return;
    pop.value = withRepeat(
      withSequence(withTiming(1.12, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false,
    );
    return () => { pop.value = 1; };
  }, [chosen, disabled, pop]);

  // Geometry and the enabled flag live in shared values rather than in the
  // gesture's closure. Dragging calls onChange on every step, so the parent
  // re-renders constantly mid-drag; a gesture rebuilt from fresh closures each
  // time is how a slider ends up dropping the drag halfway through.
  const dims = useSharedValue({ thumb, usable });
  dims.value = { thumb, usable };
  const active = useSharedValue(!disabled && usable > 0);
  active.value = !disabled && usable > 0;

  // Same reason: the gesture is built once, so it must not capture this
  // render's onChange.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const emit = React.useCallback((next: number, crossedNeutral: boolean) => {
    // The neutral boundary is where the meaning flips, so it gets a heavier
    // tap than the ordinary step-to-step ticks.
    Haptics.impactAsync(
      crossedNeutral ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    onChangeRef.current(next);
  }, []);

  const bump = React.useCallback(() => {
    pop.value = withSequence(withSpring(1.18, SPRING), withSpring(1, SPRING));
  }, [pop]);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        // x → nearest whole rating, on the UI thread. Only the snapped
        // integer crosses back to JS, and only when it actually changes.
        .onBegin((e) => {
          'worklet';
          if (!active.value) return;
          const { thumb: t, usable: u } = dims.value;
          const ratio = Math.min(1, Math.max(0, (e.x - t / 2) / u));
          const next = Math.round(MIN_RATING + ratio * STEPS);
          const crossed = (live.value < NEUTRAL_RATING) !== (next < NEUTRAL_RATING);
          live.value = next;
          runOnJS(bump)();
          runOnJS(emit)(next, crossed || next === NEUTRAL_RATING);
        })
        .onUpdate((e) => {
          'worklet';
          if (!active.value) return;
          const { thumb: t, usable: u } = dims.value;
          const ratio = Math.min(1, Math.max(0, (e.x - t / 2) / u));
          const next = Math.round(MIN_RATING + ratio * STEPS);
          if (next === live.value) return;
          const crossed = (live.value < NEUTRAL_RATING) !== (next < NEUTRAL_RATING);
          live.value = next;
          runOnJS(bump)();
          runOnJS(emit)(next, crossed || next === NEUTRAL_RATING);
        }),
    [active, dims, live, bump, emit],
  );

  // One interpolated colour feeds the thumb border, the number and the word,
  // so the whole control shifts hue together as you drag.
  const tint = useDerivedValue(() =>
    interpolateColor(live.value, RAMP_STOPS, RAMP as unknown as string[]),
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withSpring(((live.value - MIN_RATING) / STEPS) * usable, SPRING) },
      { scale: pop.value },
    ],
    borderColor: chosen ? tint.value : colors.mutedDeep,
  }));

  const maskStyle = useAnimatedStyle(() => ({
    // Covers the gradient to the right of the thumb, so the rail reads as
    // "filled up to here" without needing a second gradient.
    left: withSpring(thumb / 2 + ((live.value - MIN_RATING) / STEPS) * usable, SPRING),
  }));

  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    color: chosen ? tint.value : colors.mutedDeep,
  }));

  const wordStyle = useAnimatedStyle(() => ({
    color: chosen ? tint.value : colors.mutedDeep,
  }));

  const idleStyle = useAnimatedStyle(() => ({ opacity: idle.value }));

  return (
    <View style={styles.wrap}>
      <View style={styles.readout}>
        <Animated.Text style={[styles.score, compact && styles.scoreCompact, numberStyle]}>
          {chosen ? shown : '–'}
        </Animated.Text>
        <Text style={styles.outOf}>/ {MAX_RATING}</Text>
      </View>

      <Animated.Text style={[styles.word, compact && styles.wordCompact, wordStyle]}>
        {chosen ? ratingLabel(shown) : 'Drag to rate'}
      </Animated.Text>

      <GestureDetector gesture={pan}>
        {/* Generous vertical padding: the rail is thin, the touch target is not. */}
        <View
          style={[styles.track, { height: thumb + 20 }]}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <View style={[styles.railClip, { height: railHeight, marginHorizontal: thumb / 2 }]}>
            <LinearGradient
              colors={[...RAMP]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>

          {/* Unfilled remainder, dimmed over the gradient. */}
          <Animated.View
            style={[
              styles.mask,
              { height: railHeight, right: thumb / 2, top: (thumb + 20 - railHeight) / 2 },
              maskStyle,
            ]}
          />

          {/* One tick per position, so you can see where a drag will land. */}
          {usable > 0 && Array.from({ length: MAX_RATING }, (_, i) => {
            const v = MIN_RATING + i;
            const isNeutral = v === NEUTRAL_RATING;
            return (
              <View
                key={v}
                pointerEvents="none"
                style={[
                  styles.tick,
                  isNeutral && styles.tickNeutral,
                  {
                    left: thumb / 2 + (i / STEPS) * usable - (isNeutral ? 1 : 0.5),
                    top: (thumb + 20 - (isNeutral ? 16 : 10)) / 2,
                  },
                ]}
              />
            );
          })}

          <Animated.View
            style={[
              styles.thumb,
              { width: thumb, height: thumb, borderRadius: thumb / 2, top: 10 },
              thumbStyle,
              disabled && styles.thumbLocked,
            ]}
          />
        </View>
      </GestureDetector>

      <View style={styles.scaleRow}>
        <Text style={styles.scaleEnd}>{MIN_RATING}</Text>
        <Text style={styles.scaleEnd}>neutral</Text>
        <Text style={styles.scaleEnd}>{MAX_RATING}</Text>
      </View>

      <Animated.Text style={[styles.hint, idleStyle]}>
        Above {NEUTRAL_RATING} is positive · below is negative
      </Animated.Text>
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
  score: { fontSize: 40, fontFamily: fonts.bold },
  scoreCompact: { fontSize: 32 },
  outOf: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted },
  word: { fontSize: 14, fontFamily: fonts.bold, textAlign: 'center' },
  wordCompact: { fontSize: 13 },

  track: { justifyContent: 'center' },
  railClip: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  mask: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(15,15,19,0.78)',
  },
  tick: {
    position: 'absolute',
    width: 1,
    height: 10,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tickNeutral: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  thumb: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  thumbLocked: { opacity: 0.6 },

  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  scaleEnd: { fontSize: 11, fontFamily: fonts.regular, color: colors.mutedDeep },
  hint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.mutedDeep,
    textAlign: 'center',
    marginTop: 6,
  },
});
