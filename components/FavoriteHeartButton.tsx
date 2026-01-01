import { MotiView } from 'moti';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';
import { Heart } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type FavoriteHeartButtonProps = {
  apartmentId: string;
  containerStyle?: StyleProp<ViewStyle>;
  size?: number;
  iconSize?: number;
  activeColor?: string;
  inactiveColor?: string;
  inactiveBackgroundColor?: string;
  activeBackgroundColor?: string;
  accessibilityLabelInactive?: string;
  accessibilityLabelActive?: string;
};

// Red like a "like" heart.
const DEFAULT_ACTIVE = '#FF2D55';
const DEFAULT_INACTIVE_BG = 'rgba(255,255,255,0.75)';
const DEFAULT_ACTIVE_BG = '#FFE6EC';

export default function FavoriteHeartButton({
  apartmentId,
  containerStyle,
  size = 40,
  iconSize = 18,
  activeColor = DEFAULT_ACTIVE,
  inactiveColor = DEFAULT_ACTIVE,
  inactiveBackgroundColor = DEFAULT_INACTIVE_BG,
  activeBackgroundColor = DEFAULT_ACTIVE_BG,
  accessibilityLabelInactive = 'הוסף לאהבתי',
  accessibilityLabelActive = 'הסר מאהבתי',
}: FavoriteHeartButtonProps) {
  const { user } = useAuthStore();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const labels = useMemo(
    () => ({
      on: accessibilityLabelActive,
      off: accessibilityLabelInactive,
    }),
    [accessibilityLabelActive, accessibilityLabelInactive]
  );

  useEffect(() => {
    let isCancelled = false;
    const checkIfLiked = async () => {
      if (!user?.id || !apartmentId) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('likes')
          .eq('id', user.id)
          .single();
        if (error) return;
        const likes: string[] = (data?.likes as any) || [];
        if (!isCancelled) setIsFavorite(likes.includes(apartmentId));
      } catch {
        // Ignore
      }
    };
    checkIfLiked();
    return () => {
      isCancelled = true;
    };
  }, [user?.id, apartmentId]);

  const toggleLike = useCallback(async () => {
    if (!user?.id || !apartmentId) return;

    setIsLoading(true);
    try {
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('likes')
        .eq('id', user.id)
        .single();
      if (fetchError) throw fetchError;

      const currentLikes: string[] = (userData?.likes as any) || [];
      const nextIsFavorite = !isFavorite;
      const nextLikes = nextIsFavorite
        ? Array.from(new Set([...currentLikes, apartmentId]))
        : currentLikes.filter((id) => id !== apartmentId);

      // Optimistic UI (so the animation plays immediately)
      setIsFavorite(nextIsFavorite);

      const { error: updateError } = await supabase
        .from('users')
        .update({ likes: nextLikes, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;
    } catch (e) {
      // Revert optimistic change on failure
      setIsFavorite((prev) => !prev);
      console.error('Error toggling like:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, apartmentId, isFavorite]);

  const onPress = useCallback(
    (e: any) => {
      e?.stopPropagation?.();
      if (isLoading) return;
      void toggleLike();
    },
    [isLoading, toggleLike]
  );

  const containerRadius = Math.round(size / 2);
  const innerPadding = Math.max(10, Math.round(size * 0.25));
  const icon = Math.max(14, iconSize);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? labels.on : labels.off}
      disabled={isLoading}
      hitSlop={10}
      style={({ pressed }) => [
        {
          opacity: isLoading ? 0.6 : pressed ? 0.92 : 1,
        },
        containerStyle,
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: containerRadius,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.2,
          shadowRadius: 10,
        }}
      >
        <MotiView
          animate={{
            backgroundColor: isFavorite ? activeBackgroundColor : inactiveBackgroundColor,
          }}
          transition={{
            type: 'timing',
            duration: 180,
          }}
          style={{
            width: size,
            height: size,
            borderRadius: containerRadius,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.06)',
          }}
        >
          {/* Burst fill (only when activating) */}
          <MotiView
            from={{ scale: 1, opacity: 0 }}
            animate={{
              scale: isFavorite ? 5 : 1,
              opacity: isFavorite ? 1 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 72,
              damping: 12,
            }}
          >
            <Heart size={icon * 2.2} color={activeColor} fill={activeColor} />
          </MotiView>

          {/* Outline heart (inactive state) */}
          <MotiView
            from={{ scale: 1, opacity: 1 }}
            animate={{
              scale: isFavorite ? 0.6 : 1,
              opacity: isFavorite ? 0 : 1,
            }}
            transition={{
              type: 'spring',
              stiffness: 120,
              damping: 14,
            }}
            style={{ position: 'absolute' }}
          >
            <Heart size={icon} color={inactiveColor} fill="transparent" />
          </MotiView>

          {/* Solid heart (active state) */}
          <MotiView
            from={{ scale: 0.6, opacity: 0 }}
            animate={{
              // No delay so the icon never "disappears" on press.
              scale: isFavorite ? [0.7, 1.05, 1] : 0.6,
              opacity: isFavorite ? 1 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 120,
              damping: 14,
            }}
            style={{ position: 'absolute' }}
          >
            <Heart size={icon} color="#fff" fill="#fff" />
          </MotiView>

          {/* Ring pop */}
          <MotiView
            from={{
              scale: 0.2,
              opacity: 0,
              borderWidth: 4,
            }}
            animate={{
              scale: isFavorite ? [0, 1.6, 1.7] : 0.2,
              opacity: isFavorite ? [1, 1, 0] : 0,
              borderWidth: isFavorite ? [2, 2, 0] : 0,
            }}
            transition={{
              type: 'timing',
              duration: 250,
            }}
            style={{
              position: 'absolute',
              borderColor: '#fff',
              width: size - innerPadding,
              height: size - innerPadding,
              borderRadius: Math.round((size - innerPadding) / 2),
            }}
          />
        </MotiView>
      </View>
    </Pressable>
  );
}

