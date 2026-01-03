// Inspiration: https://dribbble.com/shots/11638410-dinero
import { AnimatePresence, MotiText, MotiView } from 'moti';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, ZoomOut } from 'react-native-reanimated';
import { Check, ChevronLeft, Delete } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

const { width, height } = Dimensions.get('window');

const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'space', 0, 'delete'] as const;
type Keys = (typeof keys)[number];

const passcodeLength = 6;
// Make the keypad feel "full screen" on tall devices by sizing keys using both width & height.
// Must stay <= width/3 to keep 3 columns inside the screen.
const _keySize = Math.min(width / 3.2, Math.max(width / 4, height / 7.2), 140);
const _passcodeSpacing = (width - 3 * _keySize) / 2;
const _passCodeSize = Math.min(width / (passcodeLength + 1.6), 62);
const _brandBrown = '#5e3f2d';
const _brandGreen = '#22C55E';
const _successDuration = 650;

const AnimatedDelete = Animated.createAnimatedComponent(Delete);
const AnimatedChevronLeft = Animated.createAnimatedComponent(ChevronLeft);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

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
                from={{ scale: 0, backgroundColor: _brandGreen }}
                animate={{
                  scale: isValid && passcode.length === passcodeLength ? [1.06, 1] : 1,
                  // Green fill for entered digits
                  backgroundColor: _brandGreen,
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
  const { user } = useAuthStore();
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  const [passcode, setPasscode] = useState<number[]>([]);
  const passcodeStr = useMemo(() => passcode.join(''), [passcode]);
  const [isValid, setIsValid] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string>('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (passcode.length !== passcodeLength) {
      setIsValid(true);
      setErrorText('');
      return;
    }
    if (isSuccess || inFlightRef.current) return;

    inFlightRef.current = true;
    const run = async () => {
      if (mountedRef.current) setIsSubmitting(true);
      try {
        if (mountedRef.current) setErrorText('');
        if (!isSupabaseConfigured()) {
          throw new Error('Supabase לא מוגדר באפליקציה (חסרים ENV).');
        }
        if (!user?.id) throw new Error('יש להתחבר כדי להצטרף לדירה');

        const aptIdRaw = Array.isArray(params.apartmentId) ? params.apartmentId[0] : params.apartmentId;
        const aptIdStr = aptIdRaw ? String(aptIdRaw) : '';
        const aptId = aptIdStr.trim() ? aptIdStr.trim() : null;

        const rpcCall = supabase.rpc('join_apartment_with_passcode', {
          p_passcode: passcodeStr,
          p_apartment_id: aptId,
        });

        // Avoid infinite "בודק..." in case of network stall / misconfigured URL.
        const { data, error } = await withTimeout(rpcCall, 12_000);
        if (error) throw error;

        // Supabase RPC returns an array for RETURNS TABLE
        const row = Array.isArray(data) ? data[0] : data;
        const joinedApartmentId = row?.apartment_id ? String(row.apartment_id) : aptId;
        if (!joinedApartmentId) throw new Error('שגיאה: לא נמצא מזהה דירה לאחר הצטרפות');

        if (!mountedRef.current) return;
        setIsValid(true);
        setIsSuccess(true);

        const t = setTimeout(() => {
          router.replace({ pathname: '/apartment/[id]', params: { id: joinedApartmentId } });
        }, 1800);
        return () => clearTimeout(t);
      } catch (e: any) {
        if (!mountedRef.current) return;
        setIsValid(false);

        const msg = String(e?.message || e?.toString?.() || '');
        const normalized = msg.toLowerCase();
        if (normalized.includes('wrong_passcode')) {
          setErrorText('קוד שגוי. נסו שוב.');
        } else if (normalized.includes('not_authenticated')) {
          setErrorText('צריך להיות מחוברים כדי להצטרף לדירה.');
        } else if (normalized.includes('timeout')) {
          setErrorText('הבדיקה מתעכבת (בעיה בחיבור). נסו שוב.');
        } else if (normalized.includes('join_apartment_with_passcode') && normalized.includes('does not exist')) {
          setErrorText('השרת לא עודכן (חסרה פונקציה). הריצו מיגרציות בסופאבייס.');
        } else if (normalized.includes('supabase לא מוגדר') || normalized.includes('missing expo_public_supabase')) {
          setErrorText('Supabase לא מוגדר באפליקציה. צריך להגדיר ENV ולהריץ מחדש.');
        } else {
          setErrorText('לא הצלחתי לבדוק את הקוד. נסו שוב.');
        }

        // Reset input so user can try again
        setTimeout(() => {
          if (mountedRef.current) {
            setPasscode([]);
            setIsValid(true);
          }
        }, 650);
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setIsSubmitting(false);
      }
    };

    void run();
  }, [isSuccess, params.apartmentId, passcode.length, passcodeStr, router, user?.id]);

  const canInteract = !isSuccess && !isSubmitting;

  return (
    <MotiView
      style={[styles.root, { paddingTop: (insets.top || 0) + 6, paddingBottom: (insets.bottom || 0) + 6 }]}
      animate={{ backgroundColor: isSuccess ? _brandGreen : '#FFFFFF' }}
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
          {isSubmitting ? 'בודק קוד…' : 'הכניסו את הסיסמא כדי להצטרף לדירה.'}
        </Text>
        {!isSuccess && errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      </View>

      <View style={styles.contentWrap}>
        <PassCode passcode={passcode as any} isValid={isValid} />

        <View style={[styles.keyboardArea, { paddingBottom: Math.max(10, insets.bottom || 0) }]}>
          <PassCodeKeyboard
            onPress={(char) => {
              if (!canInteract) return;
              if (char === 'delete') {
                setPasscode((p) => (p.length === 0 ? [] : p.slice(0, p.length - 1)));
                return;
              }
              if (char === 'space') return;
              if (passcode.length === passcodeLength) return;
              setPasscode((p) => [...p, Number(char)]);
            }}
          />
          {isSubmitting ? (
            <View style={styles.loadingRow} pointerEvents="none">
              <ActivityIndicator size="small" color={_brandBrown} />
              <Text style={styles.loadingText}>בודק…</Text>
            </View>
          ) : null}
        </View>
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
                <Check size={64} color={_brandGreen} />
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
    marginTop: 14,
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
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 0,
  },
  keyboardArea: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: '#6B7280',
    fontWeight: '700',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: '#B91C1C',
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  passcodeRow: {
    flexDirection: 'row',
    marginTop: -2,
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
  loadingRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  successBgCircle: {
    position: 'absolute',
    width: width * 0.35,
    height: width * 0.35,
    borderRadius: (width * 0.35) / 2,
    backgroundColor: _brandGreen,
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


