import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
// App logo + name + tagline shared with signup screen
import AuthBrandHeader from "@/components/AuthBrandHeader";
// Dark input row with icon; used for email and password fields
import AuthInputField from "@/components/AuthInputField";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setIsLoading(true);
    try {
      await signIn(email, password);
      router.push("/(tabs)");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
      <View style={styles.content}>
        {/* Eventify logo, app name, tagline */}
        <AuthBrandHeader accentColor="#FF6B00" tagline="Discover events around you" />

        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          <View style={styles.form}>
            {/* Email field */}
            <AuthInputField
              icon="mail-outline"
              placeholder="Email"
              keyboardType="email-address"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            {/* Password field with show/hide toggle */}
            <AuthInputField
              icon="lock-closed-outline"
              placeholder="Password"
              autoComplete="password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              rightElement={
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeIcon}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#5A5A78" />
                </TouchableOpacity>
              }
            />

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size={24} color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push("/(auth)/signup")}
            >
              <Text style={styles.linkButtonText}>
                Don't have an account?{" "}
                <Text style={styles.linkButtonTextBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </View>
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
  card: {
    backgroundColor: "#1A1A24",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#2E2E40",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
    color: "#F0F0FA",
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    color: "#7878A0",
  },
  form: {
    width: "100%",
  },
  eyeIcon: {
    padding: 4,
  },
  button: {
    backgroundColor: "#FF6B00",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  linkButton: {
    marginTop: 20,
    alignItems: "center",
  },
  linkButtonText: {
    color: "#7878A0",
    fontSize: 14,
  },
  linkButtonTextBold: {
    fontWeight: "700",
    color: "#FF6B00",
  },
});
