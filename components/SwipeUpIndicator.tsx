import { ChevronUp } from 'lucide-react-native';
import { MotiView } from 'moti';
import React from 'react';
import { Platform, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function SwipeUpIndicator({
  size = 28,
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
          <MotiView
            key={index}
            style={{ marginTop: -size * 0.45 }}
            from={{ opacity: 0.25, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1.1 }}
            transition={{
              type: 'timing',
              loop: true,
              repeatReverse: true,
              delay: (3 - index) * 250,
              duration: 750,
            }}
          >
            <ChevronUp size={size} color="#fff" strokeWidth={3} />
          </MotiView>
        ))}
      </View>
    );
  }

  return (
    <Animated.View style={style} entering={FadeIn} exiting={FadeOut}>
      {[...Array(3)].map((_, index) => (
        <MotiView
          key={index}
          style={{
            marginTop: -size * 0.45,
            transformOrigin: ['50%', '0%', 0] as any,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.3,
            shadowRadius: 2,
            elevation: 3,
          } as any}
          from={{ opacity: 0.25 }}
          animate={{
            rotate: `${isOpened ? 180 : 0}deg`,
            opacity: 1,
          }}
          transition={{
            rotate: {
              type: 'spring',
              delay: (3 - index) * 50,
            },
            opacity: {
              type: 'timing',
              loop: true,
              repeatReverse: true,
              delay: (3 - index) * 250,
              duration: 750,
            },
          }}
        >
          <ChevronUp size={size} color={'#fff'} strokeWidth={3} />
        </MotiView>
      ))}
    </Animated.View>
  );
}
