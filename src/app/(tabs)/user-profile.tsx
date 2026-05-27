import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase/client';
import { BADGE_DEFINITIONS } from '../../constants/badges';
import BadgeItem from '../../components/BadgeItem';

type PublicProfile = {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string | null;
  bio?: string | null;
  location?: string | null;
  trust_score?: number | null;
  is_verified?: boolean;
};

type BadgeRow = { badge_key: string; seen: boolean };

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const [profile, setProfile]     = useState<PublicProfile | null>(null);
  const [badges, setBadges]       = useState<BadgeRow[]>([]);
  const [attended, setAttended]   = useState(0);
  const [hosted, setHosted]       = useState(0);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);

  useEffect(() => {
    if (userId) load();
  }, [userId]);

  async function load() {
    setLoading(true);
    setNotFound(false);

    // Select only columns guaranteed to exist (migration 001).
    // behavior_score / trust_tier are added in migration 002 — omit them here
    // to avoid a schema-cache error if that migration hasn't run yet.
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, username, profile_image_url, bio, location, trust_score, is_verified')
      .eq('id', userId)
      .single();

    if (profileError || !profileData) {
      console.warn('user-profile load error:', profileError?.message ?? 'no data', 'userId:', userId);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const [
      { data: badgeData },
      { count: attendCount },
      { count: hostCount },
    ] = await Promise.all([
      supabase.from('user_badges').select('badge_key, seen').eq('user_id', userId),
      supabase.from('event_attendees').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('event').select('*', { count: 'exact', head: true }).eq('profile_id', userId),
    ]);

    setProfile(profileData);
    setBadges(badgeData ?? []);
    setAttended(attendCount ?? 0);
    setHosted(hostCount ?? 0);
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#FF6B00" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (notFound || !profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#F0F0FA" />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.errorText}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const earnedKeys = new Set(badges.map((b) => b.badge_key));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#F0F0FA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          {profile.profile_image_url ? (
            <Image source={{ uri: profile.profile_image_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={40} color="#4A4A6A" />
            </View>
          )}
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.is_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>

        {/* Trust score pill */}
        {profile.trust_score != null && profile.trust_score > 0 && (
          <View style={styles.tierRow}>
            <View style={styles.scorePill}>
              <Ionicons name="star" size={12} color="#FF6B00" />
              <Text style={styles.scoreText}>★ {Number(profile.trust_score).toFixed(1)}</Text>
            </View>
          </View>
        )}

        {/* Bio */}
        {profile.bio ? (
          <View style={styles.bioBox}>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* Location */}
        {profile.location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color="#7878A0" />
            <Text style={styles.locationText}>{profile.location}</Text>
          </View>
        ) : null}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{attended}</Text>
            <Text style={styles.statLabel}>Attended</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{hosted}</Text>
            <Text style={styles.statLabel}>Hosted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{badges.length}</Text>
            <Text style={styles.statLabel}>Badges</Text>
          </View>
        </View>

        {/* Badges */}
        <Text style={styles.sectionTitle}>Badges</Text>
        <View style={styles.badgesGrid}>
          {BADGE_DEFINITIONS.map((def) => (
            <BadgeItem
              key={def.key}
              emoji={def.emoji}
              name={def.name}
              earned={earnedKeys.has(def.key)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F0F0FA',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 12,
  },
  avatarFallback: {
    backgroundColor: '#1E1E28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F0F0FA',
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    color: '#7878A0',
    fontWeight: '600',
    marginBottom: 6,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f2e1a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  verifiedText: {
    fontSize: 12,
    color: '#22c55e',
    fontWeight: '700',
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E1E28',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tierEmoji: {
    fontSize: 14,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C0C0D8',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E1E28',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6B00',
  },
  bioBox: {
    backgroundColor: '#1A1030',
    borderWidth: 1,
    borderColor: '#3D2A6E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  bioText: {
    fontSize: 14,
    color: '#C0C0D8',
    lineHeight: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
    justifyContent: 'center',
  },
  locationText: {
    fontSize: 13,
    color: '#7878A0',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1E1E28',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2E2E40',
    marginVertical: 12,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F0F0FA',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#7878A0',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F0F0FA',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#7878A0',
    fontSize: 16,
    fontWeight: '600',
  },
});
