import React, { useEffect, useMemo } from 'react';
import { StyleProp, StyleSheet, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import { TextInput } from 'react-native';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

type DonutChartProps = {
  percentage?: number | null;
  size?: number;
  strokeWidth?: number;
  durationMs?: number;
  color?: string;
  trackColor?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export default function DonutChart({
  percentage,
  size = 64,
  strokeWidth = 10,
  durationMs = 900,
  color = '#16A34A',
  trackColor = 'rgba(22,163,74,0.16)',
  textColor,
  style,
  textStyle,
  disabled,
  onPress,
  accessibilityLabel,
}: DonutChartProps) {
  const radius = useMemo(() => Math.max(6, (size - strokeWidth) / 2), [size, strokeWidth]);
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);

  const animated = useSharedValue(0);
  const normalized = useMemo(() => {
    if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return null;
    return Math.round(clamp(percentage, 0, 100));
  }, [percentage]);

  useEffect(() => {
    const target = disabled ? 0 : normalized ?? 0;
    animated.value = withTiming(target, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [animated, disabled, durationMs, normalized]);

  const circleProps = useAnimatedProps(() => {
    const perc = clamp(animated.value, 0, 100);
    return {
      strokeDashoffset: circumference - (circumference * perc) / 100,
    };
  });

  const animatedTextProps = useAnimatedProps(() => {
    const v = Math.round(animated.value);
    const label = disabled ? '--%' : `${v}%`;
    return {
      text: label,
      defaultValue: label,
    } as any;
  });

  const content = (
    <View style={[styles.root, { width: size, height: size }, style]}>
      <Svg
        height={size}
        width={size}
        viewBox={`0 0 ${(radius + strokeWidth) * 2} ${(radius + strokeWidth) * 2}`}
      >
        <G rotation="-90" origin={`${radius + strokeWidth}, ${radius + strokeWidth}`}>
          <AnimatedCircle
            cx="50%"
            cy="50%"
            r={radius}
            fill="transparent"
            stroke={disabled ? '#9CA3AF' : color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animatedProps={circleProps}
          />
          <Circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="transparent"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, styles.center]}>
        <AnimatedTextInput
          underlineColorAndroid="transparent"
          editable={false}
          pointerEvents="none"
          animatedProps={animatedTextProps}
          style={[
            styles.text,
            {
              // Give a bit more room so '%' never gets clipped (especially on web).
              width: radius * 2,
              fontSize: Math.max(12, Math.round(size * 0.26)),
              color: textColor ?? (disabled ? '#9CA3AF' : color),
            },
            textStyle,
          ]}
        />
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || 'אחוז התאמה'}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { justifyContent: 'center', alignItems: 'center' },
  text: {
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    writingDirection: 'ltr',
    padding: 0,
    textAlignVertical: 'center',
  },
});

