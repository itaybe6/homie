// Inspiration: https://dribbble.com/shots/11638410-dinero
import { AnimatePresence, MotiText, MotiView } from 'moti';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, ZoomOut } from 'react-native-reanimated';
import { Check, ChevronLeft, Delete } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'space', 0, 'delete'] as const;
type Keys = (typeof keys)[number];

const passcodeLength = 6;
const _keySize = width / 4;
const _passcodeSpacing = (width - 3 * _keySize) / 2;
const _passCodeSize = width / (passcodeLength + 2);
const _correctPasscode = '116611'; // placeholder for future wiring
const _brandBrown = '#5e3f2d';
const _successDuration = 650;
// Demo mode: trigger the success animation on a WRONG passcode so you can test the flow without a real code yet.
const _demoTriggerSuccessOnWrongPasscode = true;

const AnimatedDelete = Animated.createAnimatedComponent(Delete);
const AnimatedChevronLeft = Animated.createAnimatedComponent(ChevronLeft);

function PassCodeKeyboard({ onPress }: { onPress: (key: Keys) => void }) {
  return (
    <View style={styles.keyboardWrap}>
      {keys.map((key) => {
        if (key === 'space') return <View style={{ width: _keySize }} key="space" />;
        return (
          <TouchableOpacity
            onPress={() => onPress(key)}
            key={String(key)}
            style={{ width: _keySize, height: _keySize, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.75}
          >
            {key === 'delete' ? (
              <AnimatedDelete size={34} color="rgba(0,0,0,0.35)" />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PassCode({ passcode, isValid }: { passcode: Array<number | 0>; isValid: boolean }) {
  return (
    <MotiView
      animate={{
        translateX: isValid ? 0 : [0, 0, 0, 5, -5, 5, -5, 5, -5, 5, 0],
      }}
      transition={{ type: 'timing', duration: 100 }}
      style={styles.passcodeRow}
    >
      {[...Array(passcodeLength).keys()].map((i) => {
        const v = passcode[i];
        return (
          <View key={`passcode-${i}`} style={styles.passcodeCell}>
            {typeof v === 'number' ? (
              <MotiView
                key={`passcode-filled-${i}`}
                from={{ scale: 0, backgroundColor: '#5e3f2d' }}
                animate={{
                  scale: isValid && passcode.length === passcodeLength ? [1.06, 1] : 1,
                  // Keep Homie brand brown for filled digits
                  backgroundColor: '#5e3f2d',
                }}
                exiting={ZoomOut.duration(200)}
                transition={{
                  type: 'timing',
                  duration: 500,
                  easing: Easing.elastic(1.1),
                  backgroundColor: { delay: 0 },
                }}
                style={styles.passcodeFill}
              >
                <Text style={styles.passcodeDigit}>{v}</Text>
              </MotiView>
            ) : null}
          </View>
        );
      })}
    </MotiView>
  );
}

export default function JoinPasscodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ apartmentId?: string | string[] }>();

  const [passcode, setPasscode] = useState<number[]>([]);
  const passcodeStr = useMemo(() => passcode.join(''), [passcode]);
  const [isValid, setIsValid] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (passcode.length === passcodeLength) {
      const isWrong = passcodeStr !== _correctPasscode;
      const shouldSuccess = _demoTriggerSuccessOnWrongPasscode ? isWrong : !isWrong;

      // Keep the “shake” validation effect only for the non-success path.
      setIsValid(shouldSuccess ? true : !isWrong);

      if (shouldSuccess) {
        setIsSuccess(true);
        const aptId = Array.isArray(params.apartmentId) ? params.apartmentId[0] : params.apartmentId;
        // Give the success animation time to play, then return to the apartment page
        const t = setTimeout(() => {
          if (aptId) {
            router.replace({ pathname: '/apartment/[id]', params: { id: String(aptId) } });
          } else {
            router.back();
          }
        }, 1800);
        return () => clearTimeout(t);
      }
    } else {
      setIsValid(true);
    }
  }, [params.apartmentId, passcode.length, passcodeStr, router]);

  return (
    <MotiView
      style={[styles.root, { paddingTop: (insets.top || 0) + 10, paddingBottom: (insets.bottom || 0) + 10 }]}
      animate={{ backgroundColor: isSuccess ? _brandBrown : '#FFFFFF' }}
      transition={{ type: 'timing', duration: _successDuration }}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backIconBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="חזור"
          disabled={isSuccess}
        >
          <AnimatedChevronLeft size={26} color={_brandBrown} />
        </Pressable>
        <View style={{ flex: 1 }} />
      </View>

      <View style={styles.header}>
        <Text style={[styles.title, isSuccess ? { color: '#FFFFFF' } : null]}>הכניסו סיסמה</Text>
        <Text style={[styles.subtitle, isSuccess ? { color: 'rgba(255,255,255,0.86)' } : null]}>
          הכניסו את הסיסמא כדי להצטרף לדירה.
        </Text>
      </View>

      <View style={styles.contentWrap}>
        <PassCode passcode={passcode as any} isValid={isValid} />

        <PassCodeKeyboard
          onPress={(char) => {
            if (isSuccess) return;
            if (char === 'delete') {
              setPasscode((p) => (p.length === 0 ? [] : p.slice(0, p.length - 1)));
              return;
            }
            if (char === 'space') return;
            if (passcode.length === passcodeLength) return;
            setPasscode((p) => [...p, Number(char)]);
          }}
        />
      </View>
      {/* Success overlay (check mark + expanding brown) */}
      <AnimatePresence>
        {isSuccess ? (
          <MotiView
            key="success"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'timing', duration: 220 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          >
            <MotiView
              from={{ scale: 0.1 }}
              animate={{ scale: 12 }}
              transition={{ type: 'timing', duration: _successDuration * 1.8, easing: Easing.out(Easing.cubic) }}
              style={styles.successBgCircle}
            />
            <MotiView
              from={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'timing', duration: 420, delay: 180 }}
              style={styles.successCenter}
            >
              <View style={styles.successBadge}>
                <Check size={64} color={_brandBrown} />
              </View>
              <MotiText
                from={{ opacity: 0, translateY: 6 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 420, delay: 360 }}
                style={styles.successText}
              >
                מעולה!
              </MotiText>
            </MotiView>
          </MotiView>
        ) : null}
      </AnimatePresence>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  backIconBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  header: {
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 22,
    alignItems: 'center',
  },
  title: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  contentWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
    paddingBottom: 10,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: '#6B7280',
    fontWeight: '700',
  },
  passcodeRow: {
    flexDirection: 'row',
    marginTop: 0,
    marginBottom: 10,
    gap: _passCodeSize / 4,
  },
  passcodeCell: {
    width: _passCodeSize,
    height: _passCodeSize,
    borderRadius: _passCodeSize,
    backgroundColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  passcodeFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: _passCodeSize,
  },
  passcodeDigit: {
    fontSize: _passCodeSize / 2,
    color: '#fff',
    fontWeight: '800',
  },
  keyboardWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: _passcodeSpacing,
    alignItems: 'center',
    marginTop: 6,
  },
  keyText: { color: '#000', fontSize: 32, fontWeight: '700' },
  successBgCircle: {
    position: 'absolute',
    width: width * 0.35,
    height: width * 0.35,
    borderRadius: (width * 0.35) / 2,
    backgroundColor: _brandBrown,
    top: height * 0.45,
    left: width * 0.325,
  },
  successCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBadge: {
    width: width * 0.42,
    height: width * 0.42,
    borderRadius: (width * 0.42) / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});


