import React from 'react';
import { Dimensions, Platform, StyleSheet, Text, TouchableWithoutFeedback, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';

const { width } = Dimensions.get('window');
const _defaultDuration = 450;

export type KeyFabPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  onEnterPassword?: () => void;
  /**
   * Optional overrides to reuse the same animated panel for other UI (e.g. filters).
   */
  title?: string;
  subtitle?: string;
  bodyText?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  children?: React.ReactNode;
  /**
   * Where the panel is anchored. Defaults to bottom (legacy behavior).
   */
  anchor?: 'bottom' | 'top';
  /**
   * Place the panel above sticky bottom UI (CTA). Example: ctaHeight + 12
   */
  bottomOffset?: number;
  /**
   * Place the panel below sticky top UI (e.g. search bar). Used when anchor="top".
   */
  topOffset?: number;
  /**
   * Optional style overrides for the panel container.
   */
  panelStyle?: ViewStyle;
  duration?: number;
  openedWidth?: number;
};

export function KeyFabPanel({
  isOpen,
  onClose,
  onEnterPassword,
  title,
  subtitle,
  bodyText,
  primaryActionLabel,
  onPrimaryAction,
  children,
  anchor = 'bottom',
  bottomOffset = 110,
  topOffset = 90,
  panelStyle,
  duration = _defaultDuration,
  openedWidth = width * 0.92,
}: KeyFabPanelProps) {
  if (!isOpen) return null;

  const resolvedTitle = (title ?? 'מצטרפים לדירה?').trim();
  const resolvedSubtitle = (subtitle ?? 'יש לכם סיסמה מבעל הדירה? תוכלו להכניס אותה ולהצטרף לדירה בלחיצה אחת').trim();
  const resolvedBodyText = (bodyText ?? 'נמשיך למסך הזנת סיסמה (6 ספרות).').trim();
  const resolvedPrimaryLabel = (primaryActionLabel ?? 'הכניסו את הסיסמא').trim();
  const resolvedPrimaryAction = onPrimaryAction ?? onEnterPassword;
  const placement = anchor === 'top' ? { top: topOffset } : { bottom: bottomOffset };
  const exitAnim = anchor === 'top' ? FadeOutUp : FadeOutDown;

  return (
    <Animated.View
      entering={FadeIn.duration(duration)}
      exiting={FadeOut.duration(duration)}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        entering={FadeInDown.duration(duration)}
        exiting={exitAnim.duration(duration)}
        layout={LinearTransition.duration(duration)}
        style={[
          styles.panel,
          {
            width: openedWidth,
            ...placement,
            left: (width - openedWidth) / 2,
          },
          panelStyle,
        ]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>{resolvedTitle}</Text>
            {resolvedSubtitle ? <Text style={styles.subheading}>{resolvedSubtitle}</Text> : null}
          </View>
          <TouchableWithoutFeedback onPress={onClose}>
            <Animated.View
              style={styles.closeBtn}
              layout={LinearTransition.duration(duration)}
              entering={FadeIn.duration(duration)}
              exiting={FadeOut.duration(duration)}
            >
              <X size={18} color="#5e3f2d" />
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>

        <Animated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={styles.content}
        >
          {children ? (
            children
          ) : (
            <>
              {resolvedBodyText ? <Text style={styles.bodyText}>{resolvedBodyText}</Text> : null}
              {resolvedPrimaryAction ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.9}
                  onPress={resolvedPrimaryAction}
                  accessibilityRole="button"
                  accessibilityLabel={resolvedPrimaryLabel || 'פעולה ראשית'}
                >
                  <Text style={styles.primaryBtnText}>{resolvedPrimaryLabel}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.28)',
  },
  panel: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.14)',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        }
      : { elevation: 10 }),
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  heading: {
    fontSize: 18,
    fontWeight: '900',
    color: '#5e3f2d',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subheading: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.14)',
  },
  content: {
    marginTop: 12,
  },
  bodyText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  primaryBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5e3f2d',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        }
      : { elevation: 6 }),
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});


