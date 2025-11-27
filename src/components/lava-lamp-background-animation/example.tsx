// Inspiration: https://www.cephalopod.studio/blog/swiftui-aurora-background-animation
// Thanks Fardeem Munir for sending the inspiration link.

import { faker } from "@faker-js/faker/.";
import { useState } from "react";
import { View } from "react-native";
import { LavaLamp } from "./";

export default function App() {
  const [color, setColor] = useState(faker.color.human());
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={() => {
        setColor(faker.color.human());
      }}>
      <LavaLamp count={4} hue={color} intensity={100} duration={20000} />
    </View>
  );
}
