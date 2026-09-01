// Used in: (auth)/signup.tsx, (auth)/login.tsx
//
// App Store Guideline 1.2 requires the terms to be presented before a user
// registers or logs in, and to state that there is no tolerance for
// objectionable content or abusive users. Sign-up takes an explicit tick
// (TermsCheckbox); sign-in shows the same agreement as a notice.

import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_URL, TERMS_URL } from '@/constants/legal';

function openTerms() {
  Linking.openURL(TERMS_URL);
}

function openPrivacy() {
  Linking.openURL(PRIVACY_URL);
}

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
};

/**
 * The registration gate. Create Account stays disabled until this is ticked,
 * so agreement is genuinely explicit rather than implied by a footer.
 */
export function TermsCheckbox({ checked, onToggle }: CheckboxProps) {
  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.row}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Agree to the Terms of Service and Privacy Policy"
      >
        <View style={[styles.box, checked && styles.boxChecked]}>
          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>

        <Text style={styles.label}>
          I agree to the{' '}
          <Text style={styles.link} onPress={openTerms}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text style={styles.link} onPress={openPrivacy}>
            Privacy Policy
          </Text>
          .
        </Text>
      </TouchableOpacity>

      <Text style={styles.warning}>
        OpenCircle has zero tolerance for objectionable content or abusive
        users. Posting hate speech, threats, harassment, or explicit content
        results in your account being removed.
      </Text>
    </View>
  );
}

/** The sign-in equivalent: same agreement, shown as a notice above the button. */
export function TermsNotice() {
  return (
    <Text style={styles.notice}>
      By signing in you agree to our{' '}
      <Text style={styles.link} onPress={openTerms}>
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text style={styles.link} onPress={openPrivacy}>
        Privacy Policy
      </Text>
      , including zero tolerance for objectionable content and abusive users.
    </Text>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#3E3E56',
    backgroundColor: '#0F0F13',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },
  label: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#9C9CBE',
    fontFamily: 'Nunito_600SemiBold',
  },
  link: {
    color: '#FF6B00',
    fontFamily: 'Nunito_700Bold',
  },
  warning: {
    marginTop: 10,
    marginLeft: 32,
    fontSize: 11.5,
    lineHeight: 17,
    color: '#6E6E90',
    fontFamily: 'Nunito_600SemiBold',
  },
  notice: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: '#6E6E90',
    fontFamily: 'Nunito_600SemiBold',
  },
});
