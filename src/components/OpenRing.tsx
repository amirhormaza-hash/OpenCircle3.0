// OpenCircle brand mark: a ring with an open gap and a dot sitting in it —
// the open spot in the circle. Pure Views, no SVG dependency.
// `bg` must match the surface behind the mark (it paints the gap).

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

type Props = {
  size?: number;
  color?: string;
  bg: string;
  /** Ring thickness override — use a slim stroke at large sizes (e.g. around an avatar). */
  stroke?: number;
  /** Dot diameter override — pair with a custom stroke. */
  dot?: number;
};

export default function OpenRing({
  size = 36,
  color = colors.ember,
  bg,
  stroke: strokeProp,
  dot: dotProp,
}: Props) {
  const stroke = strokeProp ?? Math.max(2.5, size * 0.12);
  // Point on the ring circumference at 45° (top-right)
  const r = size / 2 - stroke / 2;
  const cx = size / 2 + r * Math.SQRT1_2;
  const cy = size / 2 - r * Math.SQRT1_2;
  const notch = Math.max(size * 0.36 * (stroke / Math.max(2.5, size * 0.12)), stroke * 2.6);
  const dot = dotProp ?? size * 0.15;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, borderWidth: stroke, borderColor: color },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          left: cx - notch / 2,
          top: cy - notch / 2,
          width: notch,
          height: notch,
          borderRadius: notch / 2,
          backgroundColor: bg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: cx - dot / 2,
          top: cy - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
