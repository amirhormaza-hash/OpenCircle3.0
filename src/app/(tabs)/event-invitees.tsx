// Host view: who accepted / is pending / rejected for a friends-only event.
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SectionList, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/colors';
import { getEventInvitees, type Invitee, type InviteStatus } from '../../lib/invitesQueries';

const STATUS_META: Record<InviteStatus, { title: string; color: string; icon: string }> = {
  accepted: { title: 'Going',    color: '#22C55E', icon: 'checkmark-circle' },
  pending:  { title: 'Pending',  color: '#FFB800', icon: 'time' },
  rejected: { title: "Can't go", color: '#EF4444', icon: 'close-circle' },
};

export default function EventInviteesScreen() {
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName?: string }>();
  const id = Array.isArray(eventId) ? eventId[0] : eventId ?? '';
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    const data = await getEventInvitees(id);
    setInvitees(data);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const order: InviteStatus[] = ['accepted', 'pending', 'rejected'];
  const sections = order
    .map((status) => ({
      key: status,
      status,
      data: invitees.filter((i) => i.status === status),
    }))
    .filter((s) => s.data.length > 0);

  function renderRow(p: Invitee) {
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/(tabs)/user-profile', params: { userId: p.id } })}
      >
        {p.profile_image_url ? (
          <Image source={{ uri: p.profile_image_url }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={20} color="#4A4A6A" />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
          <Text style={styles.username} numberOfLines={1}>@{p.username}</Text>
        </View>
        <Ionicons name={STATUS_META[p.status].icon as 'checkmark-circle'} size={22} color={STATUS_META[p.status].color} />
      </TouchableOpacity>
    );
  }

  const counts = {
    accepted: invitees.filter((i) => i.status === 'accepted').length,
    pending:  invitees.filter((i) => i.status === 'pending').length,
    rejected: invitees.filter((i) => i.status === 'rejected').length,
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>Invitees</Text>
          {!!eventName && <Text style={styles.headerSub} numberOfLines={1}>{eventName}</Text>}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.ember} style={{ marginTop: 60 }} />
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryNum, { color: '#22C55E' }]}>{counts.accepted}</Text>
              <Text style={styles.summaryLabel}>Going</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryNum, { color: '#FFB800' }]}>{counts.pending}</Text>
              <Text style={styles.summaryLabel}>Pending</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryNum, { color: '#EF4444' }]}>{counts.rejected}</Text>
              <Text style={styles.summaryLabel}>Can't go</Text>
            </View>
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderRow(item)}
            renderSectionHeader={({ section }) => (
              <Text style={[styles.sectionHeader, { color: STATUS_META[(section as any).status as InviteStatus].color }]}>
                {STATUS_META[(section as any).status as InviteStatus].title} ({(section as any).data.length})
              </Text>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={54} color={colors.line} />
                <Text style={styles.emptyText}>No one was invited to this event.</Text>
              </View>
            }
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
          />
        </>
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
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 18, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontFamily: fonts.body, color: colors.muted, marginTop: 1 },
  summary: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.line, marginHorizontal: 16, marginTop: 4, paddingVertical: 16,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.line, marginVertical: 4 },
  summaryNum: { fontSize: 24, fontFamily: fonts.display },
  summaryLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.muted, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  sectionHeader: {
    fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase',
    letterSpacing: 1.2, marginTop: 22, marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  avatarFallback: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 15, fontFamily: fonts.bold, color: colors.text, marginBottom: 2 },
  username: { fontSize: 13, fontFamily: fonts.body, color: colors.muted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 70 },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.muted, textAlign: 'center', paddingHorizontal: 40 },
});
