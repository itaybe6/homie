import { ChevronUp } from 'lucide-react-native';
import { MotiView } from 'moti';
import React from 'react';
import { ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function SwipeUpIndicator({
  size = 22,
  isOpened,
  style,
}: {
  isOpened: boolean;
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <Animated.View style={style} entering={FadeIn} exiting={FadeOut}>
      {[...Array(3)].map((_, index) => (
        <MotiView
          key={index}
          style={{
            marginTop: -size * 0.45,
          }}
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
          <ChevronUp size={size} color={'#fff'} />
        </MotiView>
      ))}
    </Animated.View>
  );
}

