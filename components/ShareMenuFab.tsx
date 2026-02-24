import { Share, StyleProp, View, ViewStyle } from 'react-native';
import { MotiPressable } from 'moti/interactions';
import { Share2 } from 'lucide-react-native';

export function ShareMenuFab({
  disabled,
  message,
  size = 36,
  anchor = 'left',
  menuOffsetY = 0,
  radiusMultiplier = 1.7,
  containerStyle,
  mainButtonStyle,
  menuButtonBg = 'rgba(255,255,255,0.9)',
  menuIconColor = 'rgba(17,24,39,0.55)',
}: {
  disabled?: boolean;
  message: string;
  size?: number;
  anchor?: 'left' | 'right';
  menuOffsetY?: number;
  radiusMultiplier?: number;
  containerStyle?: StyleProp<ViewStyle>;
  mainButtonStyle?: StyleProp<ViewStyle>;
  menuButtonBg?: string;
  menuIconColor?: string;
}) {
  const iconSize = Math.round(size * 0.44);

  return (
    <View style={containerStyle}>
      <MotiPressable
        accessibilityRole="button"
        accessibilityLabel="שיתוף"
        disabled={!!disabled}
        onPress={async () => {
          if (disabled) return;
          await Share.share({ message });
        }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            elevation: 8,
          },
          mainButtonStyle,
        ]}
      >
        <Share2 size={iconSize} color={menuIconColor} />
      </MotiPressable>
    </View>
  );
}

