import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SectionList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../../../lib/supabase/client';
import { useAuth } from '../../../context/AuthContext';
import { fonts } from '../../../constants/colors';
import { eventVisibilityCutoffISO } from '../../../lib/eventLifecycle';

interface EventItem {
  id: string;
  name: string;
  date_time: string;
  address: string;
  profile_id?: string;
  owner_username?: string | null;
}

interface DmItem {
  chatId: string;
  otherId: string;
  otherName: string;
  otherUsername: string;
  otherAvatar?: string | null;
  lastMessage?: string | null;
  lastAt?: string | null;
}

// SectionList with heterogeneous item types — use a union and narrow inside renderItem
type AnyItem = DmItem | EventItem;
type Section = { key: 'dms' | 'events'; title: string; data: AnyItem[] };

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [eventItems, setEventItems] = useState<EventItem[]>([]);
  const [dmItems, setDmItems]       = useState<DmItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) {
      setEventItems([]);
      setDmItems([]);
      setLoading(false);
      return;
    }

    // Capture userId so channel callbacks don't close over stale state
    const uid = user.id;

    fetchAll(uid);

    const attendeesChannel = supabase
      .channel(`msg-attendees-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendees', filter: `user_id=eq.${uid}` },
        () => fetchAll(uid))
      .subscribe();

    const dmChannel = supabase
      .channel(`msg-dm-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        () => fetchDms(uid).then(() => { setLoading(false); setRefreshing(false); }))
      .subscribe();

    return () => {
      supabase.removeChannel(attendeesChannel);
      supabase.removeChannel(dmChannel);
    };
  }, [user?.id]);

  const fetchAll = useCallback(async (uid: string) => {
    await Promise.all([fetchEventChats(uid), fetchDms(uid)]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  async function fetchEventChats(uid: string) {
    const { data: attendeeRows } = await supabase
      .from('event_attendees')
      .select('event_id')
      .eq('user_id', uid);

    if (!attendeeRows || attendeeRows.length === 0) {
      setEventItems([]);
      return;
    }

    const eventIds = attendeeRows.map((r: any) => r.event_id);
    // Chats live and die with the event: hide once 24h past its start
    const { data: eventDetails } = await supabase
      .from('event')
      .select('id, name, date_time, address, profile_id')
      .in('id', eventIds)
      .gte('date_time', eventVisibilityCutoffISO())
      .order('date_time', { ascending: true });

    const ownerIds = [...new Set((eventDetails ?? []).map((e: any) => e.profile_id).filter(Boolean))];
    const { data: ownerProfiles } = ownerIds.length > 0
      ? await supabase.from('profiles').select('id, username').in('id', ownerIds)
      : { data: [] };

    const usernameMap: Record<string, string> = {};
    (ownerProfiles ?? []).forEach((p: any) => { usernameMap[p.id] = p.username; });

    setEventItems((eventDetails ?? []).map((e: any) => ({
      ...e,
      owner_username: usernameMap[e.profile_id] ?? null,
    })));
  }

  async function fetchDms(uid: string) {
    const { data: chats } = await supabase
      .from('direct_chats')
      .select('id, user1_id, user2_id')
      .or(`user1_id.eq.${uid},user2_id.eq.${uid}`);

    if (!chats || chats.length === 0) {
      setDmItems([]);
      return;
    }

    const otherIds = chats.map((c: any) => c.user1_id === uid ? c.user2_id : c.user1_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, username, profile_image_url')
      .in('id', otherIds);

    const profileMap: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    // For each chat, get last message
    const dmList = await Promise.all(
      (chats as any[]).map(async (c) => {
        const otherId = c.user1_id === uid ? c.user2_id : c.user1_id;
        const p = profileMap[otherId] ?? {};

        const { data: lastMsgs } = await supabase
          .from('direct_messages')
          .select('content, created_at')
          .eq('chat_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const last = lastMsgs?.[0] ?? null;
        return {
          chatId:        c.id,
          otherId,
          otherName:     p.name ?? 'User',
          otherUsername: p.username ?? '',
          otherAvatar:   p.profile_image_url ?? null,
          lastMessage:   last?.content ?? null,
          lastAt:        last?.created_at ?? null,
        } satisfies DmItem;
      })
    );

    // Sort newest first
    dmList.sort((a, b) => {
      if (!a.lastAt && !b.lastAt) return 0;
      if (!a.lastAt) return 1;
      if (!b.lastAt) return -1;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });

    setDmItems(dmList);
  }

  function onRefresh() {
    if (!user) return;
    setRefreshing(true);
    fetchAll(user.id);
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  function renderDm({ item }: { item: DmItem }) {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/(tabs)/messages/dm/${item.otherId}` as any)}
      >
        <View style={styles.cardLeft}>
          {item.otherAvatar ? (
            <Image source={{ uri: item.otherAvatar }} style={styles.dmAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.dmAvatar, styles.avatarFallback]}>
              <Ionicons name="person" size={20} color="#4A4A6A" />
            </View>
          )}
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.otherName}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.lastMessage ?? 'No messages yet'}
            </Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          {item.lastAt && <Text style={styles.cardTime}>{shortTime(item.lastAt)}</Text>}
          <Ionicons name="chevron-forward" size={16} color="#5A5A78" />
        </View>
      </TouchableOpacity>
    );
  }

  function renderEvent({ item }: { item: EventItem }) {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/(tabs)/messages/${item.id}` as any)}
      >
        <View style={styles.cardLeft}>
          <View style={styles.eventIcon}>
            <Ionicons name="calendar" size={22} color="#FF6B00" />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
            {item.owner_username && (
              <Text style={styles.cardSub} numberOfLines={1}>@{item.owner_username}</Text>
            )}
            <Text style={styles.cardSub} numberOfLines={1}>{formatDateTime(item.date_time)}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#5A5A78" />
      </TouchableOpacity>
    );
  }

  function renderSectionHeader({ section }: { section: Section }) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF6B00" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Ionicons name="person-outline" size={48} color="#2E2E40" />
        <Text style={styles.emptyText}>Log in to see your messages.</Text>
      </View>
    );
  }

  const sections: Section[] = [];
  if (dmItems.length > 0) {
    sections.push({ key: 'dms', title: 'Direct Messages', data: dmItems as AnyItem[] });
  }
  if (eventItems.length > 0) {
    sections.push({ key: 'events', title: 'Event Chats', data: eventItems as AnyItem[] });
  }

  const isEmpty = dmItems.length === 0 && eventItems.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Text style={styles.headerSubtitle}>
          {dmItems.length} DM{dmItems.length !== 1 ? 's' : ''} · {eventItems.length} event chat{eventItems.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {isEmpty ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={54} color="#2E2E40" />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>
            Join an event or message someone from their profile.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item: any) => item.chatId ?? item.id}
          renderItem={({ item, section }: { item: AnyItem; section: Section }) =>
            section.key === 'dms'
              ? renderDm({ item: item as DmItem })
              : renderEvent({ item: item as EventItem })
          }
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF6B00"
              colors={['#FF6B00']}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    backgroundColor: '#0F0F13',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A24',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fonts.display,
    color: '#F0F0FA',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: '#5A5A78',
    marginTop: 2,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#FF6B00',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2E2E40',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dmAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    flexShrink: 0,
  },
  avatarFallback: {
    backgroundColor: '#1E1E28',
    borderWidth: 1,
    borderColor: '#2E2E40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,107,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fonts.heading,
    color: '#F0F0FA',
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: '#7878A0',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fonts.heading,
    color: '#F0F0FA',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.body,
    color: '#7878A0',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  cardTime: {
    fontSize: 11,
    fontFamily: fonts.body,
    color: '#5A5A78',
  },
});
