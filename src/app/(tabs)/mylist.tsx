import React, { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { useBadge } from '../../context/BadgeContext';
import {
  View,
  FlatList,
  Text,
  RefreshControl,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import EventCard from '../../components/EventCard';
import SkeletonCard from '../../components/SkeletonCard';
import FullScreenImageViewer from '../../components/FullScreenImageViewer';
// Pulsing icon + title + message for when the user has no events
import AnimatedEmptyState from '../../components/AnimatedEmptyState';
// Bottom-sheet modal with event image gallery, info boxes, and action buttons
import EventDetailsModal, { actionButtonStyles } from '../../components/EventDetailsModal';
import { supabase } from '../../lib/supabase/client';
import { calculateEventRating } from '../../lib/ratingSystem';
import { isEventExpired, isInRatingWindow } from '../../lib/eventLifecycle';
import { submitEventRating } from '../../lib/profileQueries';
import Toast from 'react-native-toast-message';

type EventItem = {
  id: string;
  name: string;
  date_time: string;
  address: string;
  number_of_guests?: number;
  attendee_count?: number;
  profile_id?: string;
  owner_username?: string | null;
  owner_profile_id?: string | null;
  rating?: number | null;
  description?: string;
  category?: string;
  level?: string;
  created_at?: string;
  first_image_url?: string | null;
  image_urls?: string[];
};

export default function MyList() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'created' | 'joined'>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [myStarsByEvent, setMyStarsByEvent] = useState<Record<string, number>>({});
  const { setMyListBadge } = useBadge();

  function handlePressEvent(event: EventItem) {
    setSelectedEvent(event);
  }

  function closeModal() {
    setSelectedEvent(null);
  }

  function handleEditEvent(event: EventItem) {
    closeModal();
    router.push({
      pathname: '/(tabs)/edit-event',
      params: {
        id: event.id,
        name: event.name ?? '',
        address: event.address ?? '',
        description: event.description ?? '',
        number_of_guests: String(event.number_of_guests ?? ''),
        category: event.category ?? '',
        level: event.level ?? '',
        date_time: event.date_time ?? '',
      },
    });
  }

  async function handleModalLeave() {
    if (!selectedEvent) return;
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const { error } = await supabase
      .from('event_attendees')
      .delete()
      .eq('event_id', selectedEvent.id)
      .eq('user_id', user.id);
    if (error) {
      Alert.alert('Error', 'Could not leave event.');
    } else {
      setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
      closeModal();
    }
  }

  function getImageUrl(imagePath: string): string {
    const { data } = supabase.storage.from('event-images').getPublicUrl(imagePath);
    return data.publicUrl;
  }

  async function fetchMyEvents() {
    setLoading(true);

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setCurrentUserId(user.id);

    const { data: attendeeRows, error: attendeeError } = await supabase
      .from('event_attendees')
      .select('event_id')
      .eq('user_id', user.id);

    if (attendeeError || !attendeeRows || attendeeRows.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const joinedIds = attendeeRows.map((r) => r.event_id);

    const { data, error } = await supabase
      .from('event')
      .select(`
        id,
        name,
        date_time,
        address,
        number_of_guests,
        profile_id,
        description,
        category,
        level,
        created_at,
        event_images (
          image_path,
          position
        )
      `)
      .in('id', joinedIds)
      .order('created_at', { ascending: false });

    if (error) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const ownerIds = [...new Set((data || []).map((e: any) => e.profile_id).filter(Boolean))];

    const [attendeeResult, ownerResult, ratingsResult] = await Promise.all([
      joinedIds.length > 0
        ? supabase.from('event_attendees').select('event_id').in('event_id', joinedIds)
        : Promise.resolve({ data: [] }),
      ownerIds.length > 0
        ? supabase.from('profiles').select('id, username').in('id', ownerIds)
        : Promise.resolve({ data: [] }),
      joinedIds.length > 0
        ? supabase.from('event_ratings').select('event_id, stars, rater_id').in('event_id', joinedIds)
        : Promise.resolve({ data: [] }),
    ]);

    let countMap: Record<string, number> = {};
    (attendeeResult.data || []).forEach((a: any) => {
      countMap[a.event_id] = (countMap[a.event_id] || 0) + 1;
    });

    const usernameMap: Record<string, string> = {};
    (ownerResult.data || []).forEach((p: any) => { usernameMap[p.id] = p.username; });

    type StarMap = { 1: number; 2: number; 3: number; 4: number; 5: number };
    const starsByEvent: Record<string, StarMap> = {};
    const mineByEvent: Record<string, number> = {};
    (ratingsResult.data || []).forEach((r: any) => {
      if (!starsByEvent[r.event_id]) starsByEvent[r.event_id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      if (r.stars >= 1 && r.stars <= 5) starsByEvent[r.event_id][r.stars as 1|2|3|4|5]++;
      if (r.rater_id === user.id) mineByEvent[r.event_id] = r.stars;
    });
    setMyStarsByEvent(mineByEvent);

    // Hide events past their 24h window, and joined events the user has
    // already rated — once rated, their card's job is done.
    const formattedEvents: EventItem[] = (data || [])
      .filter((item: any) => !isEventExpired(item.date_time) && mineByEvent[item.id] == null)
      .map((item: any) => {
      const sortedImages = [...(item.event_images || [])].sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
      );
      const imageUrls = sortedImages
        .filter((img: any) => img.image_path)
        .map((img: any) => getImageUrl(img.image_path));

      const attendees = countMap[item.id] ?? 0;
      const starCounts = starsByEvent[item.id] ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const rating = calculateEventRating(attendees, starCounts);

      return {
        ...item,
        image_urls: imageUrls,
        first_image_url: imageUrls[0] || null,
        attendee_count: attendees,
        owner_profile_id: item.profile_id ?? null,
        owner_username: usernameMap[item.profile_id] ?? null,
        rating,
      };
    });

    setEvents(formattedEvents);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchMyEvents();
    setRefreshing(false);
  }

  // Returns true when the rating is saved (or already existed) — the card
  // uses that to animate itself off the list.
  async function handleRate(eventId: string, stars: 1 | 2 | 3 | 4 | 5): Promise<boolean> {
    if (!currentUserId) return false;
    const { error, code } = await submitEventRating(eventId, currentUserId, stars);
    if (error) {
      console.error('submitEventRating failed:', code, error);
      if (code === '23505') {
        // Unique violation — a rating from this user already exists
        setMyStarsByEvent((prev) => ({ ...prev, [eventId]: stars }));
        Toast.show({ type: 'info', text1: 'Already rated', text2: 'You already rated this event.', position: 'bottom' });
        return true;
      }
      const friendly =
        code === '42501'
          ? 'Rating is only open to attendees during the 24 hours after the event starts.'
          : `Could not submit your rating.\n\n${error}`;
      Alert.alert('Rating not submitted', friendly);
      fetchMyEvents();
      return false;
    }
    setMyStarsByEvent((prev) => ({ ...prev, [eventId]: stars }));
    Toast.show({ type: 'success', text1: 'Rating submitted', text2: 'Thanks for the feedback!', position: 'bottom' });
    return true;
  }

  useFocusEffect(
    useCallback(() => {
      setMyListBadge(false);
      fetchMyEvents();
    }, [setMyListBadge])
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />
      <FlatList
        data={events.filter((e) => {
          if (viewMode === 'created') return e.profile_id === currentUserId;
          if (viewMode === 'joined') return e.profile_id !== currentUserId;
          return true;
        })}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={handlePressEvent}
            onDelete={() => setEvents((prev) => prev.filter((e) => e.id !== item.id))}
            onLeave={() => setEvents((prev) => prev.filter((e) => e.id !== item.id))}
            onEdit={handleEditEvent}
            onOwnerPress={(userId) => router.push({ pathname: '/(tabs)/user-profile', params: { userId } })}
            slideDirection="left"
            ratable={item.profile_id !== currentUserId && isInRatingWindow(item.date_time)}
            myStars={myStarsByEvent[item.id] ?? null}
            onRate={(stars) => handleRate(item.id, stars)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#FF6B00']}
            tintColor="#FF6B00"
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle}>
              My <Text style={styles.headerTitleAccent}>Events</Text>
            </Text>
            {/* Toggle between all / created-by-me / joined-by-me */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleButton, viewMode === 'all' && styles.toggleButtonActive]}
                onPress={() => setViewMode('all')}
              >
                <Text style={[styles.toggleButtonText, viewMode === 'all' && styles.toggleButtonTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, viewMode === 'created' && styles.toggleButtonActive]}
                onPress={() => setViewMode('created')}
              >
                <Text style={[styles.toggleButtonText, viewMode === 'created' && styles.toggleButtonTextActive]}>Created</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, viewMode === 'joined' && styles.toggleButtonActive]}
                onPress={() => setViewMode('joined')}
              >
                <Text style={[styles.toggleButtonText, viewMode === 'joined' && styles.toggleButtonTextActive]}>Joined</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          // Shown when the user has no events in the current view mode
          <AnimatedEmptyState
            icon="list-outline"
            title="No events yet"
            message="Join or create an event and it will appear here."
          />
        }
      />

      {/* Event details bottom sheet — address opens maps; shows Edit or Leave based on ownership */}
      <EventDetailsModal
        event={selectedEvent}
        visible={!!selectedEvent}
        onClose={closeModal}
        onImageFullscreen={(uri) => setFullScreenImage(uri)}
        onOwnerPress={(userId) => { closeModal(); router.push({ pathname: '/(tabs)/user-profile', params: { userId } }); }}
        addressLinkable
        renderActions={() =>
          selectedEvent?.profile_id === currentUserId ? (
            // Owner: navigate to edit screen
            <TouchableOpacity
              style={[actionButtonStyles.base, actionButtonStyles.edit]}
              onPress={() => selectedEvent && handleEditEvent(selectedEvent)}
            >
              <Text style={actionButtonStyles.buttonText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            // Attendee: remove self from event
            <TouchableOpacity
              style={[actionButtonStyles.base, actionButtonStyles.leave]}
              onPress={handleModalLeave}
            >
              <Text style={actionButtonStyles.buttonText}>Leave</Text>
            </TouchableOpacity>
          )
        }
      />

      <FullScreenImageViewer uri={fullScreenImage} onClose={() => setFullScreenImage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  headerContainer: {
    paddingTop: 24,
    marginBottom: 22,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F0F0FA',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  headerTitleAccent: {
    color: '#FF6B00',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  toggleButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1E1E28',
    borderWidth: 1,
    borderColor: '#2E2E40',
  },
  toggleButtonActive: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7878A0',
  },
  toggleButtonTextActive: {
    color: '#FFFFFF',
  },
});
