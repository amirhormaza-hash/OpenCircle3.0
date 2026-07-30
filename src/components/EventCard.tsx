// Used in: (tabs)/index.tsx, (tabs)/mylist.tsx
// Full swipeable event card — shows user image, category tiled background, or plain placeholder.
// Handles join / leave / edit / delete actions with animated feedback.

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, ImageSourcePropType } from 'react-native';
import { supabase } from '../lib/supabase/client';
import { markInviteLeft } from '../lib/invitesQueries';
import { categoryColor, fonts } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
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
const SPARKLE_COLORS = ['#FFD76A', '#FF9440', '#FFE9B8', '#FF7A1A'];

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
  const spin = useSharedValue(0);
  const dotPop = useSharedValue(1);
  const p0 = useSharedValue(0);
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const p3 = useSharedValue(0);

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  // Open-ring icon: the gap sits top-right (45°); joining spins the ring
  // once and pops the dot — taking the open spot in the circle.
  const iconRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${45 - spin.value * 360}deg` }],
  }));

  const iconDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotPop.value }],
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

    spin.value = 0;
    spin.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    dotPop.value = withSequence(
      withTiming(1.7, { duration: 140, easing: Easing.out(Easing.ease) }),
      withSpring(1, { damping: 6, stiffness: 180 })
    );

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
      <View style={[balloonStyles.wrapper, balloonStyles.leaveBtnWrapper]}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.78} style={balloonStyles.leaveBtn}>
          <Ionicons name="exit-outline" size={18} color="#FF8080" />
          <Text style={[balloonStyles.btnText, balloonStyles.leaveBtnText]}>Leave</Text>
        </TouchableOpacity>
      </View>
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
      {/* Join button */}
      <Animated.View style={btnAnimStyle}>
        <TouchableOpacity
          onPress={handlePress}
          onPressIn={() => { btnScale.value = withTiming(0.96, { duration: 90 }); }}
          onPressOut={() => { btnScale.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
          disabled={loading}
          activeOpacity={0.92}
          style={balloonStyles.btn}
        >
          <LinearGradient
            colors={['#FF8A3D', '#FF6B00', '#F04F00']}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={balloonStyles.gradient}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={balloonStyles.btnRow}>
                <View style={balloonStyles.ringIcon}>
                  <Animated.View style={[balloonStyles.ringArc, iconRingStyle]} />
                  <Animated.View style={[balloonStyles.ringDot, iconDotStyle]} />
                </View>
                <Text style={balloonStyles.btnText}>Join</Text>
              </View>
            )}
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
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  leaveBtnWrapper: {
    shadowColor: '#FF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 68, 68, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 100, 100, 0.4)',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  leaveBtnText: {
    color: '#FF8080',
  },
  gradient: {
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  ringIcon: {
    width: 20,
    height: 20,
  },
  ringArc: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
    borderWidth: 2.4,
    borderColor: '#FFFFFF',
    borderTopColor: 'transparent',
  },
  ringDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 5.5,
    height: 5.5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: fonts.display,
    letterSpacing: 0.6,
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
  owner_name?: string | null;
  owner_avatar?: string | null;
  owner_rating?: number | 'New' | null;
  rating?: number | null;
  category?: string;
  first_image_url?: string | null;
  visibility?: string;
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
  /** Event is inside its 24h post-start rating window — show stars instead of Join/Leave. */
  ratable?: boolean;
  /** Stars the current user already gave this event, if any. */
  myStars?: number | null;
  /** Return true when the rating was saved — the card then animates away and calls onLeave. */
  onRate?: (stars: 1 | 2 | 3 | 4 | 5) => boolean | void | Promise<boolean | void>;
  /** Invitation to a friends-only event — show Accept / Reject instead of Join. */
  inviteMode?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  /** Host of a friends-only event — show an "Invitees" button. */
  onViewInvitees?: (event: Event) => void;
}

function RateEventRow({
  myStars,
  onRate,
}: {
  myStars: number | null;
  onRate?: (stars: 1 | 2 | 3 | 4 | 5) => void | Promise<void>;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const rated = myStars != null;
  const shown = myStars ?? pending ?? 0;

  return (
    <View style={rateStyles.wrap}>
      <Text style={rateStyles.label}>{rated ? 'Thanks for rating!' : 'How was it?'}</Text>
      <View style={rateStyles.starRow}>
        {([1, 2, 3, 4, 5] as const).map((s) => (
          <TouchableOpacity
            key={s}
            disabled={rated || pending != null || !onRate}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPending(s);
              onRate?.(s);
            }}
          >
            <Ionicons
              name={s <= shown ? 'star' : 'star-outline'}
              size={30}
              color={s <= shown ? '#FFB800' : 'rgba(255,255,255,0.45)'}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const rateStyles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(10,10,16,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: 'rgba(255,255,255,0.85)',
  },
  starRow: {
    flexDirection: 'row',
    gap: 10,
  },
});

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
  ratable = false, myStars = null, onRate,
  inviteMode = false, onAccept, onReject, onViewInvitees,
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
  }, [event.id, event.profile_id]);

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
      supabase.functions.invoke('bright-handler', { body: { user_id: user.id, event_date: event.date_time } });
      supabase.functions.invoke('quick-service',  { body: { user_id: user.id } });
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
              // If this was an invite, clear it so the host no longer counts them.
              markInviteLeft(event.id, user.id).catch(() => {});
              setIsJoined(false);
              if (onLeave) animateSendToList(onLeave);
            }
          },
        },
      ]);
      return;
    } else {
      try {
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
        supabase.functions.invoke('bright-handler', { body: { user_id: user.id, event_date: event.date_time } });
        supabase.functions.invoke('quick-service',  { body: { user_id: user.id } });
      }
      } catch {
        Alert.alert('Error', 'Could not join event. Please try again.');
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

  // After a confirmed rating, pause briefly so the stars register,
  // then fly the card off the list — its job is done.
  async function handleRateSubmit(stars: 1 | 2 | 3 | 4 | 5) {
    const saved = await onRate?.(stars);
    if (saved === true) {
      setTimeout(() => animateSendToList(() => onLeave?.()), 650);
    }
  }

  function renderCategoryChip(absolute: boolean) {
    if (!event.category) return null;
    const c = categoryColor(event.category);
    return (
      <View style={[styles.categoryChip, absolute ? styles.categoryChipFloating : styles.categoryChipInline]}>
        <View style={[styles.categoryDot, { backgroundColor: c }]} />
        <Text style={[styles.categoryChipText, { color: c }]}>{event.category}</Text>
      </View>
    );
  }

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

  // Owner header at the top of the card: profile pic + name.
  // `overlay` = shown on top of an image (light text, pill background).
  function renderOwnerHeader(overlay: boolean) {
    if (!event.owner_username) return null;
    const canNavigate = !!onOwnerPress && !!event.owner_profile_id;
    const displayName = event.owner_name || event.owner_username;
    const initial = (displayName || '?').trim().charAt(0).toUpperCase();

    const touchable = (
      <GHTouchableOpacity
        style={styles.ownerHeaderTouch}
        activeOpacity={canNavigate ? 0.6 : 1}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
        onPress={() => {
          if (canNavigate) onOwnerPress!(event.owner_profile_id!);
        }}
      >
        {event.owner_avatar ? (
          <Image source={{ uri: event.owner_avatar }} style={styles.ownerAvatar} />
        ) : (
          <View style={[styles.ownerAvatar, styles.ownerAvatarFallback]}>
            <Text style={styles.ownerAvatarInitial}>{initial}</Text>
          </View>
        )}
        <Text
          style={[styles.ownerHeaderName, !overlay && { color: '#F0F0FA' }]}
          numberOfLines={1}
        >
          @{event.owner_username}
        </Text>
      </GHTouchableOpacity>
    );

    // Overlay: absolute container at the top-left corner over the image.
    if (overlay) {
      return (
        <View style={styles.ownerHeaderOverlay} pointerEvents="box-none">
          {touchable}
        </View>
      );
    }
    return <View style={styles.ownerHeader}>{touchable}</View>;
  }

  function renderActions() {
    if (isOwner) {
      return (
        <View>
          {event.visibility === 'friends' && onViewInvitees && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onViewInvitees(event); }}
              style={[styles.actionButton, styles.inviteesButton]}
            >
              <Ionicons name="people-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.actionText}>Invitees</Text>
            </TouchableOpacity>
          )}
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
        </View>
      );
    }
    if (inviteMode) {
      return (
        <View style={styles.ownerButtonRow}>
          <TouchableOpacity
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onAccept?.(); }}
            style={[styles.actionButton, styles.acceptButton, { flex: 1 }]}
          >
            <Ionicons name="checkmark" size={17} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.actionText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onReject?.(); }}
            style={[styles.actionButton, styles.rejectButton, { flex: 1 }]}
          >
            <Text style={styles.actionText}>Reject</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (ratable) {
      return <RateEventRow myStars={myStars} onRate={onRate ? handleRateSubmit : undefined} />;
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
            {renderOwnerHeader(true)}
            {renderCategoryChip(true)}
            <View style={styles.textContent}>
              <Text style={styles.title}>{event.name}</Text>
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
            {renderOwnerHeader(true)}
            {renderCategoryChip(true)}
            <View style={styles.textContent}>
              <Text style={styles.title}>{event.name}</Text>
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
            {renderOwnerHeader(false)}
            {renderCategoryChip(false)}
            <Text style={styles.title}>{event.name}</Text>
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
    marginHorizontal: 12,
    marginBottom: 24,
  },
  imageCard: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2E2E40',
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 0,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10,10,16,0.72)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  categoryChipFloating: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 5,
  },
  // Owner header — profile pic + name at the top of the card
  ownerHeaderOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 5,
    maxWidth: '80%',
  },
  ownerHeaderTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // Larger tap box around the avatar + username
    paddingVertical: 10,
    paddingLeft: 8,
    paddingRight: 22,
    borderRadius: 999,
  },
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  ownerAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#2E2E40',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
  },
  ownerAvatarFallback: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#FF6B00' },
  ownerAvatarInitial: { color: '#fff', fontSize: 14, fontFamily: fonts.heading },
  ownerHeaderText: { flexShrink: 1 },
  ownerHeaderName: {
    color: '#FFFFFF', fontSize: 14, fontFamily: fonts.heading, letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  ownerHeaderHandle: {
    color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: fonts.body, marginTop: -1,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  ownerHeaderMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ownerRatingBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ownerRatingText: {
    color: '#FFD24A', fontSize: 11, fontFamily: fonts.bold,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  categoryChipInline: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2E2E40',
  },
  categoryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  actionButton: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButton: { backgroundColor: '#EF4444' },
  editButton: { backgroundColor: '#FF6B00' },
  inviteesButton: {
    backgroundColor: '#1E1E28',
    borderWidth: 1.5,
    borderColor: '#FF6B00',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: '#22C55E',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  rejectButton: {
    backgroundColor: '#1E1E28',
    borderWidth: 1.5,
    borderColor: '#2E2E40',
  },
  ownerButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: fonts.bold,
  },
  textContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -0.3,
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
    fontFamily: fonts.body,
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
    fontFamily: fonts.display,
    letterSpacing: 1,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ownerText: {
    fontSize: 12,
    fontFamily: fonts.body,
  },
  ownerLink: {
    textDecorationLine: 'underline',
  },
});
