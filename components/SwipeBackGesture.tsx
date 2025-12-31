import React, { useMemo } from 'react';
import { Dimensions, StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type SwipeBackGestureProps = {
  children: React.ReactNode;
  onGoBack: () => void;
  enabled?: boolean;
  /**
   * Which edge should trigger "back".
   * - `left`: start on left edge and swipe right
   * - `right`: start on right edge and swipe left (recommended for RTL)
   */
  edge?: 'left' | 'right';
  /**
   * Only start the gesture if the touch begins within this many px from the left edge.
   * Keeps vertical scrolling and horizontal carousels feeling natural.
   */
  edgeWidth?: number;
  /**
   * How far you need to drag (as a fraction of screen width) to trigger back.
   */
  triggerProgress?: number;
  /**
   * Minimum horizontal fling velocity to trigger back even if not dragged far.
   */
  triggerVelocityX?: number;
  style?: StyleProp<ViewStyle>;
};

export default function SwipeBackGesture({
  children,
  onGoBack,
  enabled = true,
  edge = 'left',
  edgeWidth = 28,
  triggerProgress = 0.28,
  triggerVelocityX = 900,
  style,
}: SwipeBackGestureProps) {
  const screenWidth = Dimensions.get('window').width || 360;
  const translateX = useSharedValue(0);
  const startedOnEdge = useSharedValue(false);

  const resetAndGoBack = () => {
    // Critical: reset the translation so the screen isn't "stuck" when revisiting.
    translateX.value = 0;
    onGoBack();
  };

  const gesture = useMemo(() => {
    return Gesture.Pan()
      .enabled(enabled)
      // Avoid stealing vertical scroll unless it's clearly a horizontal intent
      .activeOffsetX(edge === 'left' ? [14, 9999] : [-9999, -14])
      .failOffsetY([-14, 14])
      .onBegin((e) => {
        const x = e.x ?? 9999;
        startedOnEdge.value =
          edge === 'left' ? x <= edgeWidth : x >= screenWidth - edgeWidth;
      })
      .onUpdate((e) => {
        if (!startedOnEdge.value) return;
        const rawTx = e.translationX ?? 0;
        if (edge === 'left') {
          const tx = Math.max(0, rawTx); // right swipe only
          translateX.value = Math.min(tx, screenWidth);
        } else {
          const tx = Math.min(0, rawTx); // left swipe only (negative)
          translateX.value = Math.max(tx, -screenWidth);
        }
      })
      .onEnd((e) => {
        if (!startedOnEdge.value) return;
        const rawTx = e.translationX ?? 0;
        const rawVx = e.velocityX ?? 0;
        const effectiveTx = edge === 'left' ? Math.max(0, rawTx) : Math.max(0, -rawTx);
        const effectiveVx = edge === 'left' ? rawVx : -rawVx;
        const shouldGoBack =
          effectiveTx >= screenWidth * triggerProgress ||
          effectiveVx >= triggerVelocityX;

        if (shouldGoBack) {
          translateX.value = withTiming(
            edge === 'left' ? screenWidth : -screenWidth,
            { duration: 180 },
            (finished) => {
              if (finished) runOnJS(resetAndGoBack)();
            }
          );
        } else {
          translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        }
      })
      .onFinalize(() => {
        startedOnEdge.value = false;
      });
  }, [
    edge,
    edgeWidth,
    enabled,
    resetAndGoBack,
    screenWidth,
    triggerProgress,
    triggerVelocityX,
    startedOnEdge,
    translateX,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    const progress = screenWidth > 0 ? Math.abs(translateX.value) / screenWidth : 0;
    return {
      transform: [
        { translateX: translateX.value },
        {
          scale: interpolate(progress, [0, 1], [1, 0.985], Extrapolate.CLAMP),
        },
      ],
      opacity: interpolate(progress, [0, 1], [1, 0.92], Extrapolate.CLAMP),
    };
  }, [screenWidth]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

