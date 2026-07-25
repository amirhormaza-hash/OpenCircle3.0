import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { supabase } from "@/lib/supabase/client";
import { uploadProfileImage } from "@/lib/supabase/storage";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function OnboardingScreen() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const { user, updateUser } = useAuth();
  const router = useRouter();

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need camera roll permissions to select a profile image.",
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
      setProfileImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need camera permissions to take a photo.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const showImagePicker = () => {
    Alert.alert("Select Profile Image", "Choose an option", [
      { text: "Camera", onPress: takePhoto },
      { text: "Photo Library", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleComplete = async () => {
    if (!name || !username) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (username.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters");
      return;
    }

    setIsLoading(true);
    try {
      if (!user) {
        throw new Error("User not authenticated");
      }
      // Check if username exists
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .single();

      if (existingUser) {
        Alert.alert(
          "Error",
          "This username is already taken. Please choose another one.",
        );
        setIsLoading(false);
        return;
      }

      // Upload profile img
      let profileImageUrl: string | undefined;
      if (profileImage) {
        try {
          profileImageUrl = await uploadProfileImage(user.id, profileImage);
        } catch (error) {
          console.error("Error uploading profile image:", error);
          Alert.alert(
            "Warning",
            "Failed to upload profile image. Continuing without image.",
          );
        }
      }

      // Update profile
      await updateUser({
        name,
        username,
        profileImage: profileImageUrl,
        onboardingCompleted: true,
      });
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert(
        "Error",
        "Failed to complete the onboarding. Please try again.",
      );
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Guard: user hasn't settled in context yet (race between signUp + navigation)
  if (!user) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#FF6B00" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>
            Add your information to get started
          </Text>
        </View>

        <View style={styles.form}>
          <TouchableOpacity
            style={styles.imageContainer}
            onPress={showImagePicker}
          >
            {profileImage ? (
              <Image
                cachePolicy={"none"}
                source={{ uri: profileImage }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="person-outline" size={44} color="#5A5A78" />
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
              <Text style={styles.editText}>Edit</Text>
            </View>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#5A5A78"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#5A5A78"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
          />

          <TouchableOpacity style={styles.button} onPress={handleComplete}>
            {isLoading ? (
              <ActivityIndicator size={24} color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Complete Setup</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F13",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontFamily: "Nunito_900Black",
    letterSpacing: -0.5,
    marginBottom: 8,
    color: "#F0F0FA",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: "#7878A0",
  },
  form: {
    width: "100%",
    alignItems: "center",
  },
  imageContainer: {
    marginBottom: 32,
    position: "relative",
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1A1A24",
  },
  placeholderImage: {
    width: 120,
    height: 120,
    backgroundColor: "#1A1A24",
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2E2E40",
    borderStyle: "dashed",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: -4,
    backgroundColor: "#FF6B00",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  editText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Nunito_700Bold",
  },
  input: {
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#2E2E40",
    color: "#F0F0FA",
  },
  button: {
    backgroundColor: "#FF6B00",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    width: "100%",
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Nunito_800ExtraBold",
    letterSpacing: 0.3,
  },
});
