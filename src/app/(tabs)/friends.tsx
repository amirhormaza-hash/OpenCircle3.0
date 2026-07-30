// Friends & requests. Reached from the Profile header.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SectionList, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts } from '../../constants/colors';
import {
  getPendingRequests, getFriends, acceptFriendRequest, removeFriend, type FriendProfile,
} from '../../lib/friendsQueries';

export default function FriendsScreen() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<FriendProfile[]>([]);
  const [friends, setFriends]   = useState<FriendProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busyId, setBusyId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const [reqs, fr] = await Promise.all([getPendingRequests(user.id), getFriends(user.id)]);
    setRequests(reqs);
    setFriends(fr);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function accept(p: FriendProfile) {
    if (!user) return;
    setBusyId(p.id);
    const { error } = await acceptFriendRequest(user.id, p.id);
    if (error) { Alert.alert('Error', 'Could not accept request.'); }
    else {
      setRequests(prev => prev.filter(r => r.id !== p.id));
      setFriends(prev => [p, ...prev]);
      Toast.show({ type: 'success', text1: `You and ${p.name} are now friends`, position: 'bottom' });
    }
    setBusyId(null);
  }

  async function decline(p: FriendProfile) {
    if (!user) return;
    setBusyId(p.id);
    const { error } = await removeFriend(user.id, p.id);
    if (error) Alert.alert('Error', 'Could not decline request.');
    else setRequests(prev => prev.filter(r => r.id !== p.id));
    setBusyId(null);
  }

  function confirmRemove(p: FriendProfile) {
    Alert.alert('Remove friend', `Remove ${p.name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          if (!user) return;
          setBusyId(p.id);
          const { error } = await removeFriend(user.id, p.id);
          if (error) Alert.alert('Error', 'Could not remove friend.');
          else setFriends(prev => prev.filter(f => f.id !== p.id));
          setBusyId(null);
        },
      },
    ]);
  }

  function Avatar({ p }: { p: FriendProfile }) {
    if (p.profile_image_url) {
      return <Image source={{ uri: p.profile_image_url }} style={styles.avatar} contentFit="cover" />;
    }
    return (
      <View style={[styles.avatar, styles.avatarFallback]}>
        <Ionicons name="person" size={20} color="#4A4A6A" />
      </View>
    );
  }

  function renderRow(p: FriendProfile, isRequest: boolean) {
    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.rowLeft}
          activeOpacity={0.75}
          onPress={() => router.push({ pathname: '/(tabs)/user-profile', params: { userId: p.id } })}
        >
          <Avatar p={p} />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.username} numberOfLines={1}>@{p.username}</Text>
          </View>
        </TouchableOpacity>

        {isRequest ? (
          <View style={styles.reqActions}>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => accept(p)}
              disabled={busyId === p.id}
              activeOpacity={0.85}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => decline(p)}
              disabled={busyId === p.id}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.moreBtn} onPress={() => confirmRemove(p)} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const sections = [
    ...(requests.length > 0 ? [{ key: 'requests', title: `Requests (${requests.length})`, data: requests, isRequest: true }] : []),
    { key: 'friends', title: `Friends (${friends.length})`, data: friends, isRequest: false },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friends</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.ember} style={{ marginTop: 60 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item, section }) => renderRow(item, (section as any).isRequest)}
          renderSectionHeader={({ section }) =>
            (section as any).data.length > 0
              ? <Text style={styles.sectionHeader}>{(section as any).title}</Text>
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={54} color={colors.line} />
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyText}>Find people at events and add them from their profile.</Text>
            </View>
          }
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  list: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  sectionHeader: {
    fontSize: 12, fontFamily: fonts.bold, color: colors.ember,
    textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 20, marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  avatarFallback: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 15, fontFamily: fonts.bold, color: colors.text, marginBottom: 2 },
  username: { fontSize: 13, fontFamily: fonts.body, color: colors.muted },
  reqActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptBtn: { backgroundColor: colors.ember, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  acceptText: { fontSize: 14, fontFamily: fonts.bold, color: '#fff' },
  declineBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  moreBtn: { paddingHorizontal: 8, paddingVertical: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: fonts.heading, color: colors.text, marginTop: 6 },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.muted, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
});
