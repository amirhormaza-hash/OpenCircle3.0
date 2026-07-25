import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AuthBrandHeader from "@/components/AuthBrandHeader";
import AuthInputField from "@/components/AuthInputField";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function passwordStrength(pw: string): { label: string; color: string; width: `${number}%` } {
  if (pw.length === 0) return { label: "", color: "#2E2E40", width: "0%" };
  if (pw.length < MIN_PASSWORD_LENGTH) return { label: "Too short", color: "#EF4444", width: "25%" };
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const score = [hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (score === 0) return { label: "Weak", color: "#F97316", width: "40%" };
  if (score === 1) return { label: "Fair", color: "#EAB308", width: "60%" };
  if (score === 2) return { label: "Good", color: "#22C55E", width: "80%" };
  return { label: "Strong", color: "#16A34A", width: "100%" };
}

function friendlySignUpError(message: string): string {
  if (message.includes("User already registered") || message.includes("already been registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (message.includes("invalid") && message.includes("email"))
    return "Please enter a valid email address.";
  if (message.includes("Password"))
    return "Password doesn't meet the requirements.";
  return "Something went wrong. Please try again.";
}

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const router = useRouter();
  const { signUp } = useAuth();

  const strength = passwordStrength(password);

  const handleSignUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password || !confirmPassword) {
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert("Password too short", `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Please make sure both passwords are the same.");
      return;
    }

    setIsLoading(true);
    try {
      await signUp(trimmedEmail, password);
      router.replace("/(auth)/onboarding");
    } catch (error: any) {
      Alert.alert("Sign Up Failed", friendlySignUpError(error?.message ?? ""));
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthBrandHeader accentColor="#FF6B00" tagline="Join the community" />

          <View style={styles.card}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Sign up to get started</Text>

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
                autoComplete="new-password"
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

              {/* Password strength bar */}
              {password.length > 0 && (
                <View style={styles.strengthRow}>
                  <View style={styles.strengthTrack}>
                    <View
                      style={[
                        styles.strengthFill,
                        { width: strength.width, backgroundColor: strength.color },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strength.color }]}>
                    {strength.label}
                  </Text>
                </View>
              )}

              <AuthInputField
                icon="lock-closed-outline"
                placeholder="Confirm password"
                autoComplete="new-password"
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                rightElement={
                  <TouchableOpacity
                    onPress={() => setShowConfirm((v) => !v)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={showConfirm ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#5A5A78"
                    />
                  </TouchableOpacity>
                }
              />

              {confirmPassword.length > 0 && password !== confirmPassword && (
                <Text style={styles.mismatch}>Passwords don't match</Text>
              )}

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleSignUp}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size={24} color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
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
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingTop: 80,
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
  eyeIcon: { padding: 4 },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: -8,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  strengthTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#2E2E40",
    borderRadius: 2,
    overflow: "hidden",
  },
  strengthFill: {
    height: "100%",
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    minWidth: 44,
    textAlign: "right",
  },
  mismatch: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: -8,
    marginBottom: 12,
    paddingLeft: 2,
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
  buttonDisabled: { opacity: 0.7 },
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
