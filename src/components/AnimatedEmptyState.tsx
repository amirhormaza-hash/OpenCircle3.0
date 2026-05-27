// Used in: (tabs)/index.tsx, (tabs)/mylist.tsx
// Renders a pulsing icon with a title and message for empty list states

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
};

export default function AnimatedEmptyState({ icon, title, message }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={styles.container}>
      <Animated.View style={pulseStyle}>
        <Ionicons name={icon} size={54} color="#7C3AED" />
      </Animated.View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 50,
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F0F0FA',
    marginBottom: 8,
    marginTop: 14,
  },
  message: {
    fontSize: 15,
    color: '#7878A0',
    textAlign: 'center',
    lineHeight: 22,
  },
});
