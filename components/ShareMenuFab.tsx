import { useMemo, useState } from 'react';
import { Linking, Share, StyleProp, View, ViewStyle } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { MotiPressable } from 'moti/interactions';

type FeatherIconName = keyof typeof Feather.glyphMap;
type FontAwesomeIconName = keyof typeof FontAwesome.glyphMap;

type ShareFabItemId = 'whatsapp' | 'telegram' | 'share';
type ShareFabItem = {
  id: ShareFabItemId;
  icon:
    | { set: 'feather'; name: FeatherIconName }
    | { set: 'fontawesome'; name: FontAwesomeIconName };
  accessibilityLabel: string;
  color: string;
};

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
}) {
  const [isOpen, setIsOpen] = useState(false);
  const iconSize = Math.round(size * 0.44);

  const menu: ShareFabItem[] = useMemo(
    () => [
      {
        id: 'whatsapp',
        icon: { set: 'fontawesome', name: 'whatsapp' },
        accessibilityLabel: 'שתף בוואטסאפ',
        color: '#25D366',
      },
      {
        id: 'telegram',
        icon: { set: 'fontawesome', name: 'telegram' },
        accessibilityLabel: 'שתף בטלגרם',
        color: '#229ED9',
      },
      {
        id: 'share',
        icon: { set: 'feather', name: 'share' },
        accessibilityLabel: 'שיתוף',
        color: '#F59E0B',
      },
    ],
    []
  );

  const onSelect = async (id: ShareFabItemId) => {
    try {
      if (disabled) return;
      const encoded = encodeURIComponent(message);
      if (id === 'whatsapp') {
        const appUrl = `whatsapp://send?text=${encoded}`;
        const webUrl = `https://wa.me/?text=${encoded}`;
        try {
          const can = await Linking.canOpenURL(appUrl);
          await Linking.openURL(can ? appUrl : webUrl);
        } catch {
          await Linking.openURL(webUrl);
        }
        return;
      }

      if (id === 'telegram') {
        const tgUrl = `https://t.me/share/url?text=${encoded}`;
        await Linking.openURL(tgUrl);
        return;
      }

      await Share.share({ message });
    } finally {
      setIsOpen(false);
    }
  };

  // Compute evenly-spaced angles so spacing between items feels consistent.
  // translateX uses sin(angle). Positive -> right, negative -> left.
  // - anchored left: open inward (right + up)  => positive angles
  // - anchored right: open inward (left + up)  => negative angles
  const angles = useMemo(() => {
    const start = Math.PI / 6; // ~30°
    const end = Math.PI / 2.15; // ~83.7°
    const count = Math.max(1, menu.length);
    const step = count === 1 ? 0 : (end - start) / (count - 1);
    const base = Array.from({ length: count }, (_, i) => start + step * i);
    return anchor === 'left' ? base : base.map((a) => -a);
  }, [anchor, menu.length]);
  const radius = size * radiusMultiplier;

  return (
    <View style={containerStyle}>
      <View style={{ position: 'absolute', width: size, height: size }}>
        {menu.map((item, index) => {
          const angle = angles[index] ?? angles[1]!;
          return (
            <MotiPressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              disabled={!!disabled || !isOpen}
              onPress={() => onSelect(item.id)}
              animate={{
                translateX: Math.sin(angle) * (isOpen ? radius : 3),
                translateY: -Math.cos(angle) * (isOpen ? radius : 3) + (isOpen ? menuOffsetY : 0),
                opacity: isOpen ? 1 : 0,
              }}
              transition={{ delay: index * 90 }}
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: menuButtonBg,
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.06)',
                zIndex: 20 + index,
                shadowColor: '#000000',
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: 10,
              }}
            >
              {item.icon.set === 'fontawesome' ? (
                <FontAwesome name={item.icon.name} size={iconSize} color={item.color} />
              ) : (
                <Feather name={item.icon.name} size={iconSize} color={item.color} />
              )}
            </MotiPressable>
          );
        })}
      </View>

      <MotiPressable
        accessibilityRole="button"
        accessibilityLabel={isOpen ? 'סגור אפשרויות שיתוף' : 'פתח אפשרויות שיתוף'}
        disabled={!!disabled}
        onPress={() => {
          if (disabled) return;
          setIsOpen((v) => !v);
        }}
        // Keep a subtle rotation for affordance, but use a share icon (not a "+")
        animate={{ rotate: isOpen ? '0deg' : '0deg' }}
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
        <Feather name={isOpen ? 'x' : 'share-2'} size={iconSize} color="#111827" />
      </MotiPressable>
    </View>
  );
}

