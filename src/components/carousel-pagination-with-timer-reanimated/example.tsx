import { useMemo, useRef, useState } from "react";
import { FlatList, Text, useWindowDimensions, View } from "react-native";
import { AwesomeCarouselPagination } from "./";

export default function AwesomeCarouselPaginationExample() {
  const [activeIndex, setActiveIndex] = useState(0);
  const _data = useMemo(() => {
    return [...Array(3).keys()];
  }, []);
  const ref = useRef<FlatList>(null);
  const { width } = useWindowDimensions();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <FlatList
        ref={ref}
        data={_data}
        horizontal
        pagingEnabled
        style={{ flexGrow: 0, marginVertical: 20 }}
        onMomentumScrollEnd={(e) => {
          setActiveIndex(Math.floor(e.nativeEvent.contentOffset.x / width));
        }}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => {
          return (
            <View
              style={{
                width,
                height: (width * 9) / 16,
                paddingHorizontal: 20,
              }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#242424",
                  borderRadius: 16,
                  justifyContent: "center",
                  alignItems: "center",
                }}>
                <Text style={{ fontSize: 20, color: "#fff" }}>
                  Slide #{index + 1}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <AwesomeCarouselPagination
        data={_data}
        initialActiveIndex={activeIndex}
        duration={3000}
        dotSize={10}
        onIndexChange={(index) => {
          ref.current?.scrollToIndex({
            index,
            animated: true,
          });
        }}
      />
    </View>
  );
}
