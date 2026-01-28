import { ChevronUp } from 'lucide-react-native';
import { MotiView } from 'moti';
import { motifySvg } from 'moti/svg';
import React from 'react';
import { Platform, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const MotifiedChevronUp = motifySvg(ChevronUp)();

export default function SwipeUpIndicator({
  size = 22,
  isOpened,
  style,
}: {
  isOpened: boolean;
  size?: number;
  style?: ViewStyle;
}) {
  // On web, `moti/svg` + `react-native-svg` can crash when animated props are applied via `setNativeProps`.
  // Render a static indicator instead.
  if (Platform.OS === 'web') {
    return (
      <View style={style}>
        {[...Array(3)].map((_, index) => (
          <View key={index} style={{ marginTop: -size * 0.45, opacity: 0.25 + index * 0.25 }}>
            <ChevronUp size={size} color="#fff" />
          </View>
        ))}
      </View>
    );
  }

  const transformOriginStyle =
    ({ transformOrigin: ['50%', '0%', 0] as any } as any);

  return (
    <Animated.View style={style} entering={FadeIn} exiting={FadeOut}>
      {[...Array(3)].map((_, index) => (
        <MotiView
          key={index}
          style={transformOriginStyle}
          animate={{ rotate: `${isOpened ? 180 : 0}deg` }}
          transition={{ type: 'spring', delay: (3 - index) * 50 }}
        >
          <MotifiedChevronUp
            size={size}
            color={'#fff'}
            from={{ opacity: 0.25 }}
            animate={{ opacity: 1 }}
            transition={{
              type: 'timing',
              loop: true,
              repeatReverse: true,
              delay: (3 - index) * 250,
              duration: 750,
            }}
            style={{ marginTop: -size * 0.45 }}
          />
        </MotiView>
      ))}
    </Animated.View>
  );
}
