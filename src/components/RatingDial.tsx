// The rating control: OpenCircle's own mark, turned into an instrument.
//
// The brand is an open circle — a ring with a gap and a dot resting in it.
// Rating an event places that dot. Ten positions sit along the ring with the
// gap at the bottom, which puts the apex exactly between 5 and 6: the top of
// the circle *is* the neutral boundary, left half negative, right half
// positive. That is why there is no legend telling you which way is good.
//
// Colour runs cold to warm rather than red to green. "Good" already has a
// vocabulary in this app — the streak card burns, the badge is On Fire, the
// accent is ember — so a great night lights the ring and a bad one leaves it
// cold. Traffic-light green would be borrowed from somewhere else.
//
// Ten fixed targets also beat a draggable track for a discrete value: no
// overshooting, no fighting the scroll view it sits inside.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, AccessibilityInfo } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '../constants/colors';
import {
  MIN_RATING,
  MAX_RATING,
  NEUTRAL_RATING,
  ratingLabel,
} from '../lib/ratingSystem';

/** Cold end of the scale. The one colour not already in the palette — the
 *  app had no cold tone, and "bad" needs to read as more than "dimmer". */
const COLD = '#5B7A9E';
const MID = colors.muted;      // #7878A0
const WARM = colors.ember;     // #FF6B00

/** Arc runs from lower-left to lower-right over the top, leaving the mark's
 *  gap at the bottom. 220° spans ten positions at a comfortable spacing. */
const ARC_START = 200;
const ARC_SWEEP = 220;
const STEPS = MAX_RATING - MIN_RATING;

const SPRING = { damping: 15, stiffness: 180 };

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

/** Colour for a position on the scale: cold → mid at neutral → warm. */
function scaleColor(value: number): string {
  const [c1, c2, c3] = [hexToRgb(COLD), hexToRgb(MID), hexToRgb(WARM)];
  const [from, to, t] =
    value <= NEUTRAL_RATING
      ? [c1, c2, (value - MIN_RATING) / (NEUTRAL_RATING - MIN_RATING)]
      : [c2, c3, (value - NEUTRAL_RATING) / (MAX_RATING - NEUTRAL_RATING)];
  return `rgb(${lerp(from[0], to[0], t)}, ${lerp(from[1], to[1], t)}, ${lerp(from[2], to[2], t)})`;
}

/**
 * Flat colour for a score, for callers that need one value rather than the
 * full ramp — the submit button, for instance.
 */
export function sentimentColor(score: number): string {
  return scaleColor(score);
}

function positionFor(index: number, radius: number, centre: number) {
  const deg = ARC_START - (index / STEPS) * ARC_SWEEP;
  const rad = (deg * Math.PI) / 180;
  return {
    x: centre + radius * Math.cos(rad),
    y: centre - radius * Math.sin(rad),
  };
}

export default function RatingDial({
  value,
  onChange,
  disabled = false,
  compact = false,
  surface = colors.card,
}: {
  /** null until chosen — the dial should not suggest an opinion. */
  value: number | null;
  onChange: (next: number) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Colour behind the dial — it paints the gap in the ring. */
  surface?: string;
}) {
  const size = compact ? 184 : 212;
  const centre = size / 2;
  const radius = centre - (compact ? 22 : 26);

  const chosen = value != null;
  const tint = chosen ? scaleColor(value) : colors.mutedDeep;

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  const pop = useSharedValue(1);
  const previous = useRef<number | null>(value);

  useEffect(() => {
    if (value === previous.current) return;
    previous.current = value;
    if (value == null || reduceMotion) return;
    pop.value = withSpring(1.1, SPRING, () => {
      pop.value = withSpring(1, SPRING);
    });
  }, [value, pop, reduceMotion]);

  const readoutStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  function choose(next: number) {
    if (disabled) return;
    // Landing on neutral is the one meaningful boundary, so it feels different.
    Haptics.impactAsync(
      next === NEUTRAL_RATING
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    onChange(next);
  }

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Track: the ring itself, dim until there is something to say. */}
      <View
        style={[
          styles.ring,
          {
            width: radius * 2 + (compact ? 10 : 12),
            height: radius * 2 + (compact ? 10 : 12),
            borderRadius: radius + 6,
            borderWidth: compact ? 1 : 1.5,
            top: centre - radius - (compact ? 5 : 6),
            left: centre - radius - (compact ? 5 : 6),
          },
        ]}
      />
      {/* Paints the mark's gap at the bottom of the ring. */}
      <View
        style={[
          styles.gap,
          { width: size * 0.42, left: centre - size * 0.21, backgroundColor: surface },
        ]}
      />

      {Array.from({ length: MAX_RATING }, (_, i) => {
        const v = MIN_RATING + i;
        const { x, y } = positionFor(i, radius, centre);
        const lit = chosen && v <= value;
        const isChoice = chosen && v === value;
        const dotColor = lit ? scaleColor(v) : colors.line;
        const dotSize = isChoice ? 20 : lit ? 11 : 8;

        return (
          <Pressable
            key={v}
            disabled={disabled}
            onPress={() => choose(v)}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ selected: isChoice, disabled }}
            accessibilityLabel={`${v} out of ${MAX_RATING}`}
            style={({ pressed }) => [
              styles.target,
              { left: x - 22, top: y - 22, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View
              style={[
                styles.dot,
                {
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: isChoice ? colors.bg : dotColor,
                  borderWidth: isChoice ? 4 : 0,
                  borderColor: dotColor,
                },
              ]}
            />
          </Pressable>
        );
      })}

      <Animated.View style={[styles.centre, readoutStyle]} pointerEvents="none">
        <Text style={[styles.score, compact && styles.scoreCompact, { color: tint }]}>
          {chosen ? value : '–'}
        </Text>
        <Text style={[styles.word, { color: chosen ? tint : colors.mutedDeep }]}>
          {chosen ? ratingLabel(value) : 'Tap to rate'}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  ring: {
    position: 'absolute',
    borderColor: colors.line,
  },
  gap: {
    position: 'absolute',
    bottom: 0,
    height: 34,
  },
  target: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {},
  centre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: { fontSize: 52, fontFamily: fonts.bold, lineHeight: 58 },
  scoreCompact: { fontSize: 44, lineHeight: 50 },
  word: { fontSize: 13, fontFamily: fonts.bold, marginTop: -2 },
});
