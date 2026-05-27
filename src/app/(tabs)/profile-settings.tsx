// Account settings screen — reached by tapping ⚙️ on the new Profile tab
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { uploadProfileImage } from "@/lib/supabase/storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
// Settings list row: colored icon box + label + chevron arrow
import SettingRow from "@/components/SettingRow";

export default function ProfileSettings() {
  const { user, updateUser, signOut } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();

  const handleUpdateProfileImage = async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "We need camera roll permissions to select a profile image.");
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

  const handleSignOut = async () => {
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

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#F97316" />
          <Text style={styles.backText}>Profile</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Settings</Text>

        {/* Avatar with camera-edit badge */}
        <View style={styles.profileSection}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={handleUpdateProfileImage}
            disabled={isUpdating}
          >
            {user?.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.profileImage} cachePolicy="none" />
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

        {/* Account settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <SettingRow icon="person-outline" label="Edit Profile" iconColor="#7C3AED" />
            <View style={styles.divider} />
            <SettingRow icon="notifications-outline" label="Notifications" iconColor="#FF6B00" />
            <View style={styles.divider} />
            <SettingRow icon="shield-checkmark-outline" label="Privacy" iconColor="#22C55E" />
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.sectionCard}>
            <SettingRow icon="help-circle-outline" label="Help & Support" iconColor="#3B82F6" />
            <View style={styles.divider} />
            <SettingRow icon="document-text-outline" label="Terms of Service" iconColor="#8B5CF6" />
            <View style={styles.divider} />
            <SettingRow icon="lock-closed-outline" label="Privacy Policy" iconColor="#EC4899" />
          </View>
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color="#F0F0FA" style={{ marginRight: 8 }} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* TODO: wire up account deletion flow before shipping */}
          <TouchableOpacity style={styles.deleteButton} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.deleteText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F13" },
  content: { padding: 20, paddingBottom: 40 },
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
