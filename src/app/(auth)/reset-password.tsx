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

function friendlyResetError(message: string): string {
  if (message.includes("different from the old password"))
    return "Your new password must be different from your current one.";
  if (message.includes("weak"))
    return "Password is too weak. Please choose a stronger one.";
  return "Something went wrong. Please try again.";
}

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { updatePassword, clearPasswordReset } = useAuth();
  const router = useRouter();

  const strength = passwordStrength(password);

  const handleReset = async () => {
    if (!password) {
      Alert.alert("Required", "Please enter a new password.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert("Too short", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Please make sure both passwords are the same.");
      return;
    }
    setIsLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (error: any) {
      Alert.alert("Reset Failed", friendlyResetError(error?.message ?? ""));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToApp = () => {
    clearPasswordReset();
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {done ? (
            /* ── Success state ── */
            <View style={styles.card}>
              <View style={styles.iconWrapper}>
                <Ionicons name="checkmark-circle-outline" size={40} color="#22C55E" />
              </View>
              <Text style={styles.title}>Password Updated</Text>
              <Text style={styles.body}>
                Your password has been changed successfully. You're all set.
              </Text>
              <TouchableOpacity style={[styles.button, styles.buttonGreen]} onPress={handleGoToApp}>
                <Text style={styles.buttonText}>Continue to App</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Reset form ── */
            <View style={styles.card}>
              <View style={styles.iconWrapper}>
                <Ionicons name="key-outline" size={40} color="#FF6B00" />
              </View>
              <Text style={styles.title}>Create new password</Text>
              <Text style={styles.body}>
                Your new password must be at least {MIN_PASSWORD_LENGTH} characters.
              </Text>

              <AuthInputField
                icon="lock-closed-outline"
                placeholder="New password"
                autoComplete="new-password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                rightElement={
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eye}
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
                placeholder="Confirm new password"
                autoComplete="new-password"
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                rightElement={
                  <TouchableOpacity
                    onPress={() => setShowConfirm((v) => !v)}
                    style={styles.eye}
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
                onPress={handleReset}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size={24} color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Set New Password</Text>
                )}
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
  eye: { padding: 4 },
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
  buttonGreen: {
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Nunito_800ExtraBold",
    letterSpacing: 0.3,
  },
});
