// Used in: (tabs)/index.tsx, (tabs)/mylist.tsx
// Full swipeable event card — shows user image, category tiled background, or plain placeholder.
// Handles join / leave / edit / delete actions with animated feedback.

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ImageSourcePropType } from 'react-native';
import { supabase } from '../lib/supabase/client';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const CATEGORY_IMAGES: Record<string, ImageSourcePropType> = {
  sports: require('../../assets/images/sports.jpg'),
  party: require('../../assets/images/party.jpg'),
  food: require('../../assets/images/food.jpg'),
  study: require('../../assets/images/study.jpg'),
  ride: require('../../assets/images/ride.jpg'),
  zen: require('../../assets/images/zen.jpg'),
  networking: require('../../assets/images/study.jpg'),
  outdoors: require('../../assets/images/sports.jpg'),
  other: require('../../assets/images/party.jpg'),
};

function getCategoryImage(category?: string): ImageSourcePropType | null {
  if (!category) return null;
  return CATEGORY_IMAGES[category.trim().toLowerCase()] ?? null;
}

const TILE_SIZE = 130;
const COLS = 4;
const ROWS = 5;
// Minimum horizontal distance before a swipe is committed as join/skip
const SWIPE_THRESHOLD = 100;

const BURST_SPARKLE_OFFSETS = [
  { tx: 28, ty: -24 },
  { tx: 28, ty: 24 },
  { tx: -28, ty: 24 },
  { tx: -28, ty: -24 },
];
const SPARKLE_COLORS = ['#FFD700', '#FF8C00', '#FF3366', '#FFA500'];

function BalloonJoinButton({
  isJoined,
  loading,
  onPress,
}: {
  isJoined: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const btnScale = useSharedValue(1);
  const ringScale = useSharedValue(0.9);
  const ringOpacity = useSharedValue(0);
  const p0 = useSharedValue(0);
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const p3 = useSharedValue(0);

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const sp0Style = useAnimatedStyle(() => {
    const t = p0.value;
    const { tx, ty } = BURST_SPARKLE_OFFSETS[0];
    const op = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.6);
    return { opacity: op, transform: [{ translateX: tx * t }, { translateY: ty * t }, { scale: 0.2 + op * 0.8 }] };
  });
  const sp1Style = useAnimatedStyle(() => {
    const t = p1.value;
    const { tx, ty } = BURST_SPARKLE_OFFSETS[1];
    const op = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.6);
    return { opacity: op, transform: [{ translateX: tx * t }, { translateY: ty * t }, { scale: 0.2 + op * 0.8 }] };
  });
  const sp2Style = useAnimatedStyle(() => {
    const t = p2.value;
    const { tx, ty } = BURST_SPARKLE_OFFSETS[2];
    const op = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.6);
    return { opacity: op, transform: [{ translateX: tx * t }, { translateY: ty * t }, { scale: 0.2 + op * 0.8 }] };
  });
  const sp3Style = useAnimatedStyle(() => {
    const t = p3.value;
    const { tx, ty } = BURST_SPARKLE_OFFSETS[3];
    const op = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.6);
    return { opacity: op, transform: [{ translateX: tx * t }, { translateY: ty * t }, { scale: 0.2 + op * 0.8 }] };
  });

  function burst() {
    btnScale.value = withSequence(
      withTiming(1.16, { duration: 80, easing: Easing.out(Easing.ease) }),
      withTiming(0.87, { duration: 70, easing: Easing.in(Easing.ease) }),
      withSpring(1, { damping: 7, stiffness: 200 })
    );

    ringScale.value = 0.9;
    ringOpacity.value = 0.75;
    ringScale.value = withTiming(2.6, { duration: 450, easing: Easing.out(Easing.quad) });
    ringOpacity.value = withTiming(0, { duration: 420 });

    const dur = 460;
    const ease = Easing.out(Easing.quad);
    p0.value = 0; p0.value = withDelay(30, withTiming(1, { duration: dur, easing: ease }));
    p1.value = 0; p1.value = withDelay(10, withTiming(1, { duration: dur, easing: ease }));
    p2.value = 0; p2.value = withDelay(50, withTiming(1, { duration: dur, easing: ease }));
    p3.value = 0; p3.value = withDelay(20, withTiming(1, { duration: dur, easing: ease }));
  }

  const handlePress = () => {
    if (!isJoined && !loading) burst();
    onPress();
  };

  if (isJoined) {
    return (
      <TouchableOpacity onPress={handlePress} style={[balloonStyles.btn, balloonStyles.leaveBtn]}>
        <Text style={balloonStyles.btnText}>Leave</Text>
      </TouchableOpacity>
    );
  }

  const CORNER_POSITIONS = [
    { top: 5, right: 5 },
    { bottom: 5, right: 5 },
    { bottom: 5, left: 5 },
    { top: 5, left: 5 },
  ] as const;
  const sparkleStyles = [sp0Style, sp1Style, sp2Style, sp3Style];

  return (
    <View style={balloonStyles.wrapper}>
      {/* Burst ring */}
      <Animated.View
        style={[StyleSheet.absoluteFill, balloonStyles.burstRing, ringStyle]}
        pointerEvents="none"
      />
      {/* Corner sparkles */}
      {sparkleStyles.map((style, i) => (
        <Animated.View
          key={i}
          style={[
            balloonStyles.sparkle,
            CORNER_POSITIONS[i],
            { backgroundColor: SPARKLE_COLORS[i] },
            style,
          ]}
          pointerEvents="none"
        />
      ))}
      {/* Balloon button */}
      <Animated.View style={btnAnimStyle}>
        <TouchableOpacity
          onPress={handlePress}
          disabled={loading}
          activeOpacity={0.88}
          style={balloonStyles.btn}
        >
          <LinearGradient
            colors={['#FF9000', '#FF4E00']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={balloonStyles.gradient}
          >
            <View style={balloonStyles.gloss} pointerEvents="none" />
            <Text style={balloonStyles.btnText}>{loading ? '…' : 'Join'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const balloonStyles = StyleSheet.create({
  wrapper: {
    marginTop: 14,
    position: 'relative',
  },
  btn: {
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 6,
  },
  leaveBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    alignItems: 'center',
  },
  gradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  gloss: {
    position: 'absolute',
    top: 5,
    left: 24,
    right: 24,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  burstRing: {
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: '#FF8C00',
  },
  sparkle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

function TiledBackground({ source }: { source: ImageSourcePropType }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {Array.from({ length: ROWS }).map((_, row) =>
        Array.from({ length: COLS }).map((_, col) => (
          <Image
            key={`${row}-${col}`}
            source={source}
            style={{
              position: 'absolute',
              top: row * TILE_SIZE,
              left: col * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
            }}
            resizeMode="cover"
          />
        ))
      )}
    </View>
  );
}

interface Event {
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
  category?: string;
  first_image_url?: string | null;
}

interface Props {
  event: Event;
  onPress?: (event: Event) => void;
  onDelete?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
  onEdit?: (event: Event) => void;
  onSkip?: () => void;
  onOwnerPress?: (userId: string) => void;
  distanceLabel?: string;
  swipeable?: boolean;
  slideDirection?: 'left' | 'right';
}

function formatEventDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EventCard({
  event, onPress, onDelete, onJoin, onLeave, onEdit, onSkip, onOwnerPress,
  distanceLabel, swipeable = false, slideDirection = 'right',
}: Props) {
  const [isJoined, setIsJoined] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const swipeX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + swipeX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  // Fade in the "JOIN" indicator as the card is swiped right past 20px
  const joinIndicatorStyle = useAnimatedStyle(() => ({
    opacity: swipeX.value > 20 ? Math.min((swipeX.value - 20) / 60, 1) : 0,
  }));

  // Fade in the "SKIP" indicator as the card is swiped left past 20px
  const skipIndicatorStyle = useAnimatedStyle(() => ({
    opacity: swipeX.value < -20 ? Math.min((-swipeX.value - 20) / 60, 1) : 0,
  }));

  useEffect(() => {
    checkUserStatus();
  }, [event.id]);

  async function checkUserStatus() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    setIsOwner(event.profile_id === user.id);
    const { data } = await supabase
      .from('event_attendees')
      .select('id')
      .eq('event_id', event.id)
      .eq('user_id', user.id)
      .maybeSingle();
    setIsJoined(!!data);
  }

  function animateSendToList(callback: () => void) {
    const direction = slideDirection === 'left' ? -420 : 420;
    const duration = 220;
    scale.value = withSequence(
      withTiming(1.04, { duration: 80, easing: Easing.out(Easing.ease) }),
      withTiming(0.96, { duration: 60 })
    );
    translateX.value = withTiming(direction, { duration, easing: Easing.in(Easing.ease) });
    translateY.value = withTiming(120, { duration });
    opacity.value = withTiming(0, { duration });
    setTimeout(callback, duration + 20);
  }

  async function executeJoin() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const { error } = await supabase.from('event_attendees').insert({
      event_id: event.id,
      user_id: user.id,
    });
    if (!error) {
      setIsJoined(true);
      onJoin?.();
      // Update streak and check badge unlocks in the background
      supabase.functions.invoke('update-streak', { body: { user_id: user.id, event_date: event.date_time } });
      supabase.functions.invoke('check-badges',  { body: { user_id: user.id } });
    }
  }

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      swipeX.value = e.translationX;
    })
    .onEnd((e) => {
      if (!isOwner && !isJoined && e.translationX > SWIPE_THRESHOLD) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        swipeX.value = withTiming(500, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 });
        setTimeout(executeJoin, 50);
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        swipeX.value = withTiming(-500, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 });
        setTimeout(() => onSkip?.(), 220);
      } else {
        swipeX.value = withSpring(0);
      }
    });

  const handleJoin = async () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      Alert.alert('Not signed in', 'You must be logged in to join an event.');
      setLoading(false);
      return;
    }

    if (isJoined) {
      setLoading(false);
      Alert.alert('Leave Event', 'Are you sure you want to leave this event?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const { error } = await supabase
              .from('event_attendees')
              .delete()
              .eq('event_id', event.id)
              .eq('user_id', user.id);
            if (error) {
              Alert.alert('Error', 'Could not leave event. Please try again.');
            } else {
              setIsJoined(false);
              if (onLeave) animateSendToList(onLeave);
            }
          },
        },
      ]);
      return;
    } else {
      const { error } = await supabase.from('event_attendees').insert({
        event_id: event.id,
        user_id: user.id,
      });
      if (error) {
        Alert.alert('Error', 'Could not join event. Please try again.');
      } else {
        setIsJoined(true);
        if (onJoin) animateSendToList(onJoin);
        // Update streak and check badge unlocks in the background
        supabase.functions.invoke('update-streak', { body: { user_id: user.id, event_date: event.date_time } });
        supabase.functions.invoke('check-badges',  { body: { user_id: user.id } });
      }
    }
    setLoading(false);
  };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Delete Event', 'This will permanently delete the event for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('event').delete().eq('id', event.id);
          if (error) {
            Alert.alert('Error', 'Could not delete event. Please try again.');
          } else {
            if (onDelete) animateSendToList(onDelete);
          }
        },
      },
    ]);
  };

  const [userImageFailed, setUserImageFailed] = useState(false);
  const userImage = event.first_image_url && !userImageFailed ? { uri: event.first_image_url } : null;
  const categoryImage = getCategoryImage(event.category);

  function renderRatingRow(light: boolean) {
    if (event.rating == null) return null;
    const color = light ? 'rgba(255,255,255,0.85)' : '#7878A0';
    return (
      <View style={styles.row}>
        <Ionicons name="star" size={13} color="#FFB800" style={styles.icon} />
        <Text style={[styles.detail, { color }]}>{event.rating.toFixed(2)} ★</Text>
      </View>
    );
  }

  function renderOwnerRow(light: boolean) {
    if (!event.owner_username) return null;
    const canNavigate = !!onOwnerPress && !!event.owner_profile_id && !isOwner;
    const color = light ? 'rgba(255,255,255,0.7)' : '#7878A0';
    const usernameColor = canNavigate ? (light ? '#E0D4FF' : '#A78BFA') : color;
    return (
      <TouchableOpacity
        style={styles.ownerRow}
        activeOpacity={canNavigate ? 0.6 : 1}
        onPress={(e) => {
          if (canNavigate) {
            e.stopPropagation();
            onOwnerPress!(event.owner_profile_id!);
          }
        }}
      >
        <Ionicons name="person-outline" size={12} color={color} style={styles.icon} />
        <Text style={[styles.ownerText, { color }]}>
          by{' '}
          <Text style={[styles.ownerText, { color: usernameColor }, canNavigate && styles.ownerLink]}>
            @{event.owner_username}
          </Text>
        </Text>
      </TouchableOpacity>
    );
  }

  function renderActions() {
    if (isOwner) {
      return (
        <View style={styles.ownerButtonRow}>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEdit?.(event); }}
            style={[styles.actionButton, styles.editButton, { flex: 1 }]}
          >
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={[styles.actionButton, styles.deleteButton, { flex: 1 }]}>
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <BalloonJoinButton isJoined={isJoined} loading={loading} onPress={handleJoin} />
    );
  }

  const cardInner = (
    <Animated.View style={animatedStyle}>
      {swipeable && (
        <>
          <Animated.View style={[styles.swipeIndicator, styles.joinIndicator, joinIndicatorStyle]}>
            <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
            <Text style={[styles.swipeLabel, { color: '#22c55e' }]}>JOIN</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeIndicator, styles.skipIndicator, skipIndicatorStyle]}>
            <Ionicons name="close-circle" size={48} color="#9ca3af" />
            <Text style={[styles.swipeLabel, { color: '#9ca3af' }]}>SKIP</Text>
          </Animated.View>
        </>
      )}
      <TouchableOpacity onPress={() => onPress?.(event)} activeOpacity={0.9} style={styles.card}>
        {userImage ? (
          <View style={styles.imageCard}>
            <Image source={userImage} style={styles.bgImage} resizeMode="cover" onError={() => setUserImageFailed(true)} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
              locations={[0.3, 0.65, 1]}
              style={styles.overlay}
            />
            <View style={styles.textContent}>
              <Text style={styles.title}>{event.name}</Text>
              {renderOwnerRow(true)}
              <View style={styles.infoContainer}>
                <View style={styles.row}>
                  <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.85)" style={styles.icon} />
                  <Text style={styles.detail}>{event.date_time ? formatEventDate(event.date_time) : 'No date'}</Text>
                </View>
                <View style={styles.row}>
                  <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" style={styles.icon} />
                  <Text style={styles.detail}>{distanceLabel ?? event.address ?? 'No address'}</Text>
                </View>
                <View style={styles.row}>
                  <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.85)" style={styles.icon} />
                  <Text style={styles.detail}>{event.attendee_count ?? 0} / {event.number_of_guests ?? 0} going</Text>
                </View>
                {renderRatingRow(true)}
              </View>
              {renderActions()}
            </View>
          </View>
        ) : categoryImage ? (
          <View style={styles.imageCard}>
            <TiledBackground source={categoryImage} />
            <LinearGradient
              colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.75)']}
              locations={[0, 0.5, 1]}
              style={styles.overlay}
            />
            <View style={styles.textContent}>
              <Text style={styles.title}>{event.name}</Text>
              {renderOwnerRow(true)}
              <View style={styles.infoContainer}>
                <View style={styles.row}>
                  <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.85)" style={styles.icon} />
                  <Text style={styles.detail}>{event.date_time ? formatEventDate(event.date_time) : 'No date'}</Text>
                </View>
                <View style={styles.row}>
                  <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" style={styles.icon} />
                  <Text style={styles.detail}>{distanceLabel ?? event.address ?? 'No address'}</Text>
                </View>
                <View style={styles.row}>
                  <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.85)" style={styles.icon} />
                  <Text style={styles.detail}>{event.attendee_count ?? 0} / {event.number_of_guests ?? 0} going</Text>
                </View>
                {renderRatingRow(true)}
              </View>
              {renderActions()}
            </View>
          </View>
        ) : (
          <View style={styles.placeholderCard}>
            <Text style={styles.title}>{event.name}</Text>
            {renderOwnerRow(false)}
            <View style={styles.infoContainer}>
              <View style={styles.row}>
                <Ionicons name="calendar-outline" size={13} color="#7878A0" style={styles.icon} />
                <Text style={styles.detail}>{event.date_time ? formatEventDate(event.date_time) : 'No date'}</Text>
              </View>
              <View style={styles.row}>
                <Ionicons name="location-outline" size={13} color="#7878A0" style={styles.icon} />
                <Text style={styles.detail}>{distanceLabel ?? event.address ?? 'No address'}</Text>
              </View>
              <View style={styles.row}>
                <Ionicons name="people-outline" size={13} color="#7878A0" style={styles.icon} />
                <Text style={styles.detail}>{event.attendee_count ?? 0} / {event.number_of_guests ?? 0} going</Text>
              </View>
              {renderRatingRow(false)}
            </View>
            {renderActions()}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );

  if (swipeable) {
    return <GestureDetector gesture={panGesture}>{cardInner}</GestureDetector>;
  }
  return cardInner;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    marginBottom: 24,
  },
  imageCard: {
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bgImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  placeholderCard: {
    width: '100%',
    backgroundColor: '#1E1E28',
    paddingHorizontal: 14,
    paddingVertical: 18,
    marginBottom: 0,
  },
  actionButton: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButton: { backgroundColor: '#EF4444' },
  editButton: { backgroundColor: '#7C3AED' },
  ownerButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  textContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  infoContainer: {
    gap: 5,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: { marginRight: 6 },
  detail: {
    fontSize: 13,
    color: '#FFFFFF',
    flexShrink: 1,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  swipeIndicator: {
    position: 'absolute',
    top: 0, bottom: 24,
    width: 90,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    gap: 6,
  },
  joinIndicator: {
    right: 20,
  },
  skipIndicator: {
    left: 20,
  },
  swipeLabel: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ownerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ownerLink: {
    textDecorationLine: 'underline',
  },
});
