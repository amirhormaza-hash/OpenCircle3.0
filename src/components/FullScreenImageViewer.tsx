import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  uri: string | null;
  onClose: () => void;
}

export default function FullScreenImageViewer({ uri, onClose }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);

  function reset() {
    scale.value = withSpring(1);
    savedScale.value = 1;
    offsetX.value = withSpring(0);
    offsetY.value = withSpring(0);
    savedOffsetX.value = 0;
    savedOffsetY.value = 0;
  }

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.1) reset();
    });

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      if (scale.value > 1) {
        offsetX.value = savedOffsetX.value + e.translationX;
        offsetY.value = savedOffsetY.value + e.translationY;
      } else {
        // Allow drag-down to close when not zoomed
        offsetY.value = e.translationY * 0.4;
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1 && Math.abs(e.translationY) > 80) {
        onClose();
      } else if (scale.value > 1) {
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
      } else {
        offsetY.value = withSpring(0);
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: offsetX.value },
      { translateY: offsetY.value },
    ],
  }));

  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={composed}>
          <Animated.View style={styles.overlay}>
            {!!uri && (
              <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={26} color="#fff" />
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
