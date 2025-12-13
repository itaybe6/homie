import * as React from "react";
import { View } from "react-native";
import { Switch } from "./";

export default function App() {
  const [value, setValue] = React.useState(false);
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#eee",
      }}>
      <Switch size={20} onValueChange={setValue} value={value} />
      <Switch size={40} onValueChange={setValue} value={value} />
      <Switch size={60} onValueChange={setValue} value={value} />
      <Switch size={80} onValueChange={setValue} value={value} />
      <Switch size={120} onValueChange={setValue} value={value} />
    </View>
  );
}
