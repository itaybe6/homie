import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { User } from '@/types/database';
import RoommateCard from '@/components/RoommateCard';

export default function UserParallaxModal({
  visible,
  user,
  matchPercent,
  onClose,
  onOpenProfile,
}: {
  visible: boolean;
  user: User | null;
  matchPercent?: number | null;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.cardWrap, { paddingBottom: Math.max(16, insets.bottom + 12) }]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityRole="button">
            <X size={18} color="#E5E7EB" />
          </Pressable>

          {user ? (
            <RoommateCard
              user={user}
              matchPercent={matchPercent ?? null}
              onLike={() => {}}
              onPass={() => {}}
              onOpen={(u) => onOpenProfile(u.id)}
              enableParallaxDetails
              initialDetailsOpen
              style={{ marginBottom: 0 }}
              mediaHeight={520}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cardWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    left: 16,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});

