// Used in: (tabs)/profile-settings.tsx
//
// The in-app place to see and undo blocks. Before this existed, Settings sent
// users to a mailto: link to ask us to block someone for them, which is what
// App Review flagged under Guideline 1.2 — blocking has to be something the
// user can do themselves, in the app, and undo.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlockedUser, fetchBlockedUsers, unblockUser } from '@/lib/moderationQueries';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function BlockedUsersModal({ visible, onClose }: Props) {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchBlockedUsers();
    setBlocked(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      load();
    }
  }, [visible, load]);

  function confirmUnblock(user: BlockedUser) {
    Alert.alert(
      `Unblock ${user.name}?`,
      'They will be able to message you, send friend requests, and see your content again. Their events will reappear in your feed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            setBusyId(user.blockedId);
            const { error } = await unblockUser(user.blockedId);
            setBusyId(null);

            if (error) {
              Alert.alert('Could not unblock', error);
              return;
            }
            setBlocked((prev) => prev.filter((b) => b.blockedId !== user.blockedId));
          },
        },
      ],
    );
  }

  function initials(name: string) {
    return name.trim().slice(0, 1).toUpperCase() || '?';
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerBtn} />
          <Text style={styles.headerTitle}>Blocked Users</Text>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FF6B00" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await load();
                  setRefreshing(false);
                }}
                tintColor="#FF6B00"
              />
            }
          >
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color="#7878A0" />
              <Text style={styles.infoText}>
                Blocked users cannot message you, send you friend requests, or
                see your content, and their events are hidden from your feed.
                They are not told that you blocked them.
              </Text>
            </View>

            {blocked.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="shield-checkmark-outline" size={40} color="#3A3A55" />
                <Text style={styles.emptyTitle}>No blocked users</Text>
                <Text style={styles.emptyText}>
                  You can block someone from their profile, from a chat, or by
                  long-pressing one of their messages.
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                {blocked.map((user, index) => (
                  <View key={user.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.row}>
                      {user.profileImage ? (
                        <Image
                          source={{ uri: user.profileImage }}
                          style={styles.avatar}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarText}>{initials(user.name)}</Text>
                        </View>
                      )}

                      <View style={styles.rowInfo}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {user.name}
                        </Text>
                        {!!user.username && (
                          <Text style={styles.rowHandle} numberOfLines={1}>
                            @{user.username}
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={styles.unblockBtn}
                        onPress={() => confirmUnblock(user)}
                        disabled={busyId === user.blockedId}
                        activeOpacity={0.8}
                      >
                        {busyId === user.blockedId ? (
                          <ActivityIndicator size={14} color="#FF6B00" />
                        ) : (
                          <Text style={styles.unblockText}>Unblock</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F13' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2A',
  },
  headerBtn: { width: 70 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#F0F0FA' },
  doneText: { fontSize: 15, fontWeight: '700', color: '#FF6B00', textAlign: 'right' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#1A1A24',
    borderColor: '#2E2E40',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 13, color: '#7878A0', lineHeight: 19 },
  card: {
    backgroundColor: '#1A1A24',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2E2E40',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#2E2E40', marginLeft: 66 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0F0F13' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#5A5A78' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700', color: '#F0F0FA' },
  rowHandle: { fontSize: 13, color: '#7878A0', marginTop: 2 },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF6B0055',
    backgroundColor: '#FF6B0014',
    minWidth: 78,
    alignItems: 'center',
  },
  unblockText: { fontSize: 13, fontWeight: '700', color: '#FF6B00' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#F0F0FA' },
  emptyText: {
    fontSize: 13,
    color: '#5A5A78',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 30,
  },
});
