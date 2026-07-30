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
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../../lib/supabase/client';
import { useAuth } from '../../../../context/AuthContext';
import { uploadChatMedia } from '../../../../lib/supabase/storage';
import MediaBubble, { type MediaType } from '../../../../components/MediaBubble';
import GifPicker from '../../../../components/GifPicker';
import FullScreenImageViewer from '../../../../components/FullScreenImageViewer';

interface DmMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  media_url?: string | null;
  media_type?: MediaType | null;
}

interface Participant {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string | null;
}

// Canonical ordering: smaller UUID is always user1_id
function orderedIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export default function DmScreen() {
  const { userId: theirId } = useLocalSearchParams<{ userId: string }>();
  const { user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [chatId, setChatId]       = useState<string | null>(null);
  const [messages, setMessages]   = useState<DmMessage[]>([]);
  const [other, setOther]         = useState<Participant | null>(null);
  const [myself, setMyself]       = useState<Participant | null>(null);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Members sheet
  const [showMembers, setShowMembers] = useState(false);

  // Moderation modals
  const [reportMsgModal, setReportMsgModal] = useState<{
    visible: boolean; step: 'reasons' | 'confirm'; message: DmMessage | null; reason: string;
  }>({ visible: false, step: 'reasons', message: null, reason: '' });

  const [reportUserModal, setReportUserModal] = useState<{
    visible: boolean; step: 'reasons' | 'confirm'; reason: string;
  }>({ visible: false, step: 'reasons', reason: '' });

  const listRef = useRef<FlatList<DmMessage>>(null);

  useEffect(() => {
    if (!me || !theirId) return;
    init();
  }, [me?.id, theirId]);

  // Realtime subscription
  useEffect(() => {
    if (!chatId) return;
    const channel = supabase
      .channel(`dm-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as DmMessage];
          });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  async function init() {
    setLoading(true);

    // Load both participants' profiles in parallel
    const [{ data: otherProfile }, { data: myProfile }] = await Promise.all([
      supabase.from('profiles').select('id, name, username, profile_image_url').eq('id', theirId).single(),
      supabase.from('profiles').select('id, name, username, profile_image_url').eq('id', me!.id).single(),
    ]);

    setOther(otherProfile ?? null);
    setMyself(myProfile ?? null);

    // Find or create the direct_chat row
    const [u1, u2] = orderedIds(me!.id, theirId);

    let resolvedChatId: string;
    const { data: existing } = await supabase
      .from('direct_chats')
      .select('id')
      .eq('user1_id', u1)
      .eq('user2_id', u2)
      .maybeSingle();

    if (existing?.id) {
      resolvedChatId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from('direct_chats')
        .insert({ user1_id: u1, user2_id: u2 })
        .select('id')
        .single();
      if (error || !created) { setLoading(false); return; }
      resolvedChatId = created.id;
    }

    setChatId(resolvedChatId);

    // Load message history
    const { data: msgs } = await supabase
      .from('direct_messages')
      .select('id, chat_id, sender_id, content, media_url, media_type, created_at')
      .eq('chat_id', resolvedChatId)
      .order('created_at', { ascending: true });

    setMessages(msgs ?? []);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
  }

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || !chatId || !me || sending) return;
    setSending(true);
    setText('');
    await supabase.from('direct_messages').insert({
      chat_id:   chatId,
      sender_id: me.id,
      content:   trimmed,
    });
    setSending(false);
  }

  async function sendMediaMessage(mediaUrl: string, mediaType: MediaType) {
    if (!chatId || !me) return;
    await supabase.from('direct_messages').insert({
      chat_id: chatId, sender_id: me.id, content: '', media_url: mediaUrl, media_type: mediaType,
    });
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
    if (result.canceled || !result.assets?.[0] || !me) return;
    setUploadingMedia(true);
    try {
      const { url, mediaType } = await uploadChatMedia(me.id, result.assets[0].uri);
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

  function handleReportDmMessage(message: DmMessage) {
    setReportMsgModal({ visible: true, step: 'reasons', message, reason: '' });
  }

  async function submitDmReport() {
    if (!me || !reportMsgModal.message) return;
    await supabase.from('message_reports').insert({
      reporter_id: me.id,
      message_id:  reportMsgModal.message.id,
      context:     'dm',
      reason:      reportMsgModal.reason,
    });
    setReportMsgModal({ visible: false, step: 'reasons', message: null, reason: '' });
  }

  function handleReportUser() {
    setShowMembers(false);
    setTimeout(() => setReportUserModal({ visible: true, step: 'reasons', reason: '' }), 300);
  }

  async function submitUserDmReport() {
    if (!me) return;
    await supabase.from('user_reports').insert({
      reporter_id: me.id,
      reported_id: theirId,
      reason:      reportUserModal.reason,
    });
    setReportUserModal({ visible: false, step: 'reasons', reason: '' });
  }

  function goToProfile(userId: string) {
    setShowMembers(false);
    setTimeout(() => router.push({ pathname: '/(tabs)/user-profile', params: { userId } }), 200);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderMessage({ item, index }: { item: DmMessage; index: number }) {
    const isMe = item.sender_id === me?.id;
    const prev = messages[index - 1];
    const showTimestamp =
      !prev || new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
    const senderProfile = isMe ? myself : other;

    return (
      <View>
        {showTimestamp && <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>}
        <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
          {!isMe && (
            <TouchableOpacity onPress={() => goToProfile(theirId)} activeOpacity={0.7}>
              {senderProfile?.profile_image_url ? (
                <Image source={{ uri: senderProfile.profile_image_url }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={14} color="#4A4A6A" />
                </View>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.bubble,
              isMe ? styles.bubbleMe : styles.bubbleThem,
              item.media_type ? styles.mediaBubble : null,
            ]}
            activeOpacity={0.9}
            onLongPress={!isMe ? () => handleReportDmMessage(item) : undefined}
            delayLongPress={500}
          >
            {item.media_url && item.media_type ? (
              <MediaBubble url={item.media_url} type={item.media_type} onPressImage={(u) => setFullScreenImage(u)} />
            ) : null}
            {item.content ? (
              <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem, item.media_type ? { marginTop: 6 } : null]}>
                {item.content}
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderParticipant(participant: Participant, isCurrentUser: boolean) {
    return (
      <TouchableOpacity
        key={participant.id}
        style={styles.memberRow}
        activeOpacity={isCurrentUser ? 1 : 0.75}
        onPress={() => !isCurrentUser && goToProfile(participant.id)}
      >
        {participant.profile_image_url ? (
          <Image source={{ uri: participant.profile_image_url }} style={styles.memberAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
            <Ionicons name="person" size={18} color="#4A4A6A" />
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{participant.name}{isCurrentUser ? ' (You)' : ''}</Text>
          <Text style={styles.memberUsername}>@{participant.username}</Text>
        </View>
        {!isCurrentUser && <Ionicons name="chevron-forward" size={16} color="#5A5A78" />}
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color="#FF6B00" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const participants: { p: Participant; isMe: boolean }[] = [
    ...(myself ? [{ p: myself, isMe: true }] : []),
    ...(other  ? [{ p: other,  isMe: false }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#F0F0FA" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerCenter} onPress={() => setShowMembers(true)} activeOpacity={0.7}>
          {other?.profile_image_url ? (
            <Image source={{ uri: other.profile_image_url }} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.headerAvatar, styles.avatarFallback]}>
              <Ionicons name="person" size={16} color="#4A4A6A" />
            </View>
          )}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.headerName}>{other?.name ?? 'User'}</Text>
              <Ionicons name="chevron-down" size={12} color="#5A5A78" />
            </View>
            <Text style={styles.headerUsername}>@{other?.username ?? ''}</Text>
          </View>
        </TouchableOpacity>

        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubbles-outline" size={40} color="#3D3D5C" />
              <Text style={styles.emptyText}>Start the conversation</Text>
            </View>
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={styles.attachButton} onPress={pickAndSendMedia} disabled={uploadingMedia || !chatId}>
            {uploadingMedia
              ? <ActivityIndicator size="small" color="#FF6B00" />
              : <Ionicons name="add-circle-outline" size={26} color="#FF6B00" />
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.gifButton} onPress={() => setGifPickerVisible(true)} disabled={!chatId}>
            <Text style={styles.gifButtonText}>GIF</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor="#5A5A78"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
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
            <Text style={styles.sheetTitle}>Members (2)</Text>

            <View style={styles.memberSeparator} />
            {participants.map(({ p, isMe }) => (
              <View key={p.id}>
                {renderParticipant(p, isMe)}
                <View style={styles.memberSeparator} />
              </View>
            ))}

            {other && (
              <TouchableOpacity
                onPress={() => { setShowMembers(false); setTimeout(handleReportUser, 300); }}
                style={styles.reportUserBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="flag-outline" size={16} color="#E05A5A" />
                <Text style={styles.reportUserText}>Report {other.name}</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: insets.bottom + 16 }} />
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
                <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85} onPress={submitDmReport}>
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

      {/* Report User Modal */}
      <Modal visible={reportUserModal.visible} transparent animationType="slide"
        onRequestClose={() => setReportUserModal(s => ({ ...s, visible: false }))}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill}
            onPress={() => setReportUserModal(s => ({ ...s, visible: false }))} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn}
                onPress={() =>
                  reportUserModal.step === 'confirm'
                    ? setReportUserModal(s => ({ ...s, step: 'reasons' }))
                    : setReportUserModal(s => ({ ...s, visible: false }))}>
                <Ionicons name={reportUserModal.step === 'confirm' ? 'chevron-back' : 'close'} size={20} color="#F0F0FA" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {reportUserModal.step === 'reasons' ? `Report ${other?.name ?? 'User'}` : 'Confirm Report'}
              </Text>
              <View style={{ width: 36 }} />
            </View>

            {reportUserModal.step === 'reasons' ? (
              <View>
                <Text style={styles.modalSubtitle}>Why are you reporting this user?</Text>
                {['Harassment', 'Spam', 'Inappropriate behavior', 'Other'].map(r => (
                  <TouchableOpacity key={r} style={styles.reasonRow} activeOpacity={0.75}
                    onPress={() => setReportUserModal(s => ({ ...s, reason: r, step: 'confirm' }))}>
                    <Text style={styles.reasonText}>{r}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#5A5A78" />
                  </TouchableOpacity>
                ))}
                <View style={{ height: insets.bottom + 16 }} />
              </View>
            ) : (
              <View>
                <Text style={styles.modalSubtitle}>You are reporting {other?.name} for:</Text>
                <View style={styles.confirmBadge}>
                  <Text style={styles.confirmBadgeText}>{reportUserModal.reason}</Text>
                </View>
                <Text style={styles.confirmNote}>
                  Our team will review this and take action if guidelines are violated.
                </Text>
                <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85} onPress={submitUserDmReport}>
                  <Text style={styles.submitBtnText}>Submit Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.75}
                  onPress={() => setReportUserModal(s => ({ ...s, visible: false }))}>
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
  safe: { flex: 1, backgroundColor: '#0F0F13' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1A1A24',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E1E28',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerName:   { fontSize: 15, fontFamily: 'Nunito_700Bold', color: '#F0F0FA' },
  headerUsername: { fontSize: 12, color: '#7878A0', fontFamily: 'Nunito_600SemiBold' },
  messageList: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, flexGrow: 1 },
  timestamp:   { fontSize: 11, fontFamily: 'Nunito_600SemiBold', color: '#5A5A78', textAlign: 'center', marginVertical: 10 },
  bubbleRow:   { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6, gap: 8 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowThem: { justifyContent: 'flex-start' },
  avatar:      { width: 28, height: 28, borderRadius: 14, flexShrink: 0, overflow: 'hidden' },
  avatarFallback: { backgroundColor: '#1E1E28', alignItems: 'center', justifyContent: 'center' },
  bubble:      { maxWidth: '75%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  mediaBubble: { padding: 5 },
  bubbleMe:    { backgroundColor: '#FF6B00', borderBottomRightRadius: 6 },
  bubbleThem:  { backgroundColor: '#1E1E28', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: '#2E2E40' },
  bubbleText:  { fontSize: 15, fontFamily: 'Nunito_400Regular', lineHeight: 21 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: '#F0F0FA' },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText:   { fontSize: 14, color: '#5A5A78', fontFamily: 'Nunito_600SemiBold' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: '#1A1A24', backgroundColor: '#0F0F13',
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: '#1E1E28',
    borderRadius: 21, paddingHorizontal: 16, paddingVertical: 10,
    color: '#F0F0FA', fontSize: 15, fontFamily: 'Nunito_600SemiBold',
    borderWidth: 1, borderColor: '#2E2E40',
  },
  sendBtn:        { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FF6B00', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  attachButton: { width: 38, height: 42, justifyContent: 'center', alignItems: 'center' },
  gifButton: {
    height: 42, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#2E2E40', borderRadius: 10,
  },
  gifButtonText: { fontSize: 12, fontFamily: 'Nunito_800ExtraBold', color: '#FF6B00', letterSpacing: 0.5 },

  // Members sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#16161E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: '#3D3D5C', borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 17, fontFamily: 'Nunito_800ExtraBold', color: '#F0F0FA', marginBottom: 12 },
  memberRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, flexShrink: 0, overflow: 'hidden' },
  memberAvatarFallback: { backgroundColor: '#1E1E28', alignItems: 'center', justifyContent: 'center' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: 'Nunito_700Bold', color: '#F0F0FA', marginBottom: 2 },
  memberUsername: { fontSize: 13, color: '#7878A0' },
  memberSeparator: { height: 1, backgroundColor: '#1E1E28', marginLeft: 56 },
  reportUserBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 16, marginTop: 4,
    borderTopWidth: 1, borderTopColor: '#1E1E28',
  },
  reportUserText: { fontSize: 15, fontFamily: 'Nunito_600SemiBold', color: '#E05A5A' },

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
  reasonText:       { flex: 1, fontSize: 15, color: '#F0F0FA', fontFamily: 'Nunito_600SemiBold' },
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
  submitBtnText: { fontSize: 16, fontFamily: 'Nunito_700Bold', color: '#fff' },
  cancelBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#1A1A24', borderWidth: 1, borderColor: '#2E2E40', marginTop: 2,
  },
  cancelBtnText: { fontSize: 15, fontFamily: 'Nunito_600SemiBold', color: '#7878A0' },
});
