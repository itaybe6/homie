import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextProps, TextStyle, View } from 'react-native';
import { MotiView } from 'moti';

const numbersToNine = [...Array(10).keys()]; // [0..9]
const LINE_HEIGHT_MULT = 1.28;
const EXTRA_CELL_PX = 2;

type TickerListProps = {
  number: number;
  fontSize: number;
  index: number;
  staggerDuration: number;
  style?: TextStyle;
};

type TickerProps = {
  value: number | string;
  fontSize?: number;
  staggerDuration?: number;
  style?: TextStyle;
};

function Tick({
  children,
  fontSize,
  style,
  ...rest
}: TextProps & { fontSize: number }) {
  const lineHeight = Math.ceil(fontSize * LINE_HEIGHT_MULT);
  const cellHeight = lineHeight + EXTRA_CELL_PX;
  return (
    <Text
      style={[
        {
          fontSize,
          lineHeight,
          fontWeight: '900',
          // Avoid clipping descenders / bottom edge on some platforms
          height: cellHeight,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

function TickerList({ number, fontSize, index, staggerDuration, style }: TickerListProps) {
  const lineHeight = Math.ceil(fontSize * LINE_HEIGHT_MULT);
  const cellHeight = lineHeight + EXTRA_CELL_PX;
  return (
    <View
      style={{
        height: cellHeight,
        overflow: 'hidden',
      }}
    >
      <MotiView
        animate={{
          translateY: -cellHeight * number,
        }}
        transition={{
          delay: index * staggerDuration,
        }}
      >
        {numbersToNine.map((num) => (
          <Tick key={`ticker-${index}-${num}`} fontSize={fontSize} style={style}>
            {num}
          </Tick>
        ))}
      </MotiView>
    </View>
  );
}

export default function Ticker({
  value,
  fontSize = 16,
  staggerDuration = 60,
  style,
}: TickerProps) {
  const splitValue = useMemo(() => String(value).split(''), [value]);

  // Keep the original behavior: measure actual ascender so it fits well across platforms.
  const [newFontSize, setNewFontSize] = useState(fontSize);

  // Reset measured size if the caller changes fontSize
  useEffect(() => setNewFontSize(fontSize), [fontSize]);

  return (
    <View>
      <Tick
        fontSize={fontSize}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          style,
          {
            position: 'absolute',
            left: 100000,
            top: 100000,
            // without this, the onTextLayout is not working.
            lineHeight: undefined,
          } as any,
        ]}
        onTextLayout={(e) => {
          // Prefer the actual measured line height when available (avoids clipping).
          const next = Math.floor((e.nativeEvent.lines?.[0] as any)?.height ?? fontSize);
          if (!next || next === newFontSize) return;
          setNewFontSize(next);
        }}
      >
        {String(value)}
      </Tick>

      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' }}>
        {splitValue.map((char, index) => {
          const digit = parseInt(char, 10);
          if (!Number.isNaN(digit)) {
            return (
              <TickerList
                key={`digit-${index}`}
                fontSize={newFontSize}
                number={digit}
                index={index}
                staggerDuration={staggerDuration}
                style={style}
              />
            );
          }

          return (
            <Tick key={`char-${index}`} fontSize={newFontSize} style={[style, { opacity: 0.35 }]}>
              {char}
            </Tick>
          );
        })}
      </View>
    </View>
  );
}


