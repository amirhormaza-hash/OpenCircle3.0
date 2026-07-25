import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AuthInputField from "@/components/AuthInputField";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();
  const router = useRouter();

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(trimmed);
      setSent(true);
    } catch {
      // Don't reveal whether an account exists — always show success
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color="#F0F0FA" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {sent ? (
            /* ── Success state ── */
            <View style={styles.card}>
              <View style={styles.successIcon}>
                <Ionicons name="mail-open-outline" size={40} color="#FF6B00" />
              </View>
              <Text style={styles.title}>Check your inbox</Text>
              <Text style={styles.body}>
                If an account exists for{" "}
                <Text style={styles.highlight}>{email.trim().toLowerCase()}</Text>
                , you'll receive a password reset link shortly.
              </Text>
              <Text style={styles.hint}>
                Don't see it? Check your spam folder.
              </Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={styles.buttonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Request state ── */
            <View style={styles.card}>
              <View style={styles.iconWrapper}>
                <Ionicons name="lock-open-outline" size={40} color="#FF6B00" />
              </View>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.body}>
                Enter the email address linked to your account and we'll send
                you a link to reset your password.
              </Text>

              <AuthInputField
                icon="mail-outline"
                placeholder="Email"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size={24} color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => router.back()}
              >
                <Text style={styles.linkText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    padding: 28,
    borderWidth: 1,
    borderColor: "#2E2E40",
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0F0F13",
    borderWidth: 1,
    borderColor: "#2E2E40",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0F0F13",
    borderWidth: 1,
    borderColor: "#2E2E40",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: "Nunito_800ExtraBold",
    color: "#F0F0FA",
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: "#7878A0",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: "#5A5A78",
    textAlign: "center",
    marginBottom: 28,
  },
  highlight: {
    color: "#F0F0FA",
    fontFamily: "Nunito_700Bold",
  },
  button: {
    backgroundColor: "#FF6B00",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
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
    fontFamily: "Nunito_800ExtraBold",
    letterSpacing: 0.3,
  },
  linkButton: {
    marginTop: 20,
    alignItems: "center",
  },
  linkText: {
    color: "#7878A0",
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
  },
});
