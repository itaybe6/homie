import { ReactElement } from "react";
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
} from "react-native";
import Animated, {
  AnimatedStyle,
  SharedValue,
  useAnimatedProps,
} from "react-native-reanimated";

Animated.addWhitelistedNativeProps({ text: true });

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function AnimatedText({
  style,
  text,
}: {
  style?: StyleProp<AnimatedStyle<StyleProp<TextStyle>>>;
  text: SharedValue<number>;
}): ReactElement {
  const animatedProps = useAnimatedProps(() => {
    return { text: String(text.value.toFixed(0)) } as unknown as TextInputProps;
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid='transparent'
      editable={false}
      value={String(text.value.toFixed(0))}
      style={[styles.text, style]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    color: "black",
    fontVariant: ["tabular-nums"],
  },
});
