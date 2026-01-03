import { useState } from "react";
import { Button, View } from "react-native";
import { BallonSlider } from "./";

export default function App() {
  const [withSensor, setWithSensor] = useState(true);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <BallonSlider
        // disable the sensors
        withSensor={withSensor}
      />

      <View style={{ position: "absolute", bottom: 100 }}>
        <Button
          title={withSensor ? "Disable Sensors" : "Enable Sensors"}
          onPress={() => setWithSensor(!withSensor)}
        />
      </View>
    </View>
  );
}
