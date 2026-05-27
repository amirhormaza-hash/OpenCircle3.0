// app/(tabs)/messages/[eventId].tsx

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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { supabase } from '../../../lib/supabase/client';
import { useAuth } from '../../../context/AuthContext';

const CATEGORY_IMAGES: Record<string, ImageSourcePropType> = {
  sports: require('../../../../assets/images/sports.jpg'),
  party: require('../../../../assets/images/party.jpg'),
  food: require('../../../../assets/images/food.jpg'),
  study: require('../../../../assets/images/study.jpg'),
  ride: require('../../../../assets/images/ride.jpg'),
  zen: require('../../../../assets/images/zen.jpg'),
  networking: require('../../../../assets/images/study.jpg'),
  outdoors: require('../../../../assets/images/sports.jpg'),
  other: require('../../../../assets/images/party.jpg'),
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
  profile?: {
    name: string;
    profile_image_url?: string;
  };
}

export default function EventChatScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string>('Event Chat');
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [categoryBg, setCategoryBg] = useState<ImageSourcePropType | null>(null);
  const insets = useSafeAreaInsets();

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadChat = async () => {
      if (!eventId) { setLoading(false); return; }
      if (!user) { setLoading(false); return; }

      try {
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

        // Fetch event name + owner for header
        const { data: eventData } = await supabase
          .from('event')
          .select('name, category, profile_id')
          .eq('id', eventId)
          .single();
        if (eventData?.name) setEventName(eventData.name);
        if (eventData?.category) {
          const img = CATEGORY_IMAGES[eventData.category.trim().toLowerCase()];
          if (img) setCategoryBg(img);
        }
        if (eventData?.profile_id) {
          const { data: ownerData } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', eventData.profile_id)
            .single();
          if (ownerData?.username) setOwnerUsername(ownerData.username);
        }

        const { data: chatRow, error: chatError } = await supabase
          .from('event_chats')
          .select('id')
          .eq('event_id', eventId)
          .single();

        if (chatError || !chatRow) {
          setMessages([]);
          setLoading(false);
          Alert.alert('Error', 'No chat exists for this event yet.');
          return;
        }

        setChatId(chatRow.id);

        const { data, error } = await supabase
          .from('chat_messages')
          .select(`
            id,
            chat_id,
            messages,
            user_id,
            created_at,
            profile:profiles!user_id (name, profile_image_url)
          `)
          .eq('chat_id', chatRow.id)
          .order('created_at', { ascending: true });

        if (error) {
          setMessages([]);
        } else {
          setMessages(data || []);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
        }

        unsubscribe = subscribeToMessages(chatRow.id);
      } catch (error) {
        console.error('Unexpected loadChat error:', error);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };

    loadChat();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [eventId, user]);

  function subscribeToMessages(currentChatId: string) {
    const channel = supabase
      .channel(`chat_messages:chat_id=eq.${currentChatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${currentChatId}` },
        (payload) => { fetchNewMessage(payload.new.id); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async function fetchNewMessage(messageId: string) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`
        id,
        chat_id,
        messages,
        user_id,
        created_at,
        profile:profiles!user_id (name, profile_image_url)
      `)
      .eq('id', messageId)
      .single();

    if (!error && data) {
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === data.id)) return prev;
        return [...prev, data];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !user || !eventId || !chatId) return;
    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        chat_id: chatId,
        user_id: user.id,
        messages: newMessage.trim(),
      });
      if (error) {
        Alert.alert('Error', 'Could not send message.');
      } else {
        setNewMessage('');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.user_id === user?.id;
    const profileName = item.profile?.name || 'User';
    const initials = profileName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

    return (
      <View style={[styles.messageRow, isOwn ? styles.ownRow : styles.otherRow]}>
        {!isOwn && (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}

        <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
          {!isOwn && <Text style={styles.senderName}>{profileName}</Text>}
          <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>
            {item.messages}
          </Text>
          <Text style={[styles.timestamp, isOwn && styles.ownTimestamp]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF6B00" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {categoryBg && <TiledBackground source={categoryBg} />}
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#F0F0FA" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{eventName}</Text>
          <Text style={styles.headerSubtitle}>
            {ownerUsername ? `by @${ownerUsername} · Group Chat` : 'Group Chat'}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
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

        <View style={styles.inputContainer}>
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
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { height: Math.max(insets.bottom, 20) }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F13',
  },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F0F0FA',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#5A5A78',
    marginTop: 1,
  },
  headerRight: {
    width: 40,
  },
  messageList: {
    padding: 16,
    paddingBottom: 20,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyChatText: {
    color: '#5A5A78',
    fontSize: 14,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  ownRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
    justifyContent: 'flex-start',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#222230',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2E2E40',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7878A0',
  },
  messageBubble: {
    maxWidth: '78%',
    padding: 12,
    borderRadius: 18,
  },
  ownBubble: {
    backgroundColor: '#FF6B00',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#1A1A24',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2E2E40',
  },
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A78BFA',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  messageText: {
    fontSize: 15,
    color: '#F0F0FA',
    lineHeight: 21,
  },
  ownMessageText: {
    color: '#fff',
  },
  timestamp: {
    fontSize: 10,
    color: '#7878A0',
    textAlign: 'right',
    marginTop: 4,
  },
  ownTimestamp: {
    color: 'rgba(255,255,255,0.6)',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#000',
    alignItems: 'flex-end',
    gap: 8,
  },
  bottomBar: {
    backgroundColor: '#000',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    backgroundColor: '#1A1A24',
    color: '#F0F0FA',
  },
  sendButton: {
    backgroundColor: '#FF6B00',
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.4,
  },
});
