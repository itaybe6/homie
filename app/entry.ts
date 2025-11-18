import * as React from 'react';
import { Platform, StyleSheet, Text, TextInput, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTE: Avoid using I18nManager.forceRTL which requires a native reload and may conflict
// with Expo Go. Instead, on native we enforce RTL text defaults at the component level.

type TextLikeComponent = typeof Text | typeof TextInput;

// Ensure global RTL on native once (before app UI mounts)
if (Platform.OS !== 'web') {
  (async () => {
    try {
      // Always allow RTL and swap logical left/right on native
      I18nManager.allowRTL(true);
      I18nManager.swapLeftAndRightInRTL(true);
    } catch {
      // ignore
    }
  })();
}

// Silence noisy console output on web (keep errors)
if (Platform.OS === 'web') {
  const noop = () => {};
  // Common noisy channels during dev
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
}

const appendDefaultStyle = (Component: TextLikeComponent, style: Record<string, unknown>) => {
  const defaults = (Component as any).defaultProps ?? {};
  const existingStyle = defaults.style;
  const flattened = existingStyle ? StyleSheet.flatten(existingStyle) : undefined;

  const missingEntries = Object.entries(style).filter(([key]) => {
    if (!flattened) return true;
    return flattened[key] === undefined;
  });

  if (missingEntries.length === 0) {
    return;
  }

  const missingStyle = Object.fromEntries(missingEntries);

  (Component as any).defaultProps = {
    ...defaults,
    style: existingStyle
      ? Array.isArray(existingStyle)
        ? [...existingStyle, missingStyle]
        : [existingStyle, missingStyle]
      : missingStyle,
  };
};

appendDefaultStyle(Text, {
  writingDirection: 'rtl',
  textAlign: 'right',
} as const);
appendDefaultStyle(TextInput, {
  writingDirection: 'rtl',
  textAlign: 'right',
} as const);

// On some RN versions defaultProps for host components might not be honored in Expo Go.
// As a fallback, patch render to inject RTL styles for native only.
if (Platform.OS !== 'web') {
  const patchRender = (Component: any) => {
    const originalRender = Component.render ?? Component.prototype?.render;
    if (typeof originalRender !== 'function') return;
    const injected = function (this: unknown, ...args: unknown[]) {
      const element = (originalRender as any).apply(this, args);
      if (!element || !element.props) return element;
      const baseRtl = { writingDirection: 'rtl' as const, textAlign: 'right' as const };
      const nextStyle = element.props.style
        ? Array.isArray(element.props.style)
          ? [baseRtl, ...element.props.style]
          : [baseRtl, element.props.style]
        : baseRtl;
      return React.cloneElement(element, { style: nextStyle });
    };
    if (Component.render) Component.render = injected;
    else if (Component.prototype?.render) Component.prototype.render = injected;
  };
  patchRender(Text);
  patchRender(TextInput);
}

import 'expo-router/entry';

// Add a no-op default export to avoid expo-router warning about missing default export
export default function EntryNoop() {
  return null;
}

