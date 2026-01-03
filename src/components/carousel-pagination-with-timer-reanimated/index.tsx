import { ArrowLeft, ArrowRight } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View, ViewProps } from "react-native";
import Animated, {
  AnimatedProps,
  Easing,
  interpolate,
  LinearTransition,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

type AwesomeCarouselPaginationProps = {
  data: number[];
  initialActiveIndex?: number;
  duration?: number;
  dotSize?: number;
  onIndexChange?: (index: number) => void;
};

type DotProps = AnimatedProps<ViewProps> & {
  activeIndex: SharedValue<number>;
  timer: SharedValue<number>;
  index: number;
  dotSize: number;
};

function Dot({ dotSize, activeIndex, index, timer, style, ...rest }: DotProps) {
  const isActive = useDerivedValue(() => {
    return activeIndex.value === index;
  });
  const anim = useDerivedValue(() => {
    return isActive.value ? withSpring(1) : withSpring(0);
  });
  const stylez = useAnimatedStyle(() => {
    return {
      opacity: interpolate(anim.value, [0, 1], [0.5, 1]),
      width: interpolate(anim.value, [0, 1], [dotSize, dotSize * 4]),
      overflow: "hidden",
      padding: dotSize / 4,
    };
  });

  const timerStylez = useAnimatedStyle(() => {
    return {
      opacity: interpolate(anim.value, [0, 1], [0, 1]),
      width: isActive.value
        ? `${interpolate(timer.value, [0, 1], [0, 100])}%`
        : "0%",
    };
  });
  return (
    <Animated.View
      style={[style, stylez]}
      layout={LinearTransition.springify()}
      {...rest}>
      <Animated.View
        style={[
          style,
          {
            backgroundColor: "#fff",
            height: "100%",
          },
          timerStylez,
        ]}
      />
    </Animated.View>
  );
}

export function AwesomeCarouselPagination({
  data,
  initialActiveIndex = 0,
  duration = 1000,
  dotSize = 10,
  onIndexChange,
}: AwesomeCarouselPaginationProps) {
  const activeIndex = useSharedValue(initialActiveIndex);
  const timer = useSharedValue(0);

  useEffect(() => {
    if (initialActiveIndex !== activeIndex.value) {
      activeIndex.value = initialActiveIndex;
      timer.value = 0;
    }
  }, [initialActiveIndex]);

  useAnimatedReaction(
    () => {
      return activeIndex.value;
    },
    (v) => {
      if (onIndexChange) {
        // react-native-worklets
        scheduleOnRN(onIndexChange, v);
        // or the old way
        // runOnJS(onIndexChange)(v);
      }
      timer.value = withDelay(
        100,
        withTiming(
          1,
          {
            duration,
            easing: Easing.linear,
          },
          (finished) => {
            if (finished) {
              if (v === data.length - 1) {
                activeIndex.value = 0;
              } else {
                activeIndex.value += 1;
              }
              timer.value = 0;
            }
          }
        )
      );
    }
  );
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: dotSize / 2,
        backgroundColor: "#ddd",
        padding: dotSize / 2,
        borderRadius: 100,
      }}>
      <Pressable
        onPress={() => {
          timer.value = 0;
          if (activeIndex.get() === 0) {
            activeIndex.value = data.length - 1;
            return;
          }
          activeIndex.value -= 1;
        }}
        style={{
          width: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#242424",
          aspectRatio: 1,
        }}>
        <ArrowLeft size={14} color={"#ddd"} />
      </Pressable>
      <View style={{ flexDirection: "row", gap: dotSize / 4 }}>
        {data.map((_, index) => {
          return (
            <Dot
              key={`dot-${index}`}
              activeIndex={activeIndex}
              index={index}
              timer={timer}
              dotSize={dotSize}
              style={{
                backgroundColor: "#242424",
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
              }}
            />
          );
        })}
      </View>
      <Pressable
        onPress={() => {
          timer.value = 0;
          if (activeIndex.get() === data.length - 1) {
            activeIndex.value = 0;
            return;
          }
          activeIndex.value += 1;
        }}
        style={{
          width: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#242424",
          aspectRatio: 1,
        }}>
        <ArrowRight size={14} color={"#ddd"} />
      </Pressable>
    </View>
  );
}
