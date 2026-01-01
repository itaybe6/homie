import { Plus, X } from "lucide-react-native";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  KeyboardState,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";

const AnimatedPlus = Animated.createAnimatedComponent(Plus);
const AnimatedX = Animated.createAnimatedComponent(X);

const { width } = Dimensions.get("window");
const _defaultDuration = 500;

export type FabButtonProps = {
  onPress: () => void;
  isOpen: boolean;
  children: React.ReactNode;
  panelStyle?: ViewStyle;
  duration?: number;
  openedSize?: number;
  closedSize?: number;
};

export function FabButton({
  onPress,
  isOpen,
  panelStyle,
  children,
  duration = _defaultDuration,
  openedSize = width * 0.85,
  closedSize = 64,
}: FabButtonProps) {
  const spacing = closedSize * 0.2;
  const closeIconSize = closedSize * 0.3;
  const openIconSize = closedSize * 0.5;
  const { height: keyboardHeight, state } = useAnimatedKeyboard();

  const keyboardHeightStyle = useAnimatedStyle(() => {
    return {
      marginBottom:
        state.value === KeyboardState.OPEN
          ? keyboardHeight.value - 80 + spacing
          : 0,
    };
  });

  return (
    <Animated.View
      style={[
        styles.panel,
        panelStyle,
        {
          width: isOpen ? openedSize : closedSize,
          height: isOpen ? "auto" : closedSize,
          borderRadius: closedSize / 2,
          padding: spacing,
        },
        keyboardHeightStyle,
      ]}
      // Use Layout if you're using an old version of Reanimated
      layout={LinearTransition.duration(duration)}>
      <TouchableWithoutFeedback onPress={onPress}>
        <Animated.View
          style={{
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            right: 0,
            top: 0,
            width: closedSize,
            height: closedSize,
            zIndex: 2,
          }}
          // Use Layout if you're using an old version of Reanimated
          layout={LinearTransition.duration(duration)}>
          {isOpen ? (
            <AnimatedX
              key='close'
              size={closeIconSize}
              color='white'
              entering={FadeIn.duration(duration)}
              exiting={FadeOut.duration(duration)}
            />
          ) : (
            <AnimatedPlus
              key='open'
              size={openIconSize}
              color='white'
              entering={FadeIn.duration(duration)}
              exiting={FadeOut.duration(duration)}
            />
          )}
        </Animated.View>
      </TouchableWithoutFeedback>
      {isOpen && (
        <Animated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={{ flex: 1, gap: spacing * 2, padding: spacing }}>
          <View style={styles.header}>
            <Text style={styles.heading}>BLACK FRIDAY</Text>
          </View>
          <View style={[styles.content, { gap: spacing * 2 }]}>{children}</View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  panel: {
    position: "absolute",
    overflow: "hidden",
    bottom: 80,
    backgroundColor: "#111",
    zIndex: 9999,
  },
  content: { flex: 1, paddingTop: 0 },
  header: { justifyContent: "center" },
});
