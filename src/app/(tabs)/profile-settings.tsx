import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { uploadProfileImage } from "@/lib/supabase/storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import SettingRow from "@/components/SettingRow";
import { supabase } from "@/lib/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const NOTIF_STORAGE_KEY = "opencircle:notifications_enabled";

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({
  visible,
  user,
  updateUser,
  onClose,
}: {
  visible: boolean;
  user: any;
  updateUser: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && user) {
      setName(user.name || "");
      setUsername(user.username || "");
      fetchExtras();
    }
  }, [visible]);

  async function fetchExtras() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("bio, location")
      .eq("id", user.id)
      .single();
    if (data) {
      setBio(data.bio || "");
      setLocation(data.location || "");
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Error", "Name cannot be empty.");
      return;
    }
    if (!username.trim() || username.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters.");
      return;
    }
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.trim())
        .neq("id", user.id)
        .maybeSingle();

      if (existing) {
        Alert.alert("Error", "That username is already taken.");
        setSaving(false);
        return;
      }

      await supabase
        .from("profiles")
        .update({ bio: bio.trim(), location: location.trim() })
        .eq("id", user.id);

      await updateUser({ name: name.trim(), username: username.trim() });
      onClose();
    } catch {
      Alert.alert("Error", "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={modal.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={modal.header}>
            <TouchableOpacity onPress={onClose} style={modal.headerBtn}>
              <Text style={modal.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={modal.headerTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} style={modal.headerBtn} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#FF6B00" />
              ) : (
                <Text style={modal.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={modal.center}>
              <ActivityIndicator size="large" color="#FF6B00" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={modal.scroll} keyboardShouldPersistTaps="handled">
              <View style={modal.fieldGroup}>
                <Text style={modal.fieldLabel}>NAME</Text>
                <TextInput
                  style={modal.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your full name"
                  placeholderTextColor="#5A5A78"
                  autoCapitalize="words"
                />
              </View>

              <View style={modal.fieldGroup}>
                <Text style={modal.fieldLabel}>USERNAME</Text>
                <View style={modal.inputRow}>
                  <Text style={modal.atSign}>@</Text>
                  <TextInput
                    style={[modal.input, { flex: 1, marginBottom: 0 }]}
                    value={username}
                    onChangeText={(t) =>
                      setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                    }
                    placeholder="username"
                    placeholderTextColor="#5A5A78"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={modal.fieldGroup}>
                <Text style={modal.fieldLabel}>BIO</Text>
                <TextInput
                  style={[modal.input, modal.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell people about yourself"
                  placeholderTextColor="#5A5A78"
                  multiline
                  numberOfLines={4}
                  maxLength={200}
                />
                <Text style={modal.charCount}>{bio.length}/200</Text>
              </View>

              <View style={modal.fieldGroup}>
                <Text style={modal.fieldLabel}>LOCATION</Text>
                <TextInput
                  style={modal.input}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City, State"
                  placeholderTextColor="#5A5A78"
                />
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Notifications Modal ───────────────────────────────────────────────────────

function ToggleRow({
  label,
  sub,
  value,
  onToggle,
  disabled = false,
}: {
  label: string;
  sub: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[modal.toggleRow, disabled && { opacity: 0.4 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={modal.toggleLabel}>{label}</Text>
        <Text style={modal.toggleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: "#2E2E40", true: "#FF6B00" }}
        thumbColor="#fff"
      />
    </View>
  );
}

function NotificationsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [eventReminders, setEventReminders] = useState(true);
  const [newMessages, setNewMessages] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) loadPrefs();
  }, [visible]);

  async function loadPrefs() {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(NOTIF_STORAGE_KEY);
      if (raw) {
        const prefs = JSON.parse(raw);
        setPushEnabled(prefs.pushEnabled ?? true);
        setEventReminders(prefs.eventReminders ?? true);
        setNewMessages(prefs.newMessages ?? true);
      }
    } catch {}
    setLoading(false);
  }

  async function savePrefs(updates: Record<string, boolean>) {
    try {
      const raw = await AsyncStorage.getItem(NOTIF_STORAGE_KEY);
      const prefs = raw ? JSON.parse(raw) : {};
      await AsyncStorage.setItem(
        NOTIF_STORAGE_KEY,
        JSON.stringify({ ...prefs, ...updates })
      );
    } catch {}
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={modal.container} edges={["top", "bottom"]}>
        <View style={modal.header}>
          <View style={modal.headerBtn} />
          <Text style={modal.headerTitle}>Notifications</Text>
          <TouchableOpacity onPress={onClose} style={modal.headerBtn}>
            <Text style={modal.saveText}>Done</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={modal.center}>
            <ActivityIndicator size="large" color="#FF6B00" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={modal.scroll}>
            <View style={modal.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color="#7878A0" />
              <Text style={modal.infoText}>
                Push notification delivery requires a development build or store release — not available in Expo Go.
              </Text>
            </View>

            <Text style={modal.sectionLabel}>General</Text>
            <View style={modal.card}>
              <ToggleRow
                label="Push Notifications"
                sub="Allow OpenCircle to send push notifications"
                value={pushEnabled}
                onToggle={(v) => {
                  setPushEnabled(v);
                  savePrefs({ pushEnabled: v });
                }}
              />
              <View style={modal.divider} />
              <ToggleRow
                label="Event Reminders"
                sub="Get notified before events you're attending"
                value={eventReminders}
                disabled={!pushEnabled}
                onToggle={(v) => {
                  setEventReminders(v);
                  savePrefs({ eventReminders: v });
                }}
              />
              <View style={modal.divider} />
              <ToggleRow
                label="New Messages"
                sub="Notifications for new group chat messages"
                value={newMessages}
                disabled={!pushEnabled}
                onToggle={(v) => {
                  setNewMessages(v);
                  savePrefs({ newMessages: v });
                }}
              />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Privacy Modal ─────────────────────────────────────────────────────────────

function PrivacyItem({
  icon,
  label,
  detail,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  detail: string;
}) {
  return (
    <View style={modal.privacyItem}>
      <Ionicons name={icon} size={18} color="#7878A0" style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={modal.toggleLabel}>{label}</Text>
        <Text style={modal.toggleSub}>{detail}</Text>
      </View>
    </View>
  );
}

function PrivacyModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={modal.container} edges={["top", "bottom"]}>
        <View style={modal.header}>
          <View style={modal.headerBtn} />
          <Text style={modal.headerTitle}>Privacy</Text>
          <TouchableOpacity onPress={onClose} style={modal.headerBtn}>
            <Text style={modal.saveText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modal.scroll}>
          <View style={[modal.infoBox, { borderColor: "#22C55E33", backgroundColor: "#22C55E0D" }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#22C55E" />
            <Text style={[modal.infoText, { color: "#22C55E" }]}>
              Your data is stored securely and never sold to third parties.
            </Text>
          </View>

          <Text style={modal.sectionLabel}>What Others Can See</Text>
          <View style={modal.card}>
            <PrivacyItem
              icon="person-outline"
              label="Profile"
              detail="Your name, username, and photo are visible to all OpenCircle users."
            />
            <View style={modal.divider} />
            <PrivacyItem
              icon="location-outline"
              label="Location"
              detail="Only used to show nearby events. Your exact location is never shared."
            />
            <View style={modal.divider} />
            <PrivacyItem
              icon="chatbubble-outline"
              label="Messages"
              detail="Group chat messages are visible to all attendees of that event."
            />
            <View style={modal.divider} />
            <PrivacyItem
              icon="star-outline"
              label="Ratings & Badges"
              detail="Your reputation score and badges are shown on your public profile."
            />
          </View>

          <Text style={modal.sectionLabel}>Controls</Text>
          <View style={modal.card}>
            <TouchableOpacity
              style={modal.linkRow}
              onPress={() =>
                Linking.openURL(
                  "mailto:support@opencircle.app?subject=Block%20User%20Request"
                )
              }
              activeOpacity={0.75}
            >
              <Ionicons name="ban-outline" size={18} color="#EF4444" />
              <Text style={[modal.linkRowText, { color: "#EF4444" }]}>
                Report or Block a User
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#3A3A55" />
            </TouchableOpacity>
            <View style={modal.divider} />
            <TouchableOpacity
              style={modal.linkRow}
              onPress={() =>
                Linking.openURL(
                  "mailto:support@opencircle.app?subject=Data%20Export%20Request"
                )
              }
              activeOpacity={0.75}
            >
              <Ionicons name="download-outline" size={18} color="#7878A0" />
              <Text style={modal.linkRowText}>Request My Data</Text>
              <Ionicons name="chevron-forward" size={14} color="#3A3A55" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Help & Support Modal ──────────────────────────────────────────────────────

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I join an event?",
    a: "Swipe right on an event card on the Home screen, or tap the event and press Join.",
  },
  {
    q: "Can I leave an event I joined?",
    a: "Yes — go to My List, tap the event, and press Leave Event.",
  },
  {
    q: "How is my reputation score calculated?",
    a: "Other attendees rate you after each event. Your score is a weighted average of your most recent ratings.",
  },
  {
    q: "How do I earn badges?",
    a: "Badges are awarded automatically when you hit milestones like attending 5 events or receiving consistently high ratings.",
  },
  {
    q: "What happens if I no-show an event?",
    a: "Repeated no-shows reduce your behavior score and can restrict your ability to join future events.",
  },
  {
    q: "How do I edit or delete an event I created?",
    a: "Go to My List, tap your event, and use the Edit or Delete button in the event details.",
  },
];

function HelpModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={modal.container} edges={["top", "bottom"]}>
        <View style={modal.header}>
          <View style={modal.headerBtn} />
          <Text style={modal.headerTitle}>Help & Support</Text>
          <TouchableOpacity onPress={onClose} style={modal.headerBtn}>
            <Text style={modal.saveText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modal.scroll}>
          <Text style={modal.sectionLabel}>Frequently Asked Questions</Text>
          <View style={modal.card}>
            {FAQS.map((faq, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={modal.divider} />}
                <TouchableOpacity
                  style={modal.faqRow}
                  onPress={() => setExpanded(expanded === i ? null : i)}
                  activeOpacity={0.75}
                >
                  <Text style={modal.faqQ}>{faq.q}</Text>
                  <Ionicons
                    name={expanded === i ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#5A5A78"
                  />
                </TouchableOpacity>
                {expanded === i && <Text style={modal.faqA}>{faq.a}</Text>}
              </React.Fragment>
            ))}
          </View>

          <Text style={modal.sectionLabel}>Contact Us</Text>
          <View style={modal.card}>
            <TouchableOpacity
              style={modal.linkRow}
              onPress={() => Linking.openURL("mailto:support@opencircle.app")}
              activeOpacity={0.75}
            >
              <Ionicons name="mail-outline" size={18} color="#3B82F6" />
              <Text style={modal.linkRowText}>support@opencircle.app</Text>
              <Ionicons name="chevron-forward" size={14} color="#3A3A55" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Shared modal styles ───────────────────────────────────────────────────────

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F13" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E1E2A",
  },
  headerBtn: { width: 70 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F0F0FA",
  },
  cancelText: { fontSize: 15, color: "#7878A0" },
  saveText: { fontSize: 15, fontWeight: "700", color: "#FF6B00", textAlign: "right" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 20, paddingBottom: 40 },
  fieldGroup: { marginBottom: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5A5A78",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#F0F0FA",
    borderWidth: 1,
    borderColor: "#2E2E40",
    marginBottom: 0,
  },
  textArea: { height: 100, textAlignVertical: "top" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E2E40",
    paddingLeft: 14,
  },
  atSign: { fontSize: 15, color: "#7878A0", marginRight: 2 },
  charCount: { fontSize: 11, color: "#5A5A78", textAlign: "right", marginTop: 6 },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2E2E40",
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 13, color: "#7878A0", lineHeight: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5A5A78",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: "#1A1A24",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2E2E40",
    overflow: "hidden",
    marginBottom: 24,
  },
  divider: { height: 1, backgroundColor: "#2E2E40", marginLeft: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  toggleLabel: { fontSize: 15, color: "#F0F0FA", fontWeight: "500", marginBottom: 2 },
  toggleSub: { fontSize: 12, color: "#5A5A78", lineHeight: 16 },
  privacyItem: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "flex-start",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkRowText: { flex: 1, fontSize: 15, color: "#F0F0FA", fontWeight: "500" },
  faqRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  faqQ: { flex: 1, fontSize: 15, color: "#F0F0FA", fontWeight: "500", paddingRight: 8 },
  faqA: {
    fontSize: 13,
    color: "#7878A0",
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProfileSettings() {
  const { user, updateUser, signOut } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const router = useRouter();

  const handleUpdateProfileImage = async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need camera roll permissions to select a profile image."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setIsUpdating(true);
      try {
        const imageUrl = await uploadProfileImage(user.id, result.assets[0].uri);
        await updateUser({ profileImage: imageUrl });
        Alert.alert("Success", "Profile image updated.");
      } catch {
        Alert.alert("Error", "Failed to update profile image. Please try again.");
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data — events, messages, ratings, and badges. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "Type-confirm: your account, profile, and all activity will be permanently removed.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      const { error } = await supabase.rpc("delete_user");
                      if (error) throw error;
                      await signOut();
                      router.replace("/(auth)/login");
                    } catch {
                      setDeletingAccount(false);
                      Alert.alert(
                        "Error",
                        "Could not delete your account right now. Please contact support@opencircle.app"
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <>
      <EditProfileModal
        visible={editProfileVisible}
        user={user}
        updateUser={updateUser}
        onClose={() => setEditProfileVisible(false)}
      />
      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
      />
      <PrivacyModal
        visible={privacyVisible}
        onClose={() => setPrivacyVisible(false)}
      />
      <HelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
      />

      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {deletingAccount && (
          <View style={styles.deletingOverlay}>
            <ActivityIndicator size="large" color="#FF6B00" />
            <Text style={styles.deletingText}>Deleting account…</Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#F97316" />
            <Text style={styles.backText}>Profile</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Settings</Text>

          {/* Avatar */}
          <View style={styles.profileSection}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={handleUpdateProfileImage}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
                  <ActivityIndicator size="small" color="#FF6B00" />
                </View>
              ) : user?.profileImage ? (
                <Image
                  source={{ uri: user.profileImage }}
                  style={styles.profileImage}
                  cachePolicy="none"
                />
              ) : (
                <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
                  <Text style={styles.profileImageText}>
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </Text>
                </View>
              )}
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={13} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.name}>{user?.name || "No Name"}</Text>
            <Text style={styles.username}>@{user?.username || "user"}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>

          {/* Account */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.sectionCard}>
              <SettingRow
                icon="person-outline"
                label="Edit Profile"
                iconColor="#FF6B00"
                onPress={() => setEditProfileVisible(true)}
              />
              <View style={styles.divider} />
              <SettingRow
                icon="notifications-outline"
                label="Notifications"
                iconColor="#FF6B00"
                onPress={() => setNotificationsVisible(true)}
              />
              <View style={styles.divider} />
              <SettingRow
                icon="shield-checkmark-outline"
                label="Privacy"
                iconColor="#22C55E"
                onPress={() => setPrivacyVisible(true)}
              />
            </View>
          </View>

          {/* About */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.sectionCard}>
              <SettingRow
                icon="help-circle-outline"
                label="Help & Support"
                iconColor="#3B82F6"
                onPress={() => setHelpVisible(true)}
              />
              <View style={styles.divider} />
              <SettingRow
                icon="document-text-outline"
                label="Terms of Service"
                iconColor="#8B5CF6"
                onPress={() => Linking.openURL("https://amirhormaza-hash.github.io/OpenCircle3.0/terms.html")}
              />
              <View style={styles.divider} />
              <SettingRow
                icon="lock-closed-outline"
                label="Privacy Policy"
                iconColor="#EC4899"
                onPress={() => Linking.openURL("https://amirhormaza-hash.github.io/OpenCircle3.0/privacy.html")}
              />
            </View>
          </View>

          {/* Danger zone */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <Ionicons
                name="log-out-outline"
                size={18}
                color="#F0F0FA"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteAccount}
              activeOpacity={0.8}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color="#EF4444"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.deleteText}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          {/* App version — expoConfig.version, plus native build number when present */}
          <Text style={styles.versionText}>
            OpenCircle v{Constants.expoConfig?.version ?? "1.0.0"}
            {Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ""}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F13" },
  content: { padding: 20, paddingBottom: 40 },
  versionText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: "#5A5A78",
    textAlign: "center",
    marginTop: 8,
  },
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,15,19,0.92)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99,
    gap: 16,
  },
  deletingText: { fontSize: 15, color: "#F0F0FA", fontWeight: "600" },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  backText: { fontSize: 16, fontWeight: "700", color: "#F97316" },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F0F0FA",
    marginBottom: 20,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: 28,
    paddingVertical: 28,
    backgroundColor: "#1A1A24",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2E2E40",
    marginTop: 4,
  },
  avatarWrapper: { position: "relative", marginBottom: 14 },
  profileImage: { width: 96, height: 96, borderRadius: 48 },
  profileImagePlaceholder: {
    backgroundColor: "#1A1030",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#3D2A6E",
  },
  profileImageText: { fontSize: 38, fontWeight: "700", color: "#FF6B00" },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#FF6B00",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1A1A24",
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  name: { fontSize: 22, fontWeight: "800", marginBottom: 4, color: "#F0F0FA" },
  username: { fontSize: 15, color: "#7878A0", marginBottom: 4 },
  email: { fontSize: 13, color: "#5A5A78" },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5A5A78",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingLeft: 4,
  },
  sectionCard: {
    backgroundColor: "#1A1A24",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2E2E40",
    overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: "#2E2E40", marginLeft: 60 },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A24",
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "#2E2E40",
    marginBottom: 10,
  },
  signOutText: { fontSize: 15, color: "#F0F0FA", fontWeight: "600" },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A24",
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "#3A1515",
  },
  deleteText: { fontSize: 15, color: "#EF4444", fontWeight: "600" },
});
