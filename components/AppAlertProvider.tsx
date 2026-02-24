import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react-native';
import { subscribeAlerts, type NativeAlertButton, type NativeAlertPayload } from '@/lib/alertBus';
import { alpha, colors } from '@/lib/theme';

type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AppAlertButton = {
  text: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
};

export type AppAlertOptions = {
  cancelable?: boolean;
};

type InternalAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  options?: AppAlertOptions;
};

type AlertFn = (
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options?: AppAlertOptions
) => void;

type ConfirmArgs = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  cancelable?: boolean;
};

export type AppAlertContextValue = {
  alert: AlertFn;
  confirm: (args: ConfirmArgs) => Promise<boolean>;
  dismiss: () => void;
};

export const AppAlertContext = createContext<AppAlertContextValue | null>(null);

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const pendingResolverRef = useRef<((v: boolean) => void) | null>(null);
  const [state, setState] = useState<InternalAlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [{ text: 'אישור', style: 'default' }],
    options: { cancelable: true },
  });

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const alert: AlertFn = useCallback((title, message, buttons, options) => {
    // If a confirm() was awaiting a result, resolve false by default.
    if (pendingResolverRef.current) {
      try {
        pendingResolverRef.current(false);
      } catch {}
      pendingResolverRef.current = null;
    }

    const safeButtons =
      buttons && buttons.length
        ? buttons
        : [
            {
              text: 'אישור',
              style: 'default',
            },
          ];
    setState({
      visible: true,
      title: String(title || ''),
      message: message ? String(message) : '',
      buttons: safeButtons,
      options: options ?? { cancelable: true },
    });
  }, []);

  // Allow hijacking native Alert.alert calls via a tiny event bus.
  // This keeps code using Alert.alert unchanged, while giving us RTL control.
  useEffect(() => {
    return subscribeAlerts((payload: NativeAlertPayload) => {
      const btns: AppAlertButton[] =
        payload.buttons && payload.buttons.length
          ? payload.buttons.map((b: NativeAlertButton) => ({
              text: String(b?.text || 'אישור'),
              onPress: b?.onPress,
              style: (b?.style as AlertButtonStyle) || 'default',
            }))
          : [{ text: 'אישור', style: 'default' }];
      alert(payload.title || '', payload.message, btns, payload.options);
    });
  }, [alert]);

  const confirm = useCallback(
    async ({
      title,
      message,
      confirmText = 'אישור',
      cancelText = 'ביטול',
      destructive,
      cancelable = true,
    }: ConfirmArgs) => {
      return await new Promise<boolean>((resolve) => {
        pendingResolverRef.current = resolve;
        alert(
          title,
          message,
          [
            {
              text: cancelText,
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: confirmText,
              style: destructive ? 'destructive' : 'default',
              onPress: () => resolve(true),
            },
          ],
          { cancelable }
        );
      }).finally(() => {
        pendingResolverRef.current = null;
      });
    },
    [alert]
  );

  const onPressBackdrop = useCallback(
    (_e: GestureResponderEvent) => {
      if (!state.options?.cancelable) return;
      // if there is a cancel button, treat backdrop as cancel
      const hasCancel = state.buttons.some((b) => b.style === 'cancel');
      if (hasCancel && pendingResolverRef.current) {
        try {
          pendingResolverRef.current(false);
        } catch {}
        pendingResolverRef.current = null;
      }
      dismiss();
    },
    [dismiss, state.buttons, state.options?.cancelable]
  );

  const ctx = useMemo<AppAlertContextValue>(() => ({ alert, confirm, dismiss }), [alert, confirm, dismiss]);

  const variant = useMemo<'success' | 'error' | 'warning' | 'info'>(() => {
    const t = String(state.title || '').trim();
    const m = String(state.message || '').trim();
    const hay = `${t}\n${m}`;
    if (t.includes('שגיאה') || hay.includes('לא ניתן') || hay.includes('לא הצלחנו') || hay.includes('נכשל')) return 'error';
    if (t.includes('אזהרה') || t.includes('שים לב')) return 'warning';
    if (t.includes('הצלחה') || t === 'נשלח' || t.includes('נשמר') || m.includes('נשלחה') || m.includes('נשלח')) return 'success';
    return 'info';
  }, [state.message, state.title]);

  const variantMeta = useMemo(() => {
    if (variant === 'success') {
      return { Icon: CheckCircle2, color: colors.success, bg: alpha(colors.success, 0.12) };
    }
    if (variant === 'error') {
      return { Icon: XCircle, color: '#FF3B30', bg: alpha('#FF3B30', 0.12) };
    }
    if (variant === 'warning') {
      return { Icon: TriangleAlert, color: '#F59E0B', bg: alpha('#F59E0B', 0.14) };
    }
    return { Icon: Info, color: colors.primary, bg: alpha(colors.primary, 0.12) };
  }, [variant]);

  const showIcon = useMemo(() => {
    // The preferences-survey prompt (and most "info" alerts) look cleaner without a centered icon.
    if (variant === 'info') return false;
    return true;
  }, [variant]);

  const primaryButtonIndex = useMemo(() => {
    if (!state.buttons.length) return 0;
    const destructiveIdx = state.buttons.findIndex((b) => b.style === 'destructive');
    if (destructiveIdx >= 0) return destructiveIdx;
    const nonCancel = state.buttons
      .map((b, idx) => ({ b, idx }))
      .filter(({ b }) => b.style !== 'cancel');
    // Prefer the last non-cancel action as primary (common Alert/confirm patterns).
    if (nonCancel.length) return nonCancel[nonCancel.length - 1].idx;
    return state.buttons.length - 1;
  }, [state.buttons]);

  const handleButtonPress = useCallback(
    (btn: AppAlertButton) => {
      dismiss();
      // Give the modal a frame to close so navigation feels smooth
      const run = () => {
        try {
          btn.onPress?.();
        } catch {}
      };
      if (Platform.OS === 'web') {
        setTimeout(run, 0);
      } else {
        requestAnimationFrame(run);
      }
    },
    [dismiss]
  );

  return (
    <AppAlertContext.Provider value={ctx}>
      {children}
      <Modal visible={state.visible} transparent animationType="fade" onRequestClose={dismiss}>
        <View style={styles.backdrop}>
          {Platform.OS !== 'web' ? (
            <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
          ) : null}
          <View style={styles.backdropDim} pointerEvents="none" />
          <Pressable style={StyleSheet.absoluteFill} onPress={onPressBackdrop} />
          <View style={styles.card}>
            {showIcon ? (
              <View style={styles.iconRow} accessible accessibilityRole="image">
                <View style={[styles.iconCircle, { backgroundColor: variantMeta.bg }]}>
                  <variantMeta.Icon size={20} color={variantMeta.color} />
                </View>
              </View>
            ) : null}
            <Text style={styles.title}>{state.title}</Text>
            {!!state.message ? <Text style={styles.message}>{state.message}</Text> : null}
            <View style={state.buttons.length > 2 ? styles.buttonsColumn : styles.buttonsRow}>
              {state.buttons.map((b, idx) => {
                const key = `${b.text}-${idx}`;
                const isCancel = b.style === 'cancel';
                const isDestructive = b.style === 'destructive';
                const isPrimary = idx === primaryButtonIndex;
                const buttonStyle =
                  state.buttons.length > 2
                    ? isPrimary
                      ? isDestructive
                        ? styles.btnPrimaryDestructive
                        : styles.btnPrimary
                      : styles.btnSecondary
                    : isPrimary
                      ? isDestructive
                        ? styles.btnPrimaryDestructive
                        : styles.btnPrimary
                      : isCancel
                        ? styles.btnSecondary
                        : styles.btnSecondary;

                const textStyle =
                  isPrimary ? styles.btnTextOnPrimary : isDestructive ? styles.btnTextDestructive : styles.btnTextOnSecondary;

                return (
                  <Pressable
                    key={key}
                    onPress={() => handleButtonPress(b)}
                    style={({ pressed }) => [
                      styles.btnBase,
                      buttonStyle,
                      pressed ? styles.btnPressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={b.text}>
                    <Text style={[styles.btnText, textStyle]}>{b.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </AppAlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha('#0B1220', 0.52),
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: alpha('#111827', 0.10),
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  iconRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: alpha('#111827', 0.06),
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 6,
  },
  message: {
    fontSize: 15,
    fontWeight: '700',
    color: alpha(colors.text, 0.88),
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
    marginBottom: 16,
  },
  buttonsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 10,
  },
  buttonsColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  btnBase: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.24),
  },
  btnPrimaryDestructive: {
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: alpha('#FF3B30', 0.25),
  },
  btnSecondary: {
    backgroundColor: alpha('#111827', 0.04),
    borderWidth: 1,
    borderColor: alpha('#111827', 0.10),
  },
  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  btnText: {
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
  btnTextOnPrimary: {
    color: '#FFFFFF',
  },
  btnTextOnSecondary: {
    color: colors.text,
  },
  btnTextDestructive: {
    color: '#FF3B30',
  },
});


