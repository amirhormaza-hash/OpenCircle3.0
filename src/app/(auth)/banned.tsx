// Shown instead of the app when the signed-in account is banned.
//
// A banned account can still authenticate — everything it might do is blocked
// by row-level security (migration 017), and it is routed here. That is
// deliberate: the account has 72 hours to appeal, and it cannot appeal if it
// cannot get in.
//
// When the window closes with no appeal, the account and all of its content
// are deleted permanently by purge_expired_bans().

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { submitAppeal } from "@/lib/moderationQueries";
import { formatRemaining } from "@/lib/banWindow";
import { SUPPORT_EMAIL } from "@/constants/legal";

const MIN_APPEAL_LENGTH = 10;

export default function BannedScreen() {
  const { user, banStatus, signOut, refreshBanStatus } = useAuth();
  const router = useRouter();

  const [appeal, setAppeal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<string | null>(
    formatRemaining(banStatus?.appealDeadline ?? null),
  );

  // Tick the countdown once a minute — second-by-second precision would be
  // noise on a 72-hour window.
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(formatRemaining(banStatus?.appealDeadline ?? null));
    }, 60_000);
    return () => clearInterval(id);
  }, [banStatus?.appealDeadline]);

  // If the ban is lifted while this screen is open, get out of the way.
  // Signing out also clears banStatus, so require a session to still exist —
  // otherwise this races handleSignOut and lands on the tabs with no user.
  useEffect(() => {
    if (user && banStatus === null) router.replace("/(tabs)");
  }, [user, banStatus, router]);

  const windowClosed = remaining === null;
  const status = banStatus?.appealStatus ?? "none";
  const alreadyAppealed = status === "pending" || status === "denied";

  async function handleSubmit() {
    const trimmed = appeal.trim();
    if (trimmed.length < MIN_APPEAL_LENGTH) {
      Alert.alert(
        "Tell us more",
        "Please explain why you think this decision was wrong, in a sentence or two.",
      );
      return;
    }

    setSubmitting(true);
    const { error } = await submitAppeal(trimmed);
    setSubmitting(false);

    if (error) {
      Alert.alert("Could not submit appeal", error);
      return;
    }

    await refreshBanStatus();
    Alert.alert(
      "Appeal submitted",
      "We will review your appeal and respond by email. Your account will not be deleted while the appeal is open.",
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="ban-outline" size={38} color="#EF4444" />
          </View>

          <Text style={styles.title}>Account suspended</Text>
          <Text style={styles.body}>
            Your account has been suspended for violating our community rules.
            You cannot post events, send messages, or take part in events while
            it is suspended.
          </Text>

          {!!banStatus?.reason && (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>REASON</Text>
              <Text style={styles.reasonText}>{banStatus.reason}</Text>
            </View>
          )}

          {/* Countdown */}
          <View style={[styles.card, windowClosed && styles.cardExpired]}>
            <Ionicons
              name={windowClosed ? "alert-circle-outline" : "time-outline"}
              size={18}
              color={windowClosed ? "#EF4444" : "#FF6B00"}
            />
            <View style={styles.cardCopy}>
              {windowClosed ? (
                <>
                  <Text style={styles.cardTitle}>Appeal window closed</Text>
                  <Text style={styles.cardText}>
                    The 72-hour window has passed. This account and all of its
                    content are scheduled for permanent deletion.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.cardTitle}>{remaining} left to appeal</Text>
                  <Text style={styles.cardText}>
                    If you do not appeal within 72 hours, this account and
                    everything on it is deleted permanently and cannot be
                    recovered.
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Appeal */}
          {status === "pending" ? (
            <View style={styles.noticeBox}>
              <Ionicons name="hourglass-outline" size={18} color="#EAB308" />
              <Text style={styles.noticeText}>
                Your appeal is under review. We will respond by email. Your
                account will not be deleted while the appeal is open.
              </Text>
            </View>
          ) : status === "denied" ? (
            <View style={styles.noticeBox}>
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={styles.noticeText}>
                Your appeal was reviewed and denied. This decision is final.
              </Text>
            </View>
          ) : windowClosed ? null : (
            <View style={styles.appealSection}>
              <Text style={styles.sectionLabel}>APPEAL THIS DECISION</Text>
              <Text style={styles.help}>
                If you believe this was a mistake, explain what happened. A
                person reviews every appeal.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Explain why this decision was wrong…"
                placeholderTextColor="#5A5A78"
                value={appeal}
                onChangeText={setAppeal}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />
              <Text style={styles.counter}>{appeal.length}/1000</Text>

              <TouchableOpacity
                style={[styles.button, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator size={20} color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Submit appeal</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.contact}>
            Questions? Contact us at {SUPPORT_EMAIL}
            {alreadyAppealed ? "" : " — appeals are handled in the app."}
          </Text>

          <TouchableOpacity style={styles.signOut} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#0F0F13" },
  scroll: { padding: 24, paddingBottom: 48 },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#1A1A24",
    borderWidth: 1,
    borderColor: "#EF444433",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
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
    lineHeight: 21,
    marginBottom: 22,
  },
  reasonBox: {
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E2E40",
    padding: 14,
    marginBottom: 16,
  },
  reasonLabel: {
    fontSize: 10.5,
    fontFamily: "Nunito_800ExtraBold",
    color: "#5A5A78",
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  reasonText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: "#C0C0D8",
    lineHeight: 20,
  },
  card: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF6B0033",
    padding: 14,
    marginBottom: 22,
  },
  cardExpired: { borderColor: "#EF444433" },
  cardCopy: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Nunito_800ExtraBold",
    color: "#F0F0FA",
    marginBottom: 4,
  },
  cardText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: "#7878A0",
    lineHeight: 19,
  },
  noticeBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E2E40",
    padding: 14,
    marginBottom: 22,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: "#9C9CBE",
    lineHeight: 19,
  },
  appealSection: { marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Nunito_800ExtraBold",
    color: "#5A5A78",
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  help: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: "#7878A0",
    lineHeight: 19,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#1A1A24",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E2E40",
    padding: 14,
    minHeight: 120,
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: "#F0F0FA",
  },
  counter: {
    fontSize: 11,
    color: "#5A5A78",
    textAlign: "right",
    marginTop: 6,
    marginBottom: 14,
    fontFamily: "Nunito_600SemiBold",
  },
  button: {
    backgroundColor: "#FF6B00",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Nunito_800ExtraBold",
    letterSpacing: 0.3,
  },
  contact: {
    fontSize: 12.5,
    fontFamily: "Nunito_600SemiBold",
    color: "#5A5A78",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 24,
  },
  signOut: { marginTop: 20, alignItems: "center", paddingVertical: 10 },
  signOutText: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: "#7878A0",
  },
});
