import * as React from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Rect } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

type SwitchProps = {
  onValueChange: (value: boolean) => void;
  value: boolean;
  size?: number;
  defaultValue?: boolean;
  disabled?: boolean;
};

export function Switch({
  onValueChange,
  value,
  size = 80,
  defaultValue = false,
  disabled = false,
}: SwitchProps) {
  const toggleHeight = size;
  const toggleWidth = size * 2;
  const animationValue = useSharedValue(Number(!!defaultValue));
  const bgAnimation = useSharedValue(Number(!!defaultValue));

  const longPress = Gesture.LongPress()
    .minDuration(200)
    .enabled(!disabled)
    .onBegin((e) => {
      animationValue.value = withTiming(0.5);
    })
    .onFinalize(() => {
      animationValue.value = withTiming(!value ? 1 : 0);
      bgAnimation.value = withTiming(!value ? 1 : 0);
      if (onValueChange) {
        runOnJS(onValueChange)(!value);
      }
    });

  const rectAnimatedProps = useAnimatedProps(() => {
    return {
      width: interpolate(
        animationValue.value,
        [0, 0.5, 1],
        [toggleHeight, toggleWidth, toggleHeight]
      ),
      x: interpolate(
        animationValue.value,
        [0, 0.5, 1],
        [0, 0, toggleWidth - toggleHeight]
      ),
    };
  }, [size]);

  const circleFillProps = useAnimatedProps(() => {
    return {
      fill: interpolateColor(bgAnimation.value, [0, 1], ["#fff", "#333"]),
    };
  }, [size]);
  const rectFillProps = useAnimatedProps(() => {
    return {
      fill: interpolateColor(bgAnimation.value, [0, 1], ["#333", "#fff"]),
    };
  }, [size]);

  return (
    <GestureDetector gesture={longPress}>
      <View
        style={{
          backgroundColor: "white",
          borderRadius: toggleHeight / 2,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          marginVertical: 20,
          opacity: disabled ? 0.5 : 1,
        }}>
        <Svg
          width={toggleWidth}
          height={toggleHeight}
          viewBox={`0 0 ${toggleWidth} ${toggleHeight}`}>
          <AnimatedRect
            x={0}
            rx={toggleHeight / 2}
            width={toggleHeight}
            height={toggleHeight}
            fill='#333'
            animatedProps={rectAnimatedProps}
          />
          <AnimatedCircle
            cx={toggleHeight / 2}
            cy={toggleHeight / 2}
            r={toggleHeight * 0.14}
            fill='#fff'
            animatedProps={circleFillProps}
          />
          <AnimatedRect
            width={toggleHeight * 0.12}
            height={toggleHeight * 0.35}
            x={toggleWidth - toggleHeight / 2 - (toggleHeight * 0.12) / 2}
            y={toggleHeight / 2 - (toggleHeight * 0.35) / 2}
            rx={(toggleHeight * 0.12) / 2}
            fill='#333'
            animatedProps={rectFillProps}
          />
        </Svg>
      </View>
    </GestureDetector>
  );
}
