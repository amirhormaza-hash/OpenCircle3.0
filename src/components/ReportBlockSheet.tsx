// Used in: (tabs)/user-profile.tsx, (tabs)/messages/dm/[userId].tsx,
//          (tabs)/messages/[eventId].tsx, components/EventDetailsModal.tsx
//
// The single reporting and blocking surface for the whole app, built for
// App Store Guideline 1.2. Reporting and blocking share one sheet so every
// piece of user-generated content — an event, a message, a person — is one
// long-press or one tap away from being flagged or blocked.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  REPORT_REASONS,
  blockUser,
  reportEvent,
  reportMessage,
  reportUser,
} from '@/lib/moderationQueries';

export type ReportTarget =
  | {
      kind: 'user';
      id: string;
      name: string;
      eventId?: string;
      source?: string;
    }
  | {
      kind: 'message';
      id: string;
      context: 'event_chat' | 'dm';
      text?: string;
      authorId?: string;
      authorName?: string;
    }
  | {
      kind: 'event';
      id: string;
      name: string;
    };

type Props = {
  visible: boolean;
  target: ReportTarget | null;
  onClose: () => void;
  /** Fired after a successful block so the host screen can navigate away. */
  onBlocked?: (userId: string) => void;
  onReported?: () => void;
};

type Step = 'action' | 'reasons' | 'confirm';
type Intent = 'report' | 'block';

/** Who, if anyone, this target lets you block. */
function blockableFrom(target: ReportTarget | null): { id: string; name: string } | null {
  if (!target) return null;
  if (target.kind === 'user') return { id: target.id, name: target.name };
  if (target.kind === 'message' && target.authorId) {
    return { id: target.authorId, name: target.authorName ?? 'this user' };
  }
  return null;
}

function titleFor(target: ReportTarget | null): string {
  if (!target) return 'Report';
  if (target.kind === 'user') return target.name;
  if (target.kind === 'event') return target.name;
  return 'this message';
}

export default function ReportBlockSheet({
  visible,
  target,
  onClose,
  onBlocked,
  onReported,
}: Props) {
  const blockable = blockableFrom(target);

  const [step, setStep] = useState<Step>('action');
  const [intent, setIntent] = useState<Intent>('report');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset to the top of the flow each time the sheet is opened.
  useEffect(() => {
    if (visible) {
      setStep(blockable ? 'action' : 'reasons');
      setIntent('report');
      setReason('');
      setSubmitting(false);
    }
  }, [visible, blockable]);

  function goBack() {
    if (step === 'confirm') setStep('reasons');
    else if (step === 'reasons' && blockable) setStep('action');
    else onClose();
  }

  async function submit() {
    if (!target || submitting) return;
    setSubmitting(true);

    try {
      if (intent === 'block') {
        if (!blockable) return;
        const { error } = await blockUser(blockable.id, reason);
        if (error) {
          Alert.alert('Could not block', error);
          return;
        }
        onClose();
        onBlocked?.(blockable.id);
        Alert.alert(
          'User blocked',
          `${blockable.name} can no longer message you, send you friend requests, or see your content, and their events are hidden from your feed. Our team has been notified and will review this account within 24 hours.`,
        );
        return;
      }

      const { error } = await fileReport(target, reason);
      if (error) {
        Alert.alert('Could not send report', error);
        return;
      }
      onClose();
      onReported?.();
      Alert.alert(
        'Report received',
        'Thanks for letting us know. Our team reviews every report within 24 hours and removes content that breaks our rules.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const heading =
    step === 'confirm'
      ? intent === 'block'
        ? 'Confirm block'
        : 'Confirm report'
      : step === 'reasons'
        ? intent === 'block'
          ? `Block ${titleFor(target)}`
          : `Report ${titleFor(target)}`
        : titleFor(target);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Ionicons
                name={step === 'action' ? 'close' : 'chevron-back'}
                size={20}
                color="#F0F0FA"
              />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              {heading}
            </Text>
            <View style={styles.backBtn} />
          </View>

          {step === 'action' && blockable && (
            <View style={styles.body}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  setIntent('report');
                  setStep('reasons');
                }}
              >
                <Ionicons name="flag-outline" size={20} color="#FF8A3D" />
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>Report</Text>
                  <Text style={styles.actionSub}>
                    Flag this for review. We respond within 24 hours.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  setIntent('block');
                  setStep('reasons');
                }}
              >
                <Ionicons name="ban-outline" size={20} color="#E05A5A" />
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionTitle, styles.danger]}>
                    Block {blockable.name}
                  </Text>
                  <Text style={styles.actionSub}>
                    They can no longer contact you or see your content, and
                    their events leave your feed immediately.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {step === 'reasons' && (
            <View style={styles.body}>
              <Text style={styles.subtitle}>
                {intent === 'block'
                  ? 'Why are you blocking them? This is sent to our moderation team.'
                  : 'Why are you reporting this?'}
              </Text>

              <ScrollView style={styles.reasonList} bounces={false}>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={styles.reasonRow}
                    onPress={() => {
                      setReason(r);
                      setStep('confirm');
                    }}
                  >
                    <Text style={styles.reasonText}>{r}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#5A5A78" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {step === 'confirm' && (
            <View style={styles.body}>
              <Text style={styles.subtitle}>
                {intent === 'block'
                  ? `You are blocking ${blockable?.name ?? 'this user'} for:`
                  : `You are reporting ${titleFor(target)} for:`}
              </Text>

              <View style={styles.badge}>
                <Text style={styles.badgeText}>{reason}</Text>
              </View>

              <Text style={styles.note}>
                {intent === 'block'
                  ? 'Blocking takes effect immediately and also notifies our moderation team, who review the account within 24 hours. You can undo this any time in Settings → Blocked Users.'
                  : 'Our moderation team reviews every report within 24 hours. Content that breaks our rules is removed and the account that posted it is ejected.'}
              </Text>

              <TouchableOpacity
                style={[styles.submitBtn, intent === 'block' && styles.blockBtn]}
                onPress={submit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator size={20} color="#fff" />
                ) : (
                  <Text style={styles.submitText}>
                    {intent === 'block' ? 'Block user' : 'Submit report'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function fileReport(target: ReportTarget, reason: string) {
  switch (target.kind) {
    case 'user':
      return reportUser(target.id, reason, {
        eventId: target.eventId,
        source: target.source,
      });
    case 'message':
      return reportMessage(target.id, target.context, reason, target.text);
    case 'event':
      return reportEvent(target.id, reason);
  }
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#16161E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#3D3D5C',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: 'Nunito_800ExtraBold',
    color: '#F0F0FA',
  },
  body: { paddingBottom: 4 },
  subtitle: {
    fontSize: 14,
    color: '#7878A0',
    marginBottom: 16,
    lineHeight: 20,
    fontFamily: 'Nunito_600SemiBold',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E28',
  },
  actionCopy: { flex: 1 },
  actionTitle: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: '#F0F0FA',
    marginBottom: 3,
  },
  danger: { color: '#E05A5A' },
  actionSub: {
    fontSize: 13,
    color: '#7878A0',
    lineHeight: 18,
    fontFamily: 'Nunito_600SemiBold',
  },
  reasonList: { maxHeight: 340 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E28',
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    color: '#F0F0FA',
    fontFamily: 'Nunito_600SemiBold',
  },
  badge: {
    backgroundColor: '#1A1A24',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2E2E40',
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 14, color: '#FF8A3D', fontFamily: 'Nunito_600SemiBold' },
  note: { fontSize: 13, color: '#5A5A78', lineHeight: 19, marginBottom: 20 },
  submitBtn: {
    backgroundColor: '#FF6B00',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  blockBtn: { backgroundColor: '#E05A5A' },
  submitText: { fontSize: 16, fontFamily: 'Nunito_700Bold', color: '#fff' },
  cancelBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
  },
  cancelText: { fontSize: 15, fontFamily: 'Nunito_600SemiBold', color: '#7878A0' },
});
