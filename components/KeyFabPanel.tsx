import React, { useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableWithoutFeedback, useColorScheme, useWindowDimensions, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { ChevronDown, X } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';

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
  anchor?: 'bottom' | 'top' | 'center';
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
  /**
   * Visual style variant for the panel chrome.
   * - default: legacy brown-accent card
   * - glass: modern translucent "glass" panel (Apple-like)
   */
  variant?: 'default' | 'glass';
  /**
   * Label for the close control (glass variant).
   */
  closeLabel?: string;
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
  openedWidth,
  variant = 'default',
  closeLabel = 'סגור',
}: KeyFabPanelProps) {
  const { width, height } = useWindowDimensions();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [measuredHeight, setMeasuredHeight] = useState<number>(420);

  const resolvedTitle = (title ?? 'מצטרפים לדירה?').trim();
  const resolvedSubtitle = (subtitle ?? 'יש לכם סיסמה מבעל הדירה? תוכלו להכניס אותה ולהצטרף לדירה בלחיצה אחת').trim();
  const resolvedBodyText = (bodyText ?? 'נמשיך למסך הזנת סיסמה (6 ספרות).').trim();
  const resolvedPrimaryLabel = (primaryActionLabel ?? 'הכניסו את הסיסמא').trim();
  const resolvedPrimaryAction = onPrimaryAction ?? onEnterPassword;

  const resolvedOpenedWidth = typeof openedWidth === 'number' ? openedWidth : width * 0.92;

  const chromeStyle = useMemo(() => {
    if (variant !== 'glass') return null;
    return isDark ? styles.panelGlassDark : styles.panelGlassLight;
  }, [variant, isDark]);

  const placement = useMemo(() => {
    const availableHeight = Math.max(0, height - topOffset - bottomOffset);
    // Always cap the panel height so it never "toggles" between clamped/unclamped
    // placements when content size changes. This prevents anchor jitter on state updates.
    const styleMaxHeight = (panelStyle as any)?.maxHeight;
    const maxHeight =
      typeof styleMaxHeight === 'number' ? Math.min(availableHeight, styleMaxHeight) : availableHeight;

    if (anchor === 'top') return { top: topOffset, maxHeight };
    if (anchor === 'center') {
      const effectiveHeight = Math.min(measuredHeight, maxHeight);
      const clamped = Math.max(
        topOffset,
        Math.min(height - effectiveHeight - bottomOffset, (height - effectiveHeight) / 2),
      );
      return { top: clamped, maxHeight };
    }

    // anchor === 'bottom'
    return { bottom: bottomOffset, maxHeight };
  }, [anchor, topOffset, bottomOffset, measuredHeight, height, panelStyle]);

  const exitAnim = anchor === 'top' ? FadeOutUp : FadeOutDown;

  // Hooks must run consistently across renders; only short-circuit after them.
  if (!isOpen) return null;

  const content = (
    <Animated.View
      entering={FadeIn.duration(duration)}
      exiting={FadeOut.duration(duration)}
      // Ensure the panel is always above screens/cards that use elevation/zIndex (Android especially).
      style={[StyleSheet.absoluteFill, { zIndex: 100000, elevation: 100000 }]}
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
          chromeStyle,
          panelStyle,
          {
            width: resolvedOpenedWidth,
            ...placement,
            left: (width - resolvedOpenedWidth) / 2,
          },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          // Only needed for anchor="center". For bottom/top anchors, measuring + reacting
          // to intermediate layout heights can cause position thrashing on fast UI changes.
          if (anchor !== 'center') return;
          if (h && Math.abs(h - measuredHeight) > 2) setMeasuredHeight(h);
        }}
      >
        {variant === 'glass' ? (
          <>
            {/* Glass background */}
            {Platform.OS === 'web' ? null : (
              <BlurView
                intensity={isDark ? 28 : 60}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={styles.headerRowGlass}>
              <TouchableOpacity
                style={[styles.closePill, isDark ? styles.closePillDark : null]}
                activeOpacity={0.9}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel || 'סגור'}
              >
                <ChevronDown size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <Text style={[styles.closePillText, isDark ? styles.closePillTextDark : null]}>
                  {closeLabel}
                </Text>
              </TouchableOpacity>

              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.headingGlass, isDark ? styles.headingGlassDark : null]}>{resolvedTitle}</Text>
                {resolvedSubtitle ? (
                  <Text style={[styles.subheadingGlass, isDark ? styles.subheadingGlassDark : null]}>
                    {resolvedSubtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </>
        ) : (
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
        )}

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

  // On web, render via Modal to escape clipping by parent overflow/stacking contexts.
  if (Platform.OS === 'web') {
    return (
      <Modal transparent visible onRequestClose={onClose}>
        {content}
      </Modal>
    );
  }

  return content;
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
  panelGlassLight: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.50)',
  },
  panelGlassDark: {
    backgroundColor: 'rgba(17,24,39,0.82)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerRowGlass: {
    flexDirection: 'row',
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
  headingGlass: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1F2937',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 24,
  },
  headingGlassDark: {
    color: '#F9FAFB',
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
  subheadingGlass: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
    opacity: 0.92,
  },
  subheadingGlassDark: {
    color: '#9CA3AF',
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
  closePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(243,244,246,0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
  },
  closePillDark: {
    backgroundColor: 'rgba(55,65,81,0.45)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  closePillText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 16,
    writingDirection: 'rtl',
  },
  closePillTextDark: {
    color: '#9CA3AF',
  },
  content: {
    marginTop: 12,
    flex: 1,
    minHeight: 0,
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


