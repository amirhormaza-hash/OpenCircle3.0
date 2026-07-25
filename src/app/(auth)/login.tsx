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
import AuthBrandHeader from "@/components/AuthBrandHeader";
import AuthInputField from "@/components/AuthInputField";

function friendlyLoginError(message: string): string {
  if (message.includes("Invalid login credentials"))
    return "Incorrect email or password. Please try again.";
  if (message.includes("Email not confirmed"))
    return "Please verify your email address first. Check your inbox for the confirmation link.";
  if (message.includes("Too many requests"))
    return "Too many sign-in attempts. Please wait a few minutes and try again.";
  return "Something went wrong. Please try again.";
}

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }
    setIsLoading(true);
    try {
      await signIn(trimmedEmail, password);
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Sign In Failed", friendlyLoginError(error?.message ?? ""));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.content}>
          <AuthBrandHeader accentColor="#FF6B00" tagline="Discover events around you" />

          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <View style={styles.form}>
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

              <AuthInputField
                icon="lock-closed-outline"
                placeholder="Password"
                autoComplete="current-password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                rightElement={
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#5A5A78"
                    />
                  </TouchableOpacity>
                }
              />

              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => router.push("/(auth)/forgot-password")}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

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
    fontFamily: "Nunito_800ExtraBold",
    marginBottom: 4,
    color: "#F0F0FA",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    marginBottom: 24,
    color: "#7878A0",
  },
  form: {
    width: "100%",
  },
  eyeIcon: {
    padding: 4,
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: 16,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 13,
    color: "#FF6B00",
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
  linkButtonText: {
    color: "#7878A0",
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
  },
  linkButtonTextBold: {
    fontFamily: "Nunito_800ExtraBold",
    color: "#FF6B00",
  },
});
