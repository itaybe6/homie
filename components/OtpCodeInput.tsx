import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, type TextInputKeyPressEventData, type NativeSyntheticEvent } from 'react-native';

type Props = {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  accentColor?: string;
};

export default function OtpCodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  accentColor = '#4C1D95',
}: Props) {
  const inputsRef = useRef<Array<TextInput | null>>([]);

  const digits = useMemo(() => {
    const cleaned = String(value || '').replace(/\D/g, '').slice(0, length);
    const arr = Array.from({ length }, (_, i) => cleaned[i] || '');
    return arr;
  }, [value, length]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputsRef.current[0]?.focus(), 50);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const setDigitAt = (index: number, digit: string) => {
    const cleaned = String(digit || '').replace(/\D/g, '');
    const nextDigits = [...digits];
    nextDigits[index] = cleaned.slice(0, 1);
    onChange(nextDigits.join(''));
  };

  const distributeFrom = (index: number, rawText: string) => {
    const cleaned = String(rawText || '').replace(/\D/g, '');
    if (!cleaned) {
      setDigitAt(index, '');
      return;
    }

    const nextDigits = [...digits];
    for (let i = 0; i < cleaned.length && index + i < length; i++) {
      nextDigits[index + i] = cleaned[i];
    }
    const nextValue = nextDigits.join('');
    onChange(nextValue);

    // Focus next empty cell (or last)
    const nextIndex =
      nextDigits.findIndex((d, i) => i > index && !d) !== -1
        ? nextDigits.findIndex((d, i) => i > index && !d)
        : Math.min(index + cleaned.length, length - 1);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleChangeText = (index: number, text: string) => {
    const cleaned = String(text || '').replace(/\D/g, '');
    if (!cleaned) {
      setDigitAt(index, '');
      return;
    }
    if (cleaned.length === 1) {
      setDigitAt(index, cleaned);
      if (index < length - 1) inputsRef.current[index + 1]?.focus();
      return;
    }
    distributeFrom(index, cleaned);
  };

  const handleKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (disabled) return;
    if (e.nativeEvent.key !== 'Backspace') return;

    if (digits[index]) {
      // Delete current
      setDigitAt(index, '');
      return;
    }

    if (index > 0) {
      // Move back and delete previous
      inputsRef.current[index - 1]?.focus();
      const nextDigits = [...digits];
      nextDigits[index - 1] = '';
      onChange(nextDigits.join(''));
    }
  };

  return (
    <View style={styles.row}>
      {digits.map((d, i) => {
        const isFilled = !!d;
        return (
          <View key={i} style={styles.cellWrap}>
            <TextInput
              ref={(r) => {
                inputsRef.current[i] = r;
              }}
              value={d}
              onChangeText={(t) => handleChangeText(i, t)}
              onKeyPress={(e) => handleKeyPress(i, e)}
              editable={!disabled}
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={i === 0 ? 'oneTimeCode' : 'none'}
              maxLength={length} // allows paste of multiple digits; we control display via value={d}
              style={[
                styles.cell,
                { borderColor: isFilled ? 'rgba(76,29,149,0.25)' : '#E5E7EB' },
                !disabled && styles.cellEnabled,
                !disabled && i === 0 && autoFocus ? styles.cellAutoFocusHint : null,
                { outlineColor: accentColor } as any,
              ]}
              placeholder="•"
              placeholderTextColor="#C7CDD6"
              selectionColor={accentColor}
              textAlign="center"
              inputMode="numeric"
              importantForAutofill={i === 0 ? 'yes' : 'no'}
              accessibilityLabel={`ספרה ${i + 1} מתוך ${length}`}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  cellWrap: {
    flex: 1,
  },
  cell: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  cellEnabled: {
    // tiny shadow on iOS to look like an input “tile”
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cellAutoFocusHint: {
    // no-op; keeps style slot for potential future tweaks
  },
});


