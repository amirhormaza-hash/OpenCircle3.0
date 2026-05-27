// app/(tabs)/messages/index.tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase/client';
import { useAuth } from '../../../context/AuthContext';

interface EventItem {
  id: string;
  name: string;
  date_time: string;
  address: string;
  profile_id?: string;
  owner_username?: string | null;
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    fetchAttendedEvents();

    const attendeesChannel = supabase
      .channel('messages-event-attendees')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_attendees',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchAttendedEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attendeesChannel);
    };
  }, [user?.id]);

  async function fetchAttendedEvents() {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading((prev) => (refreshing ? prev : true));

      const { data: attendeeRows, error: attendeeError } = await supabase
        .from('event_attendees')
        .select('event_id')
        .eq('user_id', user.id);

      if (attendeeError) throw attendeeError;

      if (!attendeeRows || attendeeRows.length === 0) {
        setEvents([]);
        return;
      }

      const eventIds = attendeeRows.map((row) => row.event_id);

      const { data: eventDetails, error: eventsError } = await supabase
        .from('event')
        .select('id, name, date_time, address, profile_id')
        .in('id', eventIds)
        .order('date_time', { ascending: true });

      if (eventsError) throw eventsError;

      const ownerIds = [...new Set((eventDetails || []).map((e: any) => e.profile_id).filter(Boolean))];
      const { data: ownerProfiles } = ownerIds.length > 0
        ? await supabase.from('profiles').select('id, username').in('id', ownerIds)
        : { data: [] };

      const usernameMap: Record<string, string> = {};
      (ownerProfiles || []).forEach((p: any) => { usernameMap[p.id] = p.username; });

      setEvents((eventDetails || []).map((e: any) => ({
        ...e,
        owner_username: usernameMap[e.profile_id] ?? null,
      })));
    } catch (error) {
      console.error('Error fetching attended events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchAttendedEvents();
  }

  function openChat(eventId: string) {
    router.push(`/(tabs)/messages/${eventId}`);
  }

  function renderItem({ item }: { item: EventItem }) {
    return (
      <TouchableOpacity
        style={styles.chatCard}
        activeOpacity={0.85}
        onPress={() => openChat(item.id)}
      >
        <View style={styles.chatCardLeft}>
          <View style={styles.chatAvatar}>
            <Ionicons name="calendar" size={22} color="#FF6B00" />
          </View>
          <View style={styles.chatCardBody}>
            <Text style={styles.eventName} numberOfLines={1}>{item.name}</Text>
            {item.owner_username ? (
              <View style={styles.detailRow}>
                <Ionicons name="person-outline" size={13} color="#5A5A78" style={styles.detailIcon} />
                <Text style={styles.eventDetail} numberOfLines={1}>@{item.owner_username}</Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={13} color="#5A5A78" style={styles.detailIcon} />
              <Text style={styles.eventDetail} numberOfLines={1}>{formatDateTime(item.date_time)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={13} color="#5A5A78" style={styles.detailIcon} />
              <Text style={styles.eventDetail} numberOfLines={1}>{item.address}</Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#5A5A78" />
      </TouchableOpacity>
    );
  }

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={54} color="#2E2E40" />
      <Text style={styles.emptyTitle}>No chats yet</Text>
      <Text style={styles.emptyText}>
        Join an event to start chatting with attendees.
      </Text>
    </View>
  );

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
        <Text style={styles.emptyText}>Log in to see your event chats.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Text style={styles.headerSubtitle}>{events.length} active chat{events.length !== 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, events.length === 0 && styles.listEmpty]}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF6B00"
            colors={['#FF6B00']}
          />
        }
      />
    </SafeAreaView>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    fontWeight: '800',
    color: '#F0F0FA',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#5A5A78',
    marginTop: 2,
  },
  list: {
    padding: 16,
  },
  listEmpty: {
    flexGrow: 1,
  },
  chatCard: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2E2E40',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  chatAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E1228',
    borderWidth: 1,
    borderColor: '#3D1A10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatCardBody: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F0F0FA',
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  detailIcon: {
    marginRight: 4,
  },
  eventDetail: {
    fontSize: 13,
    color: '#7878A0',
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F0F0FA',
  },
  emptyText: {
    fontSize: 14,
    color: '#7878A0',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
