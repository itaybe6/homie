import React, { useState } from 'react';
import { Dimensions, Image as RNImage, StyleSheet, Text, View, TouchableOpacity, Platform, Pressable, ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { Marquee } from '@animatereactnative/marquee';
import { Stagger } from '@animatereactnative/stagger';

const images: (ImageSourcePropType | string)[] = [
  require('../../assets/images/one.png'),
  require('../../assets/images/two.png'),
  require('../../assets/images/tree.png'),
  require('../../assets/images/fpur.png'),
  require('../../assets/images/five.png'),
  require('../../assets/images/six.png'),
  require('../../assets/images/seven.png'),
];

const toSource = (img: ImageSourcePropType | string): ImageSourcePropType =>
  typeof img === 'string' ? ({ uri: img } as const) : img;

const { width } = Dimensions.get('window');
const _itemWidth = width * 0.62;
const _itemHeight = _itemWidth * 1.67;
const _itemSize = _itemWidth + 16;

function Item({
  image,
  index,
  offset,
}: {
  image: ImageSourcePropType | string;
  index: number;
  offset: SharedValue<number>;
}) {
  const stylez = useAnimatedStyle(() => {
    const itemPosition = _itemSize * index - width - _itemSize / 2;
    const totalSize = _itemSize * images.length;
    const range =
      ((itemPosition - (offset.value + totalSize * 1000)) % totalSize) +
      width +
      _itemSize / 2;
    const inputRange = [-_itemSize, (width - _itemWidth) / 2, width];

    return {
      transform: [
        {
          rotate: `${interpolate(range, inputRange, [-3, 0, 3])}deg`,
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: _itemWidth,
          height: _itemHeight,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 16,
          overflow: 'hidden',
        },
        stylez,
      ]}>
      <ExpoImage
        source={toSource(image)}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        contentPosition={index === 0 ? 'right center' : 'center'}
        transition={0}
      />
    </Animated.View>
  );
}

export default function IntroScreen() {
  const router = useRouter();
  const offset = useSharedValue(0);
  const [index, setIndex] = useState(0);

  const activeIndex = useDerivedValue(() => {
    return (((offset.value + width / 2) / _itemSize) % images.length);
  });

  useAnimatedReaction(
    () => Math.abs(Math.floor(activeIndex.value)),
    (newIndex) => {
      if (newIndex !== index) {
        runOnJS(setIndex)(newIndex);
      }
    }
  );

  return (
    <Animated.View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        backgroundColor: '#000',
        overflow: 'hidden',
      }}>
      <View style={[StyleSheet.absoluteFillObject, { opacity: 0.5 }]}>
        <Animated.Image
          key={`bg-image-${index}`}
          entering={FadeIn.duration(1000)}
          exiting={FadeOut.duration(1000)}
          source={toSource(images[index])}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          // Ensure cover behavior on web
          {...(Platform.OS === 'web'
            ? ({
                style: [
                  StyleSheet.absoluteFillObject,
                  {
                    objectFit: 'cover',
                    objectPosition: 'center center',
                  },
                ],
              } as any)
            : {})}
          blurRadius={50}
        />
      </View>

      <Marquee
        direction="horizontal"
        spacing={16}
        position={offset}
        speed={1}
        style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={{ flexDirection: 'row', gap: 16 }}
          entering={FadeInUp.duration(1500)
            .delay(500)
            .easing(Easing.elastic(0.9))
            .withInitialValues({
              transform: [{ translateY: -_itemHeight / 2 }],
              opacity: 0,
            })}>
          {images.map((image, idx) => (
            <Item
              key={idx}
              index={idx}
              image={image}
              offset={offset}
            />
          ))}
        </Animated.View>
      </Marquee>

      <Stagger
        duration={500}
        stagger={100}
        initialEnteringDelay={1000}
        style={{
          flex: 0.6,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 20,
        }}>
        <Text style={{ color: 'white', fontWeight: '500', opacity: 0.7 }}>
          ברוכים הבאים ל־
        </Text>
        <RNImage
          source={require('../../assets/images/logo-02.png')}
          style={{ width: 160, height: 48, marginBottom: 12 }}
          resizeMode="contain"
          accessible
          accessibilityLabel="Homie logo"
        />
        <Text
          style={{
            color: 'white',
            opacity: 0.85,
            textAlign: 'center',
          }}>
          הופכים את החיפוש לשותף או דירת שותפים לפשוט, נעים ומדויק – כדי שתרגישו באמת בבית מהיום הראשון.
        </Text>
        <Pressable
          {...(Platform.OS === 'web' ? ({ tabIndex: -1 } as any) : {})}
          onPress={() => router.replace('/auth/login')}
          style={({ pressed }) => [
            {
              marginTop: 16,
              backgroundColor: 'transparent',
              height: 36,
              paddingHorizontal: 22,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
              ...(Platform.OS === 'web'
                ? ({
                    outlineStyle: 'none',
                    outlineWidth: 0,
                    outlineColor: 'transparent',
                    userSelect: 'none',
                    cursor: 'pointer',
                    // Glassmorphism on web
                    backdropFilter: 'blur(14px) saturate(170%)',
                    WebkitBackdropFilter: 'blur(14px) saturate(170%)',
                    boxShadow: '0px 10px 30px rgba(0,0,0,0.35)',
                  } as any)
                : {}),
            },
            pressed
              ? {
                  transform: [{ scale: 0.98 }],
                }
              : null,
          ]}>
          {/* Glass background */}
          <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
            <BlurView style={StyleSheet.absoluteFillObject} intensity={22} tint="light" />
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: 'rgba(255,255,255,0.14)',
                },
              ]}
            />
          </View>
          <Text
            style={{
              color: '#FFFFFF',
              fontWeight: '700',
              fontSize: 15,
              lineHeight: 15,
              includeFontPadding: false,
              textAlignVertical: 'center',
              textShadowColor: 'rgba(0,0,0,0.35)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
              ...(Platform.OS === 'web' ? { marginTop: -1 } : {}),
            }}>
            בואו נתחיל
          </Text>
        </Pressable>
      </Stagger>
    </Animated.View>
  );
}


