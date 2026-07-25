import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase/client';
import { BADGE_DEFINITIONS } from '../../constants/badges';
import { REPUTATION_TAGS } from '../../constants/reputationTags';
import BadgeItem from '../../components/BadgeItem';
import ReputationTag from '../../components/ReputationTag';
import StreakCard from '../../components/StreakCard';
import EventHistoryCard from '../../components/EventHistoryCard';
import OpenRing from '../../components/OpenRing';
import { categoryColor, colors, fonts } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import {
  fetchRateableEvent,
  submitUserRating,
  fetchReputationTags,
  fetchSkillLevels,
  fetchEventHistory,
  fetchStreak,
  fetchEventStats,
  fetchUserReputationScore,
} from '../../lib/profileQueries';

const LEVEL_TO_PERCENT: Record<string, number> = {
  'For All': 10,
  Newbie: 20,
  Beginner: 35,
  Intermediate: 55,
  Advanced: 75,
  Expert: 100,
};

function TrustScorePill({ score }: { score: number }) {
  let color = '#7a7a9a';
  let label = 'New';
  if (score >= 4.5)      { color = '#22C55E'; label = 'Excellent'; }
  else if (score >= 4.0) { color = '#FF6B00'; label = 'Great'; }
  else if (score >= 3.0) { color = '#FFB800'; label = 'Good'; }
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

function EmptyHint({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={ehStyles.row}>
      <Ionicons name={icon as 'star'} size={16} color="#3a3a50" />
      <Text style={ehStyles.text}>{text}</Text>
    </View>
  );
}
const ehStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 4 },
  text: { fontSize: 13, color: '#3a3a50', fontStyle: 'italic' },
});

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

type HistoryEvent = {
  id: string;
  name: string;
  date_time: string;
  address?: string;
  category?: string;
  isHosted: boolean;
};

export default function UserProfileScreen() {
  const { userId: rawUserId } = useLocalSearchParams<{ userId: string }>();
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId ?? '';
  const { user: me } = useAuth();

  const [profile, setProfile]               = useState<PublicProfile | null>(null);
  const [badges, setBadges]                 = useState<BadgeRow[]>([]);
  const [streak, setStreak]                 = useState<{ current_streak: number; longest_streak: number } | null>(null);
  const [reputationTags, setReputationTags] = useState<Record<string, number>>({});
  const [skillLevels, setSkillLevels]       = useState<Record<string, string>>({});
  const [eventHistory, setEventHistory]     = useState<HistoryEvent[]>([]);
  const [stats, setStats]                   = useState({ attended: 0, hosted: 0, vouches: 0 });
  const [repScore, setRepScore]             = useState<number | 'New' | null>(null);
  const [loading, setLoading]               = useState(true);
  const [notFound, setNotFound]             = useState(false);

  // Rating flow
  const [rateableEvent, setRateableEvent] = useState<{ id: string; name: string } | null>(null);
  const [showModal, setShowModal]         = useState(false);
  const [selectedStars, setSelectedStars] = useState(0);
  const [selectedTags, setSelectedTags]   = useState<Set<string>>(new Set());
  const [submitting, setSubmitting]       = useState(false);

  const sectionAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const barAnims     = useRef<Record<string, Animated.Value>>({});

  function runStagger() {
    Animated.parallel(
      sectionAnims.map((anim, i) =>
        Animated.timing(anim, { toValue: 1, duration: 400, delay: i * 60, useNativeDriver: true })
      )
    ).start();
  }

  useEffect(() => {
    if (!loading) runStagger();
  }, [loading]);

  useEffect(() => {
    Object.entries(skillLevels).forEach(([cat, level]) => {
      if (!barAnims.current[cat]) barAnims.current[cat] = new Animated.Value(0);
      Animated.timing(barAnims.current[cat], {
        toValue: (LEVEL_TO_PERCENT[level] ?? 10) / 100,
        duration: 800,
        useNativeDriver: false,
      }).start();
    });
  }, [skillLevels]);

  useEffect(() => {
    if (userId) load();
  }, [userId]);

  async function load() {
    setLoading(true);
    setNotFound(false);
    sectionAnims.forEach(a => a.setValue(0));

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, username, profile_image_url, bio, location, trust_score, is_verified')
      .eq('id', userId)
      .single();

    if (profileError || !profileData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
    const isOwnProfile = me?.id === userId;

    const [
      statsData,
      badgeData,
      streakData,
      repTags,
      skills,
      history,
      rateEvent,
      repResult,
    ] = await Promise.all([
      fetchEventStats(userId),
      supabase.from('user_badges').select('badge_key, seen').eq('user_id', userId),
      fetchStreak(userId),
      fetchReputationTags(userId),
      fetchSkillLevels(userId),
      fetchEventHistory(userId),
      me && !isOwnProfile ? fetchRateableEvent(me.id, userId) : Promise.resolve(null),
      fetchUserReputationScore(userId),
    ]);

    const vouchCount = Object.values(repTags as Record<string, number>).reduce((a, b) => a + b, 0);

    setProfile(profileData);
    setStats({ ...statsData, vouches: vouchCount });
    setBadges((badgeData.data as BadgeRow[]) ?? []);
    setStreak(streakData);
    setReputationTags(repTags);
    setSkillLevels(skills);
    setEventHistory(history as HistoryEvent[]);
    setRateableEvent(rateEvent);
    setRepScore(repResult);
    setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  async function handleSubmit() {
    if (!me || !rateableEvent || selectedStars === 0) return;
    setSubmitting(true);
    const { error } = await submitUserRating(
      me.id,
      userId,
      rateableEvent.id,
      selectedStars as 1 | 2 | 3 | 4 | 5,
      [...selectedTags],
    );
    setSubmitting(false);
    if (error) {
      Alert.alert('Error', 'Could not submit rating. Please try again.');
      return;
    }
    setShowModal(false);
    setRateableEvent(null);
    Alert.alert('Submitted!', `Your rating for ${profile?.name} has been saved.`);
  }

  function fadeSection(index: number, children: React.ReactNode) {
    const anim = sectionAnims[index];
    return (
      <Animated.View style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
      }}>
        {children}
      </Animated.View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#f0f0f5" />
          </TouchableOpacity>
        </View>
        <ActivityIndicator size="large" color="#FF6B00" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (notFound || !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#f0f0f5" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorState}>
          <Ionicons name="person-outline" size={48} color="#3a3a50" />
          <Text style={styles.errorText}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = profile.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? 'U';
  const earnedKeys    = new Set(badges.map(b => b.badge_key));
  const hasReputation = Object.keys(reputationTags).length > 0;
  const hasSkills     = Object.keys(skillLevels).length > 0;
  const hasHistory    = eventHistory.length > 0;
  const isOwnProfile  = me?.id === userId;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#f0f0f5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* SECTION 0: Hero */}
        {fadeSection(0, (
          <View style={styles.hero}>
            <View style={styles.avatarRow}>
              <View style={styles.avatarWrapper}>
                <View style={StyleSheet.absoluteFill}>
                  <OpenRing size={92} stroke={4} dot={9} bg={colors.bg} />
                </View>
                {profile.profile_image_url ? (
                  <Image source={{ uri: profile.profile_image_url }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.displayName}>{profile.name}</Text>
                <Text style={styles.handle}>
                  @{profile.username}{profile.location ? ` · ${profile.location}` : ''}
                </Text>
                <View style={styles.pillsRow}>
                  {repScore !== null && repScore !== 'New'
                    ? (
                      <View style={[tpStyles.pill, { borderColor: '#FFB80040', backgroundColor: '#FFB80018' }]}>
                        <Text style={[tpStyles.text, { color: '#FFB800' }]}>★ {Number(repScore).toFixed(1)} rep</Text>
                      </View>
                    ) : (
                      <TrustScorePill score={profile.trust_score ?? 0} />
                    )
                  }
                  {profile.is_verified && (
                    <View style={styles.verifiedPill}>
                      <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {profile.bio
              ? <Text style={styles.bio}>{profile.bio}</Text>
              : <Text style={styles.bioHint}>No bio yet</Text>
            }

            {/* Action buttons — only for other users */}
            {!isOwnProfile && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.dmButton}
                  onPress={() => router.push(`/(tabs)/messages/dm/${userId}` as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="chatbubble-outline" size={16} color="#f0f0f5" />
                  <Text style={styles.dmButtonText}>Message</Text>
                </TouchableOpacity>
                {rateableEvent && (
                  <TouchableOpacity style={styles.rateButton} onPress={() => setShowModal(true)} activeOpacity={0.85}>
                    <Ionicons name="star-outline" size={16} color="#FF6B00" />
                    <Text style={styles.rateButtonText}>Rate</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}

        {/* SECTION 1: Stats */}
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

        {/* SECTION 2: Streak */}
        {fadeSection(2, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Current streak</Text>
            <StreakCard
              currentStreak={streak?.current_streak ?? 0}
              longestStreak={streak?.longest_streak ?? 0}
            />
          </View>
        ))}

        {/* SECTION 3: Badges */}
        {fadeSection(3, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Badges</Text>
            <View style={styles.badgeGrid}>
              {BADGE_DEFINITIONS.map(badge => (
                <View key={badge.key} style={styles.badgeCell}>
                  <BadgeItem
                    emoji={badge.emoji}
                    name={badge.name}
                    earned={earnedKeys.has(badge.key)}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* SECTION 4: Reputation */}
        {fadeSection(4, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Reputation</Text>
            {hasReputation ? (
              <View style={styles.tagsWrap}>
                {Object.entries(reputationTags).map(([tag, count]) => (
                  <ReputationTag key={tag} tag={tag} count={count} />
                ))}
              </View>
            ) : (
              <EmptyHint icon="thumbs-up-outline" text="No reputation tags yet" />
            )}
          </View>
        ))}

        {/* SECTION 5: Skill Levels */}
        {fadeSection(5, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Skill levels</Text>
            {hasSkills ? (
              Object.entries(skillLevels).map(([cat, level]) => {
                if (!barAnims.current[cat]) {
                  barAnims.current[cat] = new Animated.Value((LEVEL_TO_PERCENT[level] ?? 10) / 100);
                }
                const barWidth = barAnims.current[cat].interpolate({
                  inputRange: [0, 1], outputRange: ['0%', '100%'],
                });
                return (
                  <View key={cat} style={styles.skillRow}>
                    <Text style={styles.skillCat}>{cat}</Text>
                    <View style={styles.barTrack}>
                      <Animated.View
                        style={[styles.barFill, { width: barWidth, backgroundColor: categoryColor(cat) }]}
                      />
                    </View>
                    <Text style={styles.skillLevel}>{level}</Text>
                  </View>
                );
              })
            ) : (
              <EmptyHint icon="bar-chart-outline" text="No skill levels yet" />
            )}
          </View>
        ))}

        {/* SECTION 6: Event History */}
        {fadeSection(6, (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Event history</Text>
            {hasHistory ? (
              eventHistory.map(ev => <EventHistoryCard key={ev.id} event={ev} />)
            ) : (
              <EmptyHint icon="calendar-outline" text="No event history yet" />
            )}
          </View>
        ))}

      </ScrollView>

      {/* Rating Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Rate {profile.name}</Text>
            {rateableEvent && (
              <Text style={styles.modalSub} numberOfLines={1}>From: {rateableEvent.name}</Text>
            )}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setSelectedStars(n)} activeOpacity={0.7} style={styles.starBtn}>
                  <Ionicons
                    name={n <= selectedStars ? 'star' : 'star-outline'}
                    size={36}
                    color={n <= selectedStars ? '#FFB800' : '#2E2E40'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {selectedStars > 0 && (
              <Text style={styles.starLabel}>
                {['Poor', 'Fair', 'Good', 'Great', 'Excellent'][selectedStars - 1]}
              </Text>
            )}
            <Text style={styles.tagsHeading}>Add tags (optional)</Text>
            <View style={styles.tagsWrapModal}>
              {REPUTATION_TAGS.map(tag => {
                const active = selectedTags.has(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                    onPress={() => toggleTag(tag)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, (selectedStars === 0 || submitting) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={selectedStars === 0 || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.submitBtnText}>Submit Rating</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontFamily: fonts.heading, color: colors.text },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // Hero — avatar sits inside the open ring
  hero: { marginBottom: 20 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  avatarWrapper: { width: 92, height: 92, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 78, height: 78, borderRadius: 39 },
  avatarFallback: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: colors.ember,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: { fontSize: 28, fontFamily: fonts.heading, color: '#fff' },
  profileInfo: { flex: 1, gap: 4 },
  displayName: { fontSize: 24, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.3 },
  handle: { fontSize: 13, fontFamily: fonts.body, color: colors.muted },
  pillsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
  },
  verifiedText: { fontSize: 12, fontFamily: fonts.bold, color: colors.success },
  bio: { fontSize: 14, fontFamily: fonts.body, color: colors.muted, lineHeight: 20, marginBottom: 12 },
  bioHint: { fontSize: 13, fontFamily: fonts.regular, color: '#3a3a50', fontStyle: 'italic', marginBottom: 12 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dmButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14, paddingVertical: 13,
  },
  dmButtonText: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  rateButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.ember,
    borderRadius: 14, paddingVertical: 13,
  },
  rateButtonText: { fontSize: 15, fontFamily: fonts.bold, color: colors.ember },

  // Stats — one card, three cells split by hairlines
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 16,
    marginBottom: 24,
  },
  statCard: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 26, fontFamily: fonts.display, color: colors.ember },
  statLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.muted, marginTop: 2 },

  // Section — quiet uppercase eyebrows
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.ember,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Badges
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  badgeCell: { width: '25%' },

  // Reputation
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap' },

  // Skills — bar color comes from the event category
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  skillCat: { width: 100, fontSize: 13, fontFamily: fonts.body, color: colors.text },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  skillLevel: { width: 90, fontSize: 11, fontFamily: fonts.bold, color: colors.muted, textAlign: 'right' },

  // Error
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, fontFamily: fonts.body, color: colors.muted },

  // Rating modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 36, paddingTop: 12,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.line, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: fonts.heading, color: colors.text, textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 13, fontFamily: fonts.body, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 6 },
  starBtn: { padding: 4 },
  starLabel: { fontSize: 14, fontFamily: fonts.bold, color: colors.star, textAlign: 'center', marginBottom: 20 },
  tagsHeading: {
    fontSize: 12, fontFamily: fonts.bold, color: colors.ember,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12,
  },
  tagsWrapModal: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  tagChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.cardAlt },
  tagChipActive: { borderColor: colors.ember, backgroundColor: 'rgba(255,107,0,0.12)' },
  tagChipText: { fontSize: 13, fontFamily: fonts.bold, color: colors.muted },
  tagChipTextActive: { color: colors.ember },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.cardAlt, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontFamily: fonts.bold, color: colors.muted },
  submitBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.ember, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { fontSize: 15, fontFamily: fonts.heading, color: '#fff' },
});
