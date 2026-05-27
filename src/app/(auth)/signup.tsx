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
// App logo + name + tagline shared with login screen
import AuthBrandHeader from "@/components/AuthBrandHeader";
// Dark input row with icon; used for email and password fields
import AuthInputField from "@/components/AuthInputField";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password.length < 3) {
      Alert.alert("Error", "Password must be at least 3 characters");
      return;
    }
    setIsLoading(true);
    try {
      await signUp(email, password);
      router.push("/(auth)/onboarding");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to sign up. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color="#F0F0FA" />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Eventify logo, app name, tagline */}
        <AuthBrandHeader accentColor="#7C3AED" tagline="Join the community" />

        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>

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
              onPress={handleSignUp}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size={24} color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push("/(auth)/login")}
            >
              <Text style={styles.linkButtonText}>
                Already have an account?{" "}
                <Text style={styles.linkButtonTextBold}>Sign In</Text>
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
  backButton: {
    position: "absolute",
    top: 56,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1A1A24",
    borderWidth: 1,
    borderColor: "#2E2E40",
    justifyContent: "center",
    alignItems: "center",
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
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: "#7C3AED",
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
    color: "#7C3AED",
  },
});
