import { Entypo } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableWithoutFeedback, View, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  KeyboardState,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { colors } from '@/lib/theme';

const AnimatedEntypo = Animated.createAnimatedComponent(Entypo);

const { width } = Dimensions.get('window');
const _defaultDuration = 500;

export type FabButtonProps = {
  onPress: () => void;
  isOpen: boolean;
  children: React.ReactNode;
  panelStyle?: ViewStyle;
  duration?: number;
  openedSize?: number;
  closedSize?: number;
  title?: string;
  /**
   * When false, hides the built-in toggle button (+ / x).
   * Useful when the panel is opened/closed externally (e.g. backdrop tap).
   */
  showToggleButton?: boolean;
};

export function FabButton({
  onPress,
  isOpen,
  panelStyle,
  children,
  duration = _defaultDuration,
  openedSize = width * 0.88,
  closedSize = 58,
  title,
  showToggleButton = true,
}: FabButtonProps) {
  const spacing = closedSize * 0.2;
  const closeIconSize = Math.max(16, closedSize * 0.32);
  const openIconSize = Math.max(20, closedSize * 0.52);
  const { height: keyboardHeight, state } = useAnimatedKeyboard();

  const keyboardHeightStyle = useAnimatedStyle(() => {
    return {
      marginBottom: state.value === KeyboardState.OPEN ? keyboardHeight.value - 80 + spacing : 0,
    };
  });

  return (
    <Animated.View
      style={[
        styles.panel,
        panelStyle,
        {
          width: isOpen ? openedSize : closedSize,
          height: isOpen ? 'auto' : closedSize,
          borderRadius: closedSize / 2,
          padding: spacing,
        },
        keyboardHeightStyle,
      ]}
      layout={LinearTransition.duration(duration)}
    >
      {showToggleButton ? (
        <TouchableWithoutFeedback onPress={onPress}>
          <Animated.View
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              position: 'absolute',
              right: 0,
              top: 0,
              width: closedSize,
              height: closedSize,
              zIndex: 2,
            }}
            layout={LinearTransition.duration(duration)}
          >
            {isOpen ? (
              <AnimatedEntypo
                key="close"
                name="cross"
                size={closeIconSize}
                color="white"
                entering={FadeIn.duration(duration)}
                exiting={FadeOut.duration(duration)}
              />
            ) : (
              <AnimatedEntypo
                key="open"
                name="plus"
                size={openIconSize}
                color="white"
                entering={FadeIn.duration(duration)}
                exiting={FadeOut.duration(duration)}
              />
            )}
          </Animated.View>
        </TouchableWithoutFeedback>
      ) : null}

      {isOpen ? (
        <Animated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={{ flex: 1, gap: spacing * 2, padding: spacing }}
        >
          {title ? (
            <View style={styles.header}>
              <Text style={styles.heading}>{title}</Text>
            </View>
          ) : null}
          <View style={[styles.content, { gap: spacing * 2 }]}>{children}</View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  panel: {
    position: 'absolute',
    overflow: 'hidden',
    bottom: 80,
    right: 16,
    backgroundColor: colors.primary,
    zIndex: 9999,
  },
  content: { flex: 1, paddingTop: 0 },
  header: { justifyContent: 'center' },
});

