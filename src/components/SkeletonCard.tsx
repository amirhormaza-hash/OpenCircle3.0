// Used in: (tabs)/index.tsx, (tabs)/mylist.tsx
// Animated placeholder card shown while event data is loading

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export default function SkeletonCard() {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.card, anim]}>
      <View style={styles.image} />
      <View style={styles.body}>
        <View style={styles.titleBar} />
        <View style={styles.line} />
        <View style={[styles.line, { width: '55%' }]} />
        <View style={[styles.line, { width: '70%' }]} />
        <View style={styles.button} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 24 },
  image: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: '#1E1E28',
  },
  body: {
    backgroundColor: '#1A1A24',
    padding: 16,
    paddingBottom: 20,
  },
  titleBar: {
    height: 22,
    width: '65%',
    backgroundColor: '#2E2E40',
    borderRadius: 6,
    marginBottom: 14,
  },
  line: {
    height: 12,
    width: '88%',
    backgroundColor: '#2E2E40',
    borderRadius: 4,
    marginBottom: 8,
  },
  button: {
    height: 46,
    backgroundColor: '#2E2E40',
    borderRadius: 12,
    marginTop: 10,
  },
});
