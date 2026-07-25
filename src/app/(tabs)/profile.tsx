// @author Amir Hormaza
// Main Profile tab — shows reputation, streaks, badges, skills, and event history
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase/client';
import {
  fetchProfile,
  fetchEventStats,
  fetchReputationTags,
  fetchBadges,
  fetchStreak,
  fetchEventHistory,
  fetchSkillLevels,
  fetchUserReputationScore,
} from '../../lib/profileQueries';
// 4-column badge cards: earned = orange tint, locked = greyed out
import BadgeItem from '../../components/BadgeItem';
// Colored pill: icon + label + count for each reputation tag
import ReputationTag from '../../components/ReputationTag';
// Pulsing fire emoji + week dots + streak number
import StreakCard from '../../components/StreakCard';
// Past event row: left color bar + emoji + name/date + hosted/attended pill
import EventHistoryCard from '../../components/EventHistoryCard';
import { BADGE_DEFINITIONS } from '../../constants/badges';

const LEVEL_TO_PERCENT: Record<string, number> = {
  'For All': 10,
  'Newbie': 20,
  'Beginner': 35,
  'Intermediate': 55,
  'Advanced': 75,
  'Expert': 100,
};

// ── Trust score pill — color bracket changes by score ───────────────────────
function TrustScorePill({ score }: { score: number }) {
  let color = '#7a7a9a';
  let label = 'New';
  if (score >= 4.5)      { color = '#34d399'; label = 'Excellent'; }
  else if (score >= 4.0) { color = '#F97316'; label = 'Great'; }
  else if (score >= 3.0) { color = '#fbbf24'; label = 'Good'; }

  return (
    <View style={[tpStyles.pill, { borderColor: color + '40', backgroundColor: color + '18' }]}>
      <Text style={[tpStyles.text, { color }]}>★ {score.toFixed(1)} · {label}</Text>
    </View>
  );
}

const tpStyles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  text: { fontSize: 12, fontWeight: '700' },
});

// ── Muted placeholder shown when a section has no data yet ─────────────────
function EmptyHint({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={ehStyles.row}>
      <Ionicons name={icon as 'star'} size={16} color="#3a3a50" />
      <Text style={ehStyles.text}>{text}</Text>
    </View>
  );
}

const ehStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  text: { fontSize: 13, color: '#3a3a50', fontStyle: 'italic' },
});

// ── Types ───────────────────────────────────────────────────────────────────
type ProfileData = {
  trust_score?: number;
  is_verified?: boolean;
  bio?: string;
  location?: string;
};

type Stats = { attended: number; hosted: number; vouches: number };

type BadgeRow = { badge_key: string; seen: boolean };

type HistoryEvent = {
  id: string;
  name: string;
  date_time: string;
  address?: string;
  category?: string;
  isHosted: boolean;
};

// ── Main screen ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user } = useAuth();

  const [profile, setProfile]               = useState<ProfileData | null>(null);
  const [stats, setStats]                   = useState<Stats>({ attended: 0, hosted: 0, vouches: 0 });
  const [badges, setBadges]                 = useState<BadgeRow[]>([]);
  const [streak, setStreak]                 = useState<{ current_streak: number; longest_streak: number } | null>(null);
  const [reputationTags, setReputationTags] = useState<Record<string, number>>({});
  const [skillLevels, setSkillLevels]       = useState<Record<string, string>>({});
  const [eventHistory, setEventHistory]     = useState<HistoryEvent[]>([]);
  const [repScore, setRepScore]             = useState<number | 'New' | null>(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(false);

  // One Animated.Value per section — drives staggered fade-up
  const sectionAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;

  // Per-category bar Animated.Values (useNativeDriver: false for layout props)
  const barAnims = useRef<Record<string, Animated.Value>>({});

  // ── Staggered section reveal ──────────────────────────────────────────────
  function runStagger() {
    const delays = [0, 100, 150, 200, 250, 300, 350];
    Animated.parallel(
      sectionAnims.map((anim, i) =>
        Animated.timing(anim, { toValue: 1, duration: 400, delay: delays[i], useNativeDriver: true })
      )
    ).start();
  }

  useEffect(() => {
    if (!loading) runStagger();
  }, [loading]);

  // ── Animate skill bars when data arrives ─────────────────────────────────
  useEffect(() => {
    Object.entries(skillLevels).forEach(([cat, level]) => {
      if (!barAnims.current[cat]) {
        barAnims.current[cat] = new Animated.Value(0);
      }
      Animated.timing(barAnims.current[cat], {
        toValue: (LEVEL_TO_PERCENT[level] ?? 10) / 100,
        duration: 800,
        useNativeDriver: false,
      }).start();
    });
  }, [skillLevels]);

  // ── Load all profile data in parallel ────────────────────────────────────
  async function loadData(userId: string) {
    setLoading(true);
    setError(false);
    sectionAnims.forEach(a => a.setValue(0));

    try {
      const [
        profileData,
        statsData,
        badgeData,
        streakData,
        repTags,
        skills,
        history,
        repResult,
      ] = await Promise.all([
        fetchProfile(userId),
        fetchEventStats(userId),
        fetchBadges(userId),
        fetchStreak(userId),
        fetchReputationTags(userId),
        fetchSkillLevels(userId),
        fetchEventHistory(userId),
        fetchUserReputationScore(userId),
      ]);

      // Vouch count = sum of all tag counts — no extra query needed
      const vouchCount = Object.values(repTags as Record<string, number>).reduce((a, b) => a + b, 0);

      setProfile(profileData);
      setStats({ ...statsData, vouches: vouchCount });
      setBadges(badgeData);
      setStreak(streakData);
      setReputationTags(repTags);
      setSkillLevels(skills);
      setEventHistory(history as HistoryEvent[]);
      setRepScore(repResult);

      // Mark any unseen badges as seen now that the user is viewing them
      const unseenKeys = (badgeData as BadgeRow[])
        .filter(b => !b.seen)
        .map(b => b.badge_key);
      if (unseenKeys.length > 0) {
        await supabase
          .from('user_badges')
          .update({ seen: true })
          .eq('user_id', userId)
          .in('badge_key', unseenKeys);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (user?.id) loadData(user.id);
    }, [user?.id])
  );

  // ── Section wrapper: fade + slide up ─────────────────────────────────────
  function fadeSection(index: number, children: React.ReactNode) {
    const anim = sectionAnims[index];
    return (
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        }}
      >
        {children}
      </Animated.View>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerLogo}>OpenCircle</Text>
        </View>
        <ActivityIndicator size="large" color="#F97316" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerLogo}>OpenCircle</Text>
        </View>
        <View style={styles.errorState}>
          <Ionicons name="cloud-offline-outline" size={48} color="#3a3a50" />
          <Text style={styles.errorText}>Could not load profile</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => user?.id && loadData(user.id)}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const initials = user?.name
    ?.split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U';

  const earnedKeys       = new Set(badges.map(b => b.badge_key));
  const hasReputation    = Object.keys(reputationTags).length > 0;
  const hasSkills        = Object.keys(skillLevels).length > 0;
  const hasHistory       = eventHistory.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

      {/* ── Fixed header ────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>OpenCircle</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/(tabs)/profile-settings')}
        >
          <Ionicons name="settings-outline" size={22} color="#7a7a9a" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >

        {/* ── SECTION 0: Hero ─────────────────────────────────────────── */}
        {fadeSection(0, (
          <View style={styles.hero}>
            <View style={styles.avatarRow}>

              {/* Avatar: photo if available, otherwise initials */}
              <View style={styles.avatarWrapper}>
                {user?.profileImage ? (
                  <Image
                    source={{ uri: user.profileImage }}
                    style={styles.avatarImage}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.onlineDot} />
              </View>

              <View style={styles.profileInfo}>
                <Text style={styles.displayName}>{user?.name ?? 'Anonymous'}</Text>
                <Text style={styles.handle}>
                  @{user?.username ?? 'user'}
                  {profile?.location ? ` · ${profile.location}` : ''}
                </Text>
                <View style={styles.pillsRow}>
                  {repScore !== null && repScore !== 'New'
                    ? (
                      <View style={[tpStyles.pill, { borderColor: '#FBBF2440', backgroundColor: '#FBBF2418' }]}>
                        <Text style={[tpStyles.text, { color: '#FBBF24' }]}>★ {Number(repScore).toFixed(1)} rep</Text>
                      </View>
                    ) : (
                      <TrustScorePill score={profile?.trust_score ?? 0} />
                    )
                  }
                  {profile?.is_verified && (
                    <View style={styles.verifiedPill}>
                      <Ionicons name="checkmark-circle" size={13} color="#34d399" />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {profile?.bio
              ? <Text style={styles.bio}>{profile.bio}</Text>
              : <Text style={styles.bioHint}>No bio yet · tap ⚙️ to add one</Text>
            }
          </View>
        ))}

        {/* ── SECTION 1: Stats row ────────────────────────────────────── */}
        {fadeSection(1, (
          <View style={styles.statsRow}>
            {[
              { value: stats.attended, label: 'Attended' },
              { value: stats.hosted,   label: 'Hosted'   },
              { value: stats.vouches,  label: 'Vouches'  },
            ].map(({ value, label }) => (
              <View key={label} style={styles.statCard}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* ── SECTION 2: Streak ───────────────────────────────────────── */}
        {fadeSection(2, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🔥 Current Streak</Text>
            <StreakCard
              currentStreak={streak?.current_streak ?? 0}
              longestStreak={streak?.longest_streak ?? 0}
            />
          </View>
        ))}

        {/* ── SECTION 3: Badges grid (all 8 always shown) ─────────────── */}
        {fadeSection(3, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🏅 Badges</Text>
            <View style={styles.badgeGrid}>
              {BADGE_DEFINITIONS.map(badge => {
                const earned  = earnedKeys.has(badge.key);
                const badgeRow = badges.find(b => b.badge_key === badge.key);
                return (
                  <View key={badge.key} style={styles.badgeCell}>
                    <BadgeItem
                      emoji={badge.emoji}
                      name={badge.name}
                      earned={earned}
                      unseen={earned && !badgeRow?.seen}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {/* ── SECTION 4: Reputation tags ──────────────────────────────── */}
        {fadeSection(4, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>👍 Reputation</Text>
            {hasReputation ? (
              <View style={styles.tagsWrap}>
                {Object.entries(reputationTags).map(([tag, count]) => (
                  <ReputationTag key={tag} tag={tag} count={count} />
                ))}
              </View>
            ) : (
              <EmptyHint
                icon="thumbs-up-outline"
                text="Attend events to earn reputation tags from other users"
              />
            )}
          </View>
        ))}

        {/* ── SECTION 5: Skill levels with animated bars ──────────────── */}
        {fadeSection(5, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📊 Skill Levels</Text>
            {hasSkills ? (
              Object.entries(skillLevels).map(([cat, level]) => {
                if (!barAnims.current[cat]) {
                  barAnims.current[cat] = new Animated.Value((LEVEL_TO_PERCENT[level] ?? 10) / 100);
                }
                const barWidth = barAnims.current[cat].interpolate({
                  inputRange:  [0, 1],
                  outputRange: ['0%', '100%'],
                });
                return (
                  <View key={cat} style={styles.skillRow}>
                    <Text style={styles.skillCat}>{cat}</Text>
                    <View style={styles.barTrack}>
                      <Animated.View style={[styles.barFill, { width: barWidth }]} />
                    </View>
                    <Text style={styles.skillLevel}>{level}</Text>
                  </View>
                );
              })
            ) : (
              <EmptyHint
                icon="bar-chart-outline"
                text="Join events to build up your skill levels"
              />
            )}
          </View>
        ))}

        {/* ── SECTION 6: Event history ────────────────────────────────── */}
        {fadeSection(6, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📅 Event History</Text>
            {hasHistory ? (
              eventHistory.map(ev => <EventHistoryCard key={ev.id} event={ev} />)
            ) : (
              <EmptyHint
                icon="calendar-outline"
                text="Your attended and hosted events will appear here"
              />
            )}
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerLogo: { fontSize: 20, fontWeight: '800', color: '#F97316' },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#13131c',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // Hero
  hero: { marginBottom: 20 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  avatarWrapper: { position: 'relative' },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#F97316',
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F97316',
    borderWidth: 3,
    borderColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: '#fff' },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#34d399',
    borderWidth: 2,
    borderColor: '#0a0a0f',
  },
  profileInfo: { flex: 1, gap: 4 },
  displayName: { fontSize: 22, fontWeight: '800', color: '#f0f0f5' },
  handle: { fontSize: 13, color: '#7a7a9a' },
  pillsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.3)',
  },
  verifiedText: { fontSize: 12, fontWeight: '700', color: '#34d399' },
  bio: { fontSize: 14, color: '#7a7a9a', lineHeight: 20 },
  bioHint: { fontSize: 13, color: '#3a3a50', fontStyle: 'italic' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: '#13131c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#F97316' },
  statLabel: { fontSize: 12, color: '#7a7a9a', fontWeight: '600', marginTop: 2 },

  // Section wrapper
  section: { marginBottom: 28 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#f0f0f5', marginBottom: 12 },

  // Badges
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  badgeCell: { width: '25%' },

  // Reputation
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap' },

  // Skills
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  skillCat: { width: 100, fontSize: 13, fontWeight: '600', color: '#f0f0f5' },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: '#F97316' },
  skillLevel: { width: 90, fontSize: 11, fontWeight: '600', color: '#7a7a9a', textAlign: 'right' },

  // Error state
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, color: '#7a7a9a', fontWeight: '600' },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#13131c',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  retryText: { fontSize: 14, fontWeight: '700', color: '#F97316' },
});
