// @author Amir Hormaza
import React, { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import {
  View,
  FlatList,
  Text,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
// Note: Modal + Pressable are still used by the filter bottom sheet below
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import EventCard from '../../components/EventCard';
import SkeletonCard from '../../components/SkeletonCard';
import FullScreenImageViewer from '../../components/FullScreenImageViewer';
// Pulsing icon + title + message for when there are no events to show
import AnimatedEmptyState from '../../components/AnimatedEmptyState';
// Bottom-sheet modal with event image gallery, info boxes, and action buttons
import EventDetailsModal, { actionButtonStyles } from '../../components/EventDetailsModal';
import OpenRing from '../../components/OpenRing';
import { colors, fonts } from '../../constants/colors';
import { supabase } from '../../lib/supabase/client';
import { calculateEventRating } from '../../lib/ratingSystem';
import { useBadge } from '../../context/BadgeContext';
import * as Location from 'expo-location';

const CATEGORIES = ['All', 'Sports', 'Party', 'Food', 'Study', 'Networking', 'Ride', 'Outdoors', 'Zen', 'Other'];
const DATE_FILTERS = ['All', 'Today', 'This Week', 'This Month'];
type SortMode = 'default' | 'date' | 'distance';

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type EventImage = {
  image_path: string;
  position: number;
};

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
  event_images?: EventImage[];
  first_image_url?: string | null;
  image_urls?: string[];
  latitude?: number | null;
  longitude?: number | null;
};

export default function Index() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDateFilter, setSelectedDateFilter] = useState('All');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [modalJoining, setModalJoining] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  const { setMyListBadge } = useBadge();
  const isFiltered = selectedCategory !== 'All' || selectedDateFilter !== 'All';

  function clearFilters() {
    setSelectedCategory('All');
    setSelectedDateFilter('All');
  }

  const filteredEvents = events.filter((event) => {
    if (selectedCategory !== 'All' && event.category !== selectedCategory) return false;

    if (selectedDateFilter !== 'All') {
      const eventDate = new Date(event.date_time);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday.getTime() + 86400000);
      const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000);
      const endOfMonth = new Date(startOfToday.getTime() + 30 * 86400000);

      if (selectedDateFilter === 'Today' && (eventDate < startOfToday || eventDate >= endOfToday)) return false;
      if (selectedDateFilter === 'This Week' && (eventDate < startOfToday || eventDate >= endOfWeek)) return false;
      if (selectedDateFilter === 'This Month' && (eventDate < startOfToday || eventDate >= endOfMonth)) return false;
    }

    return true;
  });

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (sortMode === 'date') {
      return new Date(a.date_time).getTime() - new Date(b.date_time).getTime();
    }
    if (sortMode === 'distance' && userLocation) {
      const distA = (a.latitude != null && a.longitude != null)
        ? haversineKm(userLocation.lat, userLocation.lon, a.latitude, a.longitude)
        : Infinity;
      const distB = (b.latitude != null && b.longitude != null)
        ? haversineKm(userLocation.lat, userLocation.lon, b.latitude, b.longitude)
        : Infinity;
      return distA - distB;
    }
    return 0;
  });

  async function requestLocationAndSort() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow location access to sort by distance.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
    setSortMode('distance');
    setSortMenuVisible(false);
  }

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
      // Silently request location for distance display
      Location.requestForegroundPermissionsAsync().then(({ status }) => {
        if (status === 'granted') {
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((loc) => {
            setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
          }).catch(() => {});
        }
      }).catch(() => {});
    }, [])
  );

  function getImageUrl(imagePath: string): string {
    const { data } = supabase.storage
      .from('event-images')
      .getPublicUrl(imagePath);

    return data.publicUrl;
  }

  async function fetchEvents() {
    setLoading(true);

    const user = (await supabase.auth.getUser()).data.user;

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
        latitude,
        longitude,
        event_images (
          image_path,
          position
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching events:', error);
      Alert.alert('Error', 'Could not load events');
      setLoading(false);
      return;
    }

    const eventIds = (data || []).map((e: any) => e.id);
    let countMap: Record<string, number> = {};
    let joinedIds = new Set<string>();

    // Collect unique owner profile IDs so we can batch-fetch usernames
    const ownerIds = [...new Set((data || []).map((e: any) => e.profile_id).filter(Boolean))];

    const [attendeeResult, ownerResult, ratingsResult] = await Promise.all([
      eventIds.length > 0
        ? supabase.from('event_attendees').select('event_id, user_id').in('event_id', eventIds)
        : Promise.resolve({ data: [] }),
      ownerIds.length > 0
        ? supabase.from('profiles').select('id, username').in('id', ownerIds)
        : Promise.resolve({ data: [] }),
      eventIds.length > 0
        ? supabase.from('event_ratings').select('event_id, stars').in('event_id', eventIds)
        : Promise.resolve({ data: [] }),
    ]);

    (attendeeResult.data || []).forEach((a: any) => {
      countMap[a.event_id] = (countMap[a.event_id] || 0) + 1;
      if (user && a.user_id === user.id) joinedIds.add(a.event_id);
    });

    const usernameMap: Record<string, string> = {};
    (ownerResult.data || []).forEach((p: any) => { usernameMap[p.id] = p.username; });

    // Build star-counts per event for rating calculation
    type StarMap = { 1: number; 2: number; 3: number; 4: number; 5: number };
    const starsByEvent: Record<string, StarMap> = {};
    (ratingsResult.data || []).forEach((r: any) => {
      if (!starsByEvent[r.event_id]) starsByEvent[r.event_id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      if (r.stars >= 1 && r.stars <= 5) starsByEvent[r.event_id][r.stars as 1|2|3|4|5]++;
    });

    const formattedEvents: EventItem[] = (data || [])
      .filter((item: any) => !joinedIds.has(item.id))
      .map((item: any) => {
        const sortedImages = [...(item.event_images || [])].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0)
        );

        const imageUrls = sortedImages
          .filter((img) => img.image_path)
          .map((img) => getImageUrl(img.image_path));

        const attendees = countMap[item.id] ?? 0;
        const starCounts = starsByEvent[item.id] ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const rating = calculateEventRating(attendees, starCounts);

        return {
          ...item,
          event_images: sortedImages,
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
    await fetchEvents();
    setRefreshing(false);
  }

  function handlePressEvent(event: EventItem) {
    setSelectedEvent(event);
  }

  function closeModal() {
    setSelectedEvent(null);
  }

  async function handleModalJoin() {
    if (!selectedEvent || modalJoining) return;
    setModalJoining(true);
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { setModalJoining(false); return; }
    const { error } = await supabase.from('event_attendees').insert({
      event_id: selectedEvent.id,
      user_id: user.id,
    });
    if (!error) {
      setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
      setMyListBadge(true);
      closeModal();
      // Update streak and check badge unlocks in the background
      supabase.functions.invoke('bright-handler', { body: { user_id: user.id, event_date: selectedEvent.date_time } });
      supabase.functions.invoke('quick-service',  { body: { user_id: user.id } });
    }
    setModalJoining(false);
  }

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />
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
        data={sortedEvents}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const distanceLabel =
            userLocation && item.latitude != null && item.longitude != null
              ? formatDistance(haversineKm(userLocation.lat, userLocation.lon, item.latitude, item.longitude))
              : undefined;
          return (
            <EventCard
              event={item}
              onPress={handlePressEvent}
              onDelete={() => setEvents((prev) => prev.filter((e) => e.id !== item.id))}
              onJoin={() => { setEvents((prev) => prev.filter((e) => e.id !== item.id)); setMyListBadge(true); }}
              onSkip={() => setEvents((prev) => prev.filter((e) => e.id !== item.id))}
              onOwnerPress={(userId) => router.push({ pathname: '/(tabs)/user-profile', params: { userId } })}
              distanceLabel={distanceLabel}
              swipeable
            />
          );
        }}
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
          <>
          <View style={styles.brandRow}>
            <OpenRing size={20} bg={colors.bg} />
            <Text style={styles.brandWordmark}>OpenCircle</Text>
          </View>
          <View style={styles.filterRowHeader}>
            <View style={styles.filterLeft}>
              <TouchableOpacity
                style={[styles.filterButton, isFiltered && styles.filterButtonActive]}
                onPress={() => setFilterModalVisible(true)}
              >
                <Ionicons name="options-outline" size={16} color={isFiltered ? '#FFFFFF' : '#C0C0D8'} />
                <Text style={[styles.filterButtonText, isFiltered && styles.filterButtonTextActive]}>
                  Filter
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterButton, selectedDateFilter === 'Today' && styles.filterButtonActive]}
                onPress={() => setSelectedDateFilter(selectedDateFilter === 'Today' ? 'All' : 'Today')}
              >
                <Ionicons name="today-outline" size={16} color={selectedDateFilter === 'Today' ? '#FFFFFF' : '#C0C0D8'} />
                <Text style={[styles.filterButtonText, selectedDateFilter === 'Today' && styles.filterButtonTextActive]}>
                  Today
                </Text>
              </TouchableOpacity>

              {selectedCategory !== 'All' && (
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>{selectedCategory}</Text>
                </View>
              )}

              {selectedDateFilter !== 'All' && selectedDateFilter !== 'Today' && (
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>{selectedDateFilter}</Text>
                </View>
              )}

              {isFiltered && (
                <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.filterButton, sortMode !== 'default' && styles.filterButtonActive]}
              onPress={() => setSortMenuVisible((v) => !v)}
            >
              <Ionicons name="swap-vertical-outline" size={16} color={sortMode !== 'default' ? '#FFFFFF' : '#C0C0D8'} />
              <Text style={[styles.filterButtonText, sortMode !== 'default' && styles.filterButtonTextActive]}>
                {sortMode === 'date' ? 'Date' : sortMode === 'distance' ? 'Distance' : 'Sort'}
              </Text>
            </TouchableOpacity>
          </View>
          </>
        }
        ListEmptyComponent={
          // Shown when no events match the current filters
          <AnimatedEmptyState
            icon="calendar-outline"
            title="No events yet"
            message="There are no events right now. Create one and it will show here."
          />
        }
      />

      {/* Event details bottom sheet — image gallery + info + join action */}
      <EventDetailsModal
        event={selectedEvent}
        visible={!!selectedEvent}
        onClose={closeModal}
        onImageFullscreen={(uri) => setFullScreenImage(uri)}
        onOwnerPress={(userId) => { closeModal(); router.push({ pathname: '/(tabs)/user-profile', params: { userId } }); }}
        renderActions={() =>
          selectedEvent?.profile_id !== undefined ? (
            // Join button — adds current user as attendee
            <TouchableOpacity
              style={[actionButtonStyles.base, actionButtonStyles.join]}
              onPress={handleModalJoin}
              disabled={modalJoining}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={actionButtonStyles.buttonText}>{modalJoining ? '...' : 'Join'}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <FullScreenImageViewer uri={fullScreenImage} onClose={() => setFullScreenImage(null)} />

      {/* Sort dropdown — rendered outside FlatList so it floats on top */}
      {sortMenuVisible && (
        <>
          <Pressable style={styles.sortDismiss} onPress={() => setSortMenuVisible(false)} />
          <View style={styles.sortMenu}>
            <TouchableOpacity
              style={[styles.sortMenuItem, sortMode === 'default' && styles.sortMenuItemActive]}
              onPress={() => { setSortMode('default'); setSortMenuVisible(false); }}
            >
              <Ionicons name="time-outline" size={14} color={sortMode === 'default' ? '#FF6B00' : '#C0C0D8'} />
              <Text style={[styles.sortMenuItemText, sortMode === 'default' && styles.sortMenuItemTextActive]}>Default</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortMenuItem, sortMode === 'date' && styles.sortMenuItemActive]}
              onPress={() => { setSortMode('date'); setSortMenuVisible(false); }}
            >
              <Ionicons name="calendar-outline" size={14} color={sortMode === 'date' ? '#FF6B00' : '#C0C0D8'} />
              <Text style={[styles.sortMenuItemText, sortMode === 'date' && styles.sortMenuItemTextActive]}>Closest Date</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortMenuItem, sortMode === 'distance' && styles.sortMenuItemActive]}
              onPress={requestLocationAndSort}
            >
              <Ionicons name="navigate-outline" size={14} color={sortMode === 'distance' ? '#FF6B00' : '#C0C0D8'} />
              <Text style={[styles.sortMenuItemText, sortMode === 'distance' && styles.sortMenuItemTextActive]}>Closest Distance</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Filter bottom sheet */}
      <Modal visible={filterModalVisible} transparent animationType="slide">
        <Pressable style={styles.filterOverlay} onPress={() => setFilterModalVisible(false)}>
          <Pressable style={styles.filterSheet} onPress={() => {}}>
            <View style={styles.filterSheetHandle} />

            <Text style={styles.filterSheetTitle}>Filter Events</Text>

            <Text style={styles.filterSectionLabel}>Date</Text>
            <View style={styles.filterChipRow}>
              {DATE_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setSelectedDateFilter(f)}
                  style={[styles.filterChip, selectedDateFilter === f && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedDateFilter === f && styles.filterChipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSectionLabel}>Category</Text>
            <View style={styles.filterChipRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setSelectedCategory(c)}
                  style={[styles.filterChip, selectedCategory === c && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedCategory === c && styles.filterChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.filterDoneButton} onPress={() => setFilterModalVisible(false)}>
              <Text style={styles.filterDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },

  listContent: {
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 28,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingTop: 10,
  },

  brandWordmark: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.4,
  },

  filterRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 4,
  },

  filterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
  },

  sortDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
  },

  sortMenu: {
    position: 'absolute',
    top: 106,
    right: 10,
    backgroundColor: '#1A1A24',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2E2E40',
    overflow: 'hidden',
    zIndex: 999,
    minWidth: 170,
    elevation: 20,
  },

  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  sortMenuItemActive: {
    backgroundColor: '#222230',
  },

  sortMenuItemText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#C0C0D8',
  },

  sortMenuItemTextActive: {
    color: '#FF6B00',
  },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#1E1E28',
    borderWidth: 1,
    borderColor: '#2E2E40',
  },

  filterButtonActive: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },

  filterButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#C0C0D8',
  },

  filterButtonTextActive: {
    color: '#FFFFFF',
  },

  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2E2E40',
  },

  clearButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#7878A0',
  },

  activeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
  },

  activeChipText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#FFFFFF',
  },

  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },

  filterSheet: {
    backgroundColor: '#1A1A24',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },

  filterSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#2E2E40',
    alignSelf: 'center',
    marginBottom: 20,
  },

  filterSheetTitle: {
    fontSize: 20,
    fontFamily: fonts.heading,
    color: '#F0F0FA',
    marginBottom: 20,
  },

  filterSectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#FF6B00',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },

  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1E1E28',
    borderWidth: 1,
    borderColor: '#2E2E40',
  },

  filterChipActive: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },

  filterChipText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#7878A0',
  },

  filterChipTextActive: {
    color: '#FFFFFF',
  },

  filterDoneButton: {
    backgroundColor: '#FF6B00',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },

  filterDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: fonts.heading,
  },

});