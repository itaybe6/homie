import { BlurView } from 'expo-blur';
import randomColor from 'randomcolor';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

function randomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

type LavaLampProps = {
  count?: number;
  hue?: string;
  intensity?: number;
  colors?: string[];
  duration?: number;
  backgroundColor?: string;
};

type Circle = {
  x: number;
  y: number;
  radius: number;
  index: number;
  color: string;
};

type CircleProps = {
  circle: Circle;
  duration?: number;
  withBlur?: boolean;
};

export default function LavaLamp({
  count = 4,
  hue = 'purple',
  intensity = 40,
  colors,
  duration,
  backgroundColor,
}: LavaLampProps) {
  const { width, height } = useWindowDimensions();

  const circles = useMemo<Circle[]>(() => {
    const palette =
      colors ??
      (randomColor({
        count,
        hue,
        format: 'rgba',
        luminosity: 'light',
        alpha: 0.3,
      }) as string[]);

    return palette.map((color, index) => {
      const rand = randomNumber(5, 12) / 10;
      const radius = (width * rand) / 2;
      return {
        x: Math.random() * (width - radius * 2),
        y: Math.random() * (height - radius * 2),
        radius,
        index,
        color,
      };
    });
  }, [count, hue, colors]);

  const bgColor = (backgroundColor
    ? [backgroundColor]
    : (randomColor({ hue, count: 1, luminosity: 'dark' }) as string[]));

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bgColor[0] }]}>
      {circles.map((circle) => {
        return (
          <Circle
            key={`circle-${circle.color}-${circle.index}`}
            circle={circle}
            duration={duration}
            withBlur={intensity !== 0}
          />
        );
      })}
      <BlurView style={StyleSheet.absoluteFillObject} intensity={intensity} tint="light" />
    </View>
  );
}

function Circle({ circle, duration = 10000, withBlur }: CircleProps) {
  const randRotation = Math.random() * 360;

  const rotation = useDerivedValue(() => {
    return withRepeat(
      withSequence(
        withTiming(randRotation, { duration: 0 }),
        withTiming(randRotation + 360, {
          duration,
          easing: Easing.linear,
        })
      ),
      -1,
      false
    );
  }, [duration]);

  const stylez = useAnimatedStyle(() => {
    return {
      transform: [
        {
          rotate: `${rotation.value}deg`,
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        stylez,
        {
          // RN supports transformOrigin; cast for TS compatibility
          transformOrigin: ['50%', circle.y, 0] as any,
        },
      ]}
    >
      <View
        style={[
          {
            backgroundColor: circle.color,
            position: 'absolute',
            left: circle.x - circle.radius,
            top: circle.y - circle.radius,
            width: circle.radius * 2,
            height: circle.radius * 2,
            borderRadius: circle.radius,
          },
        ]}
      />
      {withBlur && Platform.OS === 'ios' && <BlurView style={StyleSheet.absoluteFillObject} intensity={5} tint="light" />}
    </Animated.View>
  );
}


