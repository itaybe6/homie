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
          <Pressable style={StyleSheet.absoluteFill} onPress={onPressBackdrop} />
          <View style={styles.card}>
            <View style={styles.iconWrap} accessible accessibilityRole="image">
              <View style={[styles.iconCircle, { backgroundColor: variantMeta.bg }]}>
                <variantMeta.Icon size={22} color={variantMeta.color} />
              </View>
            </View>
            <Text style={styles.title}>{state.title}</Text>
            {!!state.message ? <Text style={styles.message}>{state.message}</Text> : null}
            <View style={styles.divider} />
            <View style={state.buttons.length > 2 ? styles.buttonsColumn : styles.buttonsRow}>
              {state.buttons.map((b, idx) => {
                const key = `${b.text}-${idx}`;
                const isDestructive = b.style === 'destructive';
                const isCancel = b.style === 'cancel';
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleButtonPress(b)}
                    style={({ pressed }) => [
                      styles.btn,
                      state.buttons.length > 2
                        ? (idx !== state.buttons.length - 1 ? styles.btnDividerColumn : null)
                        : (idx !== state.buttons.length - 1 ? styles.btnDivider : null),
                      pressed ? styles.btnPressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={b.text}
                  >
                    <Text style={[styles.btnText, isCancel ? styles.btnTextCancel : null, isDestructive ? styles.btnTextDestructive : null]}>
                      {b.text}
                    </Text>
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
    backgroundColor: alpha('#111827', 0.55),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.14),
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 6,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: alpha('#111827', 0.06),
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
    marginBottom: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha('#111827', 0.12),
  },
  buttonsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },
  buttonsColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { backgroundColor: alpha(colors.primary, 0.06) },
  btnDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: alpha('#111827', 0.12),
  },
  btnDividerColumn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha('#111827', 0.12),
  },
  btnText: {
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    color: colors.primary,
  },
  btnTextCancel: { color: colors.primaryMuted, fontWeight: '900' },
  btnTextDestructive: { color: '#FF3B30' },
});


