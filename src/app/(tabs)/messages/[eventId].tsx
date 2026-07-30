import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase/client';
import { useAuth } from '../../../context/AuthContext';
import { isEventExpired } from '../../../lib/eventLifecycle';
import { uploadChatMedia } from '../../../lib/supabase/storage';
import MediaBubble, { type MediaType } from '../../../components/MediaBubble';
import GifPicker from '../../../components/GifPicker';
import FullScreenImageViewer from '../../../components/FullScreenImageViewer';

const CATEGORY_IMAGES: Record<string, ImageSourcePropType> = {
  sports:     require('../../../../assets/images/sports.jpg'),
  party:      require('../../../../assets/images/party.jpg'),
  food:       require('../../../../assets/images/food.jpg'),
  study:      require('../../../../assets/images/study.jpg'),
  ride:       require('../../../../assets/images/ride.jpg'),
  zen:        require('../../../../assets/images/zen.jpg'),
  networking: require('../../../../assets/images/study.jpg'),
  outdoors:   require('../../../../assets/images/sports.jpg'),
  other:      require('../../../../assets/images/party.jpg'),
};

const TILE_SIZE = 130;
const COLS = 4;
const ROWS = 8;

function TiledBackground({ source }: { source: ImageSourcePropType }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {Array.from({ length: ROWS }).map((_, row) =>
        Array.from({ length: COLS }).map((_, col) => (
          <Image
            key={`${row}-${col}`}
            source={source}
            style={{ position: 'absolute', top: row * TILE_SIZE, left: col * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }}
            resizeMode="cover"
          />
        ))
      )}
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.30)' }]} />
    </View>
  );
}

interface Message {
  id: string;
  messages: string;
  user_id: string;
  created_at: string;
  chat_id: string;
  media_url?: string | null;
  media_type?: MediaType | null;
  profile?: { name: string; profile_image_url?: string };
}

interface Member {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string | null;
}

// Supabase types the profiles!user_id join as an array even though the FK
// makes it a single row — normalize to the object shape Message expects.
function normalizeMessage(row: any): Message {
  return { ...row, profile: Array.isArray(row.profile) ? row.profile[0] : row.profile };
}

export default function EventChatScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [messages, setMessages]       = useState<Message[]>([]);
  const [newMessage, setNewMessage]   = useState('');
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);
  const [chatId, setChatId]           = useState<string | null>(null);
  const [eventName, setEventName]     = useState('Event Chat');
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [categoryBg, setCategoryBg]   = useState<ImageSourcePropType | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [ownerId, setOwnerId]         = useState<string | null>(null);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Members sheet
  const [showMembers, setShowMembers]     = useState(false);
  const [members, setMembers]             = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Moderation modals
  const [reportMsgModal, setReportMsgModal] = useState<{
    visible: boolean; step: 'reasons' | 'confirm'; message: Message | null; reason: string;
  }>({ visible: false, step: 'reasons', message: null, reason: '' });

  const [memberModal, setMemberModal] = useState<{
    visible: boolean;
    step: 'actions' | 'reasons' | 'confirm';
    member: Member | null;
    action: 'kick' | 'report' | 'kickAndReport' | null;
    reason: string;
  }>({ visible: false, step: 'actions', member: null, action: null, reason: '' });

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function loadChat() {
      if (!eventId || !user) { setLoading(false); return; }
      try {

      // Verify attendance
      const { data: attendeeData, error: attendeeError } = await supabase
        .from('event_attendees')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .single();

      if (attendeeError || !attendeeData) {
        setLoading(false);
        Alert.alert('Access Denied', 'You are not attending this event.');
        router.back();
        return;
      }

      // Fetch event metadata
      const { data: eventData } = await supabase
        .from('event')
        .select('name, category, profile_id, date_time')
        .eq('id', eventId)
        .single();

      // Chats live and die with the event
      if (eventData?.date_time && isEventExpired(eventData.date_time)) {
        setLoading(false);
        Alert.alert('Event ended', 'This event is over, so its chat is closed.');
        router.back();
        return;
      }

      if (eventData?.name)     setEventName(eventData.name);
      if (eventData?.category) {
        const img = CATEGORY_IMAGES[eventData.category.trim().toLowerCase()];
        if (img) setCategoryBg(img);
      }
      if (eventData?.profile_id) {
        setOwnerId(eventData.profile_id);
        const { data: ownerData } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', eventData.profile_id)
          .single();
        if (ownerData?.username) setOwnerUsername(ownerData.username);
      }

      // Attendee count for subtitle
      const { count } = await supabase
        .from('event_attendees')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId);
      setMemberCount(count ?? 0);

      // Find or create event_chat row
      const { data: chatRow, error: chatError } = await supabase
        .from('event_chats')
        .select('id')
        .eq('event_id', eventId)
        .single();

      let resolvedChatId: string;
      if (chatError?.code === 'PGRST116') {
        const { data: newChat, error: createError } = await supabase
          .from('event_chats')
          .insert({ event_id: eventId })
          .select('id')
          .single();
        if (createError || !newChat) {
          setLoading(false);
          Alert.alert('Error', 'Could not start chat for this event.');
          return;
        }
        resolvedChatId = newChat.id;
      } else if (chatError || !chatRow) {
        setLoading(false);
        Alert.alert('Error', 'Could not load chat for this event.');
        return;
      } else {
        resolvedChatId = chatRow.id;
      }

      setChatId(resolvedChatId);

      // Load message history
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, chat_id, messages, media_url, media_type, user_id, created_at, profile:profiles!user_id(name, profile_image_url)')
        .eq('chat_id', resolvedChatId)
        .order('created_at', { ascending: true });

      setMessages(error ? [] : (data ?? []).map(normalizeMessage));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);

      // Realtime subscription
      const channel = supabase
        .channel(`event-chat-${resolvedChatId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${resolvedChatId}` },
          (payload) => fetchNewMessage(payload.new.id),
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
      setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    loadChat();
    return () => { cleanup?.(); };
  }, [eventId, user?.id]);

  async function fetchNewMessage(messageId: string) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, chat_id, messages, user_id, created_at, profile:profiles!user_id(name, profile_image_url)')
      .eq('id', messageId)
      .single();

    if (!error && data) {
      const msg = normalizeMessage(data);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  async function loadMembers() {
    if (membersLoading) return;
    setMembersLoading(true);
    const { data } = await supabase
      .from('event_attendees')
      .select('profiles!user_id(id, name, username, profile_image_url)')
      .eq('event_id', eventId);

    const list: Member[] = (data ?? [])
      .map((r: any) => r.profiles)
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, name: p.name, username: p.username, profile_image_url: p.profile_image_url ?? null }));

    setMembers(list);
    setMembersLoading(false);
  }

  function openMembers() {
    setShowMembers(true);
    if (members.length === 0) loadMembers();
  }

  function goToProfile(userId: string) {
    setShowMembers(false);
    setTimeout(() => router.push({ pathname: '/(tabs)/user-profile', params: { userId } }), 200);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !user || !chatId) return;
    setSending(true);
    const { error } = await supabase.from('chat_messages').insert({
      chat_id:  chatId,
      user_id:  user.id,
      messages: newMessage.trim(),
    });
    if (error) Alert.alert('Error', 'Could not send message.');
    else setNewMessage('');
    setSending(false);
  }

  async function sendMediaMessage(mediaUrl: string, mediaType: MediaType) {
    if (!user || !chatId) return;
    const { error } = await supabase.from('chat_messages').insert({
      chat_id: chatId, user_id: user.id, messages: '', media_url: mediaUrl, media_type: mediaType,
    });
    if (error) Alert.alert('Error', 'Could not send media.');
  }

  async function pickAndSendMedia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to share photos and videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0] || !user) return;
    setUploadingMedia(true);
    try {
      const { url, mediaType } = await uploadChatMedia(user.id, result.assets[0].uri);
      await sendMediaMessage(url, mediaType);
    } catch {
      Alert.alert('Error', 'Could not upload. Try a smaller file.');
    } finally {
      setUploadingMedia(false);
    }
  }

  function handleGifSelected(gifUrl: string) {
    sendMediaMessage(gifUrl, 'gif');
  }

  // ── Message reporting ────────────────────────────────────────────────────────

  function handleReportMessage(message: Message) {
    setReportMsgModal({ visible: true, step: 'reasons', message, reason: '' });
  }

  async function submitMessageReport() {
    if (!user || !reportMsgModal.message) return;
    await supabase.from('message_reports').insert({
      reporter_id: user.id,
      message_id:  reportMsgModal.message.id,
      context:     'event_chat',
      reason:      reportMsgModal.reason,
    });
    setReportMsgModal({ visible: false, step: 'reasons', message: null, reason: '' });
  }

  // ── Member moderation (event owner only) ─────────────────────────────────────

  function handleMemberAction(member: Member) {
    setMemberModal({ visible: true, step: 'actions', member, action: null, reason: '' });
  }

  async function kickMember(memberId: string) {
    if (!eventId) return;
    const { error } = await supabase.from('event_attendees').delete()
      .eq('event_id', eventId).eq('user_id', memberId);
    if (!error) {
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setMemberCount(c => c - 1);
    }
  }

  async function submitMemberAction() {
    if (!user || !memberModal.member || !memberModal.action) return;
    if (memberModal.action === 'kick' || memberModal.action === 'kickAndReport') {
      await kickMember(memberModal.member.id);
    }
    if (memberModal.action === 'report' || memberModal.action === 'kickAndReport') {
      await supabase.from('user_reports').insert({
        reporter_id: user.id,
        reported_id: memberModal.member.id,
        event_id:    eventId,
        reason:      memberModal.reason,
      });
    }
    setMemberModal({ visible: false, step: 'actions', member: null, action: null, reason: '' });
  }

  // ─────────────────────────────────────────────────────────────────────────────

  function renderMessage({ item }: { item: Message }) {
    const isOwn = item.user_id === user?.id;
    const profileName = item.profile?.name ?? 'User';
    const initials = profileName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    return (
      <View style={[styles.messageRow, isOwn ? styles.ownRow : styles.otherRow]}>
        {!isOwn && (
          <TouchableOpacity onPress={() => goToProfile(item.user_id)} activeOpacity={0.7}>
            {item.profile?.profile_image_url ? (
              <ExpoImage source={{ uri: item.profile.profile_image_url }} style={styles.avatarPlaceholder} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.otherBubble,
            item.media_type ? styles.mediaBubble : null,
          ]}
          activeOpacity={0.9}
          onLongPress={!isOwn ? () => handleReportMessage(item) : undefined}
          delayLongPress={500}
        >
          {!isOwn && (
            <TouchableOpacity onPress={() => goToProfile(item.user_id)} activeOpacity={0.7}>
              <Text style={[styles.senderName, item.media_type ? styles.senderNameOnMedia : null]}>{profileName}</Text>
            </TouchableOpacity>
          )}
          {item.media_url && item.media_type ? (
            <MediaBubble url={item.media_url} type={item.media_type} onPressImage={(u) => setFullScreenImage(u)} />
          ) : null}
          {item.messages ? (
            <Text style={[styles.messageText, isOwn && styles.ownMessageText, item.media_type ? { marginTop: 6 } : null]}>
              {item.messages}
            </Text>
          ) : null}
          <Text style={[styles.timestamp, isOwn && styles.ownTimestamp]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderMember({ item }: { item: Member }) {
    const isMe            = item.id === user?.id;
    const isCurrentOwner  = user?.id === ownerId;
    const isMemberOwner   = item.id === ownerId;
    const canManage       = isCurrentOwner && !isMe && !isMemberOwner;

    return (
      <View style={styles.memberRow}>
        <TouchableOpacity
          style={styles.memberRowContent}
          activeOpacity={isMe ? 1 : 0.75}
          onPress={() => !isMe && goToProfile(item.id)}
        >
          {item.profile_image_url ? (
            <ExpoImage source={{ uri: item.profile_image_url }} style={styles.memberAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
              <Ionicons name="person" size={18} color="#4A4A6A" />
            </View>
          )}
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>
              {item.name}{isMe ? ' (You)' : ''}{isMemberOwner ? ' · Host' : ''}
            </Text>
            <Text style={styles.memberUsername}>@{item.username}</Text>
          </View>
          {!isMe && !canManage && <Ionicons name="chevron-forward" size={16} color="#5A5A78" />}
        </TouchableOpacity>
        {canManage && (
          <TouchableOpacity onPress={() => handleMemberAction(item)} style={styles.memberMoreBtn} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#7878A0" />
          </TouchableOpacity>
        )}
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#F0F0FA" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerCenter} onPress={openMembers} activeOpacity={0.7}>
          <Text style={styles.headerTitle} numberOfLines={1}>{eventName}</Text>
          <View style={styles.headerSubRow}>
            <Text style={styles.headerSubtitle}>
              {ownerUsername ? `by @${ownerUsername} · ` : ''}{memberCount} member{memberCount !== 1 ? 's' : ''}
            </Text>
            <Ionicons name="chevron-down" size={12} color="#5A5A78" style={{ marginLeft: 3 }} />
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Category backdrop lives only behind the message list — it ends
            exactly where the composer begins */}
        <View style={styles.chatArea}>
          {categoryBg && <TiledBackground source={categoryBg} />}
          <FlatList
            ref={flatListRef}
            style={styles.messageFlatList}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubbles-outline" size={42} color="#2E2E40" />
                <Text style={styles.emptyChatText}>No messages yet. Say hello!</Text>
              </View>
            }
          />
        </View>

        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={pickAndSendMedia}
            disabled={uploadingMedia || !chatId}
          >
            {uploadingMedia
              ? <ActivityIndicator size="small" color="#FF6B00" />
              : <Ionicons name="add-circle-outline" size={26} color="#FF6B00" />
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.gifButton}
            onPress={() => setGifPickerVisible(true)}
            disabled={!chatId}
          >
            <Text style={styles.gifButtonText}>GIF</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor="#5A5A78"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.disabledButton]}
            onPress={sendMessage}
            disabled={sending || !newMessage.trim() || !chatId}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <GifPicker
        visible={gifPickerVisible}
        onClose={() => setGifPickerVisible(false)}
        onSelect={handleGifSelected}
      />
      <FullScreenImageViewer uri={fullScreenImage} onClose={() => setFullScreenImage(null)} />

      {/* Members Sheet */}
      <Modal visible={showMembers} transparent animationType="slide" onRequestClose={() => setShowMembers(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowMembers(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              Members {membersLoading ? '' : `(${members.length})`}
            </Text>

            {membersLoading ? (
              <ActivityIndicator color="#FF6B00" style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={members}
                keyExtractor={m => m.id}
                renderItem={renderMember}
                ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
                contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Report Message Modal */}
      <Modal visible={reportMsgModal.visible} transparent animationType="slide"
        onRequestClose={() => setReportMsgModal(s => ({ ...s, visible: false }))}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill}
            onPress={() => setReportMsgModal(s => ({ ...s, visible: false }))} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn}
                onPress={() =>
                  reportMsgModal.step === 'confirm'
                    ? setReportMsgModal(s => ({ ...s, step: 'reasons' }))
                    : setReportMsgModal(s => ({ ...s, visible: false }))}>
                <Ionicons name={reportMsgModal.step === 'confirm' ? 'chevron-back' : 'close'} size={20} color="#F0F0FA" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {reportMsgModal.step === 'reasons' ? 'Report Message' : 'Confirm Report'}
              </Text>
              <View style={{ width: 36 }} />
            </View>

            {reportMsgModal.step === 'reasons' ? (
              <View>
                <Text style={styles.modalSubtitle}>Why are you reporting this message?</Text>
                {['Spam', 'Harassment', 'Inappropriate content', 'Other'].map(r => (
                  <TouchableOpacity key={r} style={styles.reasonRow} activeOpacity={0.75}
                    onPress={() => setReportMsgModal(s => ({ ...s, reason: r, step: 'confirm' }))}>
                    <Text style={styles.reasonText}>{r}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#5A5A78" />
                  </TouchableOpacity>
                ))}
                <View style={{ height: insets.bottom + 16 }} />
              </View>
            ) : (
              <View>
                <Text style={styles.modalSubtitle}>You're reporting this message for:</Text>
                <View style={styles.confirmBadge}>
                  <Text style={styles.confirmBadgeText}>{reportMsgModal.reason}</Text>
                </View>
                <Text style={styles.confirmNote}>
                  Our team will review this and take action if it violates our community guidelines.
                </Text>
                <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85} onPress={submitMessageReport}>
                  <Text style={styles.submitBtnText}>Submit Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.75}
                  onPress={() => setReportMsgModal(s => ({ ...s, visible: false }))}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ height: insets.bottom + 16 }} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Member Action Modal */}
      <Modal visible={memberModal.visible} transparent animationType="slide"
        onRequestClose={() => setMemberModal(s => ({ ...s, visible: false }))}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill}
            onPress={() => setMemberModal(s => ({ ...s, visible: false }))} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn}
                onPress={() => {
                  if (memberModal.step === 'reasons')      setMemberModal(s => ({ ...s, step: 'actions' }));
                  else if (memberModal.step === 'confirm' && memberModal.action !== 'kick')
                                                           setMemberModal(s => ({ ...s, step: 'reasons' }));
                  else if (memberModal.step === 'confirm') setMemberModal(s => ({ ...s, step: 'actions' }));
                  else                                     setMemberModal(s => ({ ...s, visible: false }));
                }}>
                <Ionicons name={memberModal.step === 'actions' ? 'close' : 'chevron-back'} size={20} color="#F0F0FA" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {memberModal.step === 'actions'  ? (memberModal.member?.name ?? 'Member')
                  : memberModal.step === 'reasons' ? 'Select Reason'
                  : 'Confirm Action'}
              </Text>
              <View style={{ width: 36 }} />
            </View>

            {memberModal.step === 'actions' && (
              <View>
                <Text style={styles.modalSubtitle}>What would you like to do?</Text>
                <TouchableOpacity style={[styles.reasonRow, styles.destructiveRow]} activeOpacity={0.75}
                  onPress={() => setMemberModal(s => ({ ...s, action: 'kick', step: 'confirm' }))}>
                  <Ionicons name="person-remove-outline" size={18} color="#FF4D4D" />
                  <Text style={[styles.reasonText, styles.destructiveText]}>Kick from event</Text>
                  <Ionicons name="chevron-forward" size={16} color="#FF4D4D" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.reasonRow} activeOpacity={0.75}
                  onPress={() => setMemberModal(s => ({ ...s, action: 'report', step: 'reasons' }))}>
                  <Ionicons name="flag-outline" size={18} color="#F0F0FA" />
                  <Text style={styles.reasonText}>Report user</Text>
                  <Ionicons name="chevron-forward" size={16} color="#5A5A78" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.reasonRow, styles.destructiveRow]} activeOpacity={0.75}
                  onPress={() => setMemberModal(s => ({ ...s, action: 'kickAndReport', step: 'reasons' }))}>
                  <Ionicons name="ban-outline" size={18} color="#FF4D4D" />
                  <Text style={[styles.reasonText, styles.destructiveText]}>Kick & Report</Text>
                  <Ionicons name="chevron-forward" size={16} color="#FF4D4D" />
                </TouchableOpacity>
                <View style={{ height: insets.bottom + 16 }} />
              </View>
            )}

            {memberModal.step === 'reasons' && (
              <View>
                <Text style={styles.modalSubtitle}>Why are you reporting this user?</Text>
                {['Harassment', 'Spam', 'Inappropriate behavior', 'Other'].map(r => (
                  <TouchableOpacity key={r} style={styles.reasonRow} activeOpacity={0.75}
                    onPress={() => setMemberModal(s => ({ ...s, reason: r, step: 'confirm' }))}>
                    <Text style={styles.reasonText}>{r}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#5A5A78" />
                  </TouchableOpacity>
                ))}
                <View style={{ height: insets.bottom + 16 }} />
              </View>
            )}

            {memberModal.step === 'confirm' && (
              <View>
                <Text style={styles.modalSubtitle}>
                  {memberModal.action === 'kick'
                    ? `Remove ${memberModal.member?.name} from this event?`
                    : memberModal.action === 'report'
                    ? 'You are reporting this user for:'
                    : `Kick ${memberModal.member?.name} and report them for:`}
                </Text>
                {memberModal.action !== 'kick' && (
                  <View style={styles.confirmBadge}>
                    <Text style={styles.confirmBadgeText}>{memberModal.reason}</Text>
                  </View>
                )}
                {memberModal.action !== 'kick' && (
                  <Text style={styles.confirmNote}>
                    Our team will review this and take action if guidelines are violated.
                  </Text>
                )}
                <TouchableOpacity style={styles.submitBtnDestructive} activeOpacity={0.85} onPress={submitMemberAction}>
                  <Text style={styles.submitBtnText}>
                    {memberModal.action === 'kick' ? 'Kick Member'
                      : memberModal.action === 'report' ? 'Submit Report'
                      : 'Kick & Report'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.75}
                  onPress={() => setMemberModal(s => ({ ...s, visible: false }))}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ height: insets.bottom + 16 }} />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: '#0F0F13' },
  container:     { flex: 1, backgroundColor: 'transparent' },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F13' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,15,19,0.6)',
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1A1A24', borderWidth: 1, borderColor: '#2E2E40',
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle:  { fontSize: 16, fontFamily: 'Nunito_700Bold', color: '#F0F0FA' },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  headerSubtitle: { fontSize: 12, color: '#5A5A78' },
  headerRight:  { width: 40 },
  chatArea:     { flex: 1, overflow: 'hidden' },
  messageFlatList: { flex: 1 },
  messageList:  { padding: 16, paddingBottom: 20 },
  emptyChat:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyChatText:{ color: '#5A5A78', fontSize: 14, fontFamily: 'Nunito_600SemiBold' },
  messageRow:   { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  ownRow:       { justifyContent: 'flex-end' },
  otherRow:     { justifyContent: 'flex-start' },
  avatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#222230', justifyContent: 'center', alignItems: 'center',
    marginRight: 8, borderWidth: 1, borderColor: '#2E2E40', overflow: 'hidden',
  },
  avatarText:   { fontSize: 13, fontFamily: 'Nunito_700Bold', color: '#7878A0' },
  messageBubble:{ maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  mediaBubble:  { padding: 5 },
  ownBubble:    { backgroundColor: '#FF6B00', borderBottomRightRadius: 6 },
  otherBubble:  { backgroundColor: '#1A1A24', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: '#2E2E40' },
  senderName:   { fontSize: 11, fontFamily: 'Nunito_700Bold', color: '#FF8A3D', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  senderNameOnMedia: { marginLeft: 6, marginTop: 4 },
  messageText:  { fontSize: 15, fontFamily: 'Nunito_400Regular', color: '#F0F0FA', lineHeight: 21 },
  ownMessageText: { color: '#fff' },
  timestamp:    { fontSize: 10, fontFamily: 'Nunito_400Regular', color: '#7878A0', textAlign: 'right', marginTop: 4 },
  ownTimestamp: { color: 'rgba(255,255,255,0.6)' },
  inputContainer: {
    flexDirection: 'row', padding: 12, borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0F0F13',
    alignItems: 'flex-end', gap: 8,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#2E2E40', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    maxHeight: 100, backgroundColor: '#1A1A24', color: '#F0F0FA',
  },
  sendButton: {
    backgroundColor: '#FF6B00', borderRadius: 22, width: 44, height: 44,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  attachButton: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' },
  gifButton: {
    height: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#2E2E40', borderRadius: 10,
  },
  gifButtonText: { fontSize: 12, fontFamily: 'Nunito_800ExtraBold', color: '#FF6B00', letterSpacing: 0.5 },
  disabledButton: { opacity: 0.4 },

  // Members sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#16161E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%',
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: '#3D3D5C', borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 17, fontFamily: 'Nunito_800ExtraBold', color: '#F0F0FA', marginBottom: 16 },
  memberRow:        { flexDirection: 'row', alignItems: 'center' },
  memberRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  memberMoreBtn:    { paddingHorizontal: 8, paddingVertical: 12 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  memberAvatarFallback: { backgroundColor: '#1E1E28', alignItems: 'center', justifyContent: 'center' },
  memberInfo:   { flex: 1 },
  memberName:   { fontSize: 15, fontFamily: 'Nunito_700Bold', color: '#F0F0FA', marginBottom: 2 },
  memberUsername: { fontSize: 13, color: '#7878A0' },
  memberSeparator: { height: 1, backgroundColor: '#1E1E28', marginLeft: 56 },

  // Moderation modals
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  modalBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1E1E28', alignItems: 'center', justifyContent: 'center',
  },
  modalTitle:    { fontSize: 17, fontFamily: 'Nunito_800ExtraBold', color: '#F0F0FA' },
  modalSubtitle: { fontSize: 14, color: '#7878A0', marginBottom: 16, lineHeight: 20 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1E1E28',
  },
  destructiveRow: {},
  reasonText:      { flex: 1, fontSize: 15, color: '#F0F0FA', fontFamily: 'Nunito_600SemiBold' },
  destructiveText: { color: '#FF4D4D' },
  confirmBadge: {
    backgroundColor: '#1A1A24', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 14, borderWidth: 1, borderColor: '#2E2E40', alignSelf: 'flex-start',
  },
  confirmBadgeText: { fontSize: 14, color: '#FF8A3D', fontFamily: 'Nunito_600SemiBold' },
  confirmNote:  { fontSize: 13, color: '#5A5A78', lineHeight: 19, marginBottom: 20 },
  submitBtn: {
    backgroundColor: '#FF6B00', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginBottom: 10,
    shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  submitBtnDestructive: {
    backgroundColor: '#2A0F0F', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#FF4D4D',
  },
  submitBtnText: { fontSize: 16, fontFamily: 'Nunito_700Bold', color: '#fff' },
  cancelBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#1A1A24', borderWidth: 1, borderColor: '#2E2E40', marginTop: 2,
  },
  cancelBtnText: { fontSize: 15, fontFamily: 'Nunito_600SemiBold', color: '#7878A0' },
});
