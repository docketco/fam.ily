import type { ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

/** Drag with one finger, pinch to resize. Position is relative to the parent's top-left. */
export function Draggable({
  children,
  initialX,
  initialY,
  initialScale = 1,
  minScale = 0.4,
  maxScale = 3,
}: {
  children: ReactNode;
  initialX: number;
  initialY: number;
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
}) {
  const x = useSharedValue(initialX);
  const y = useSharedValue(initialY);
  const scale = useSharedValue(initialScale);
  const start = useSharedValue({ x: 0, y: 0, scale: 1 });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      start.value = { x: x.value, y: y.value, scale: scale.value };
    })
    .onUpdate((e) => {
      x.value = start.value.x + e.translationX;
      y.value = start.value.y + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      start.value = { ...start.value, scale: scale.value };
    })
    .onUpdate((e) => {
      scale.value = Math.min(maxScale, Math.max(minScale, start.value.scale * e.scale));
    });

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}
