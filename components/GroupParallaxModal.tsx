import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { User } from '@/types/database';
import RoommateCard from '@/components/RoommateCard';

export default function GroupParallaxModal({
  visible,
  users,
  matchScores,
  onClose,
  onOpenProfile,
}: {
  visible: boolean;
  users: User[] | null;
  matchScores?: Record<string, number | null>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const insets = useSafeAreaInsets();

  const palette = useMemo(
    () => ({
      cardBg: 'rgba(255,255,255,0.92)',
      accent: '#8B5A3C',
      accentLight: 'rgba(139,90,60,0.12)',
      text: '#3D2814',
      textMuted: '#8C7A6A',
      border: 'rgba(139,90,60,0.15)',
      gradient1: '#FDF8F3',
      gradient2: '#F5EDE5',
    }),
    [],
  );

  const title = `פרופיל מאוחד${users?.length ? ` · ${users.length}` : ''}`;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 12) }]}>
          <View style={styles.sheetTopRow}>
            <View style={styles.grabber} />
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityRole="button">
              <X size={18} color="#111827" />
            </Pressable>
          </View>

          <LinearGradient
            colors={[palette.gradient1, palette.gradient2]}
            start={[0, 0]}
            end={[0, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: palette.text }]}>{title}</Text>
            <Text style={[styles.headerSubtitle, { color: palette.textMuted }]}>לחיצה ארוכה/סווייפ למעלה בכל כרטיס כדי לראות פרטים</Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces
            alwaysBounceVertical
          >
            {(users || []).map((u) => (
              <RoommateCard
                key={u.id}
                user={u}
                matchPercent={matchScores?.[u.id] ?? null}
                onLike={() => {}}
                onPass={() => {}}
                onOpen={(opened) => {
                  onClose();
                  onOpenProfile(opened.id);
                }}
                enableParallaxDetails
                initialDetailsOpen
                style={{ marginBottom: 12, borderColor: palette.border }}
                mediaHeight={520}
              />
            ))}
          </ScrollView>
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
  sheet: {
    minHeight: 360,
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  sheetTopRow: {
    position: 'relative',
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
  },
  grabber: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(139,90,60,0.22)',
  },
  closeBtn: {
    position: 'absolute',
    left: 0,
    top: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  header: {
    paddingTop: 6,
    paddingBottom: 12,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 10 as any,
  },
  loadingWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10 as any,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
});

