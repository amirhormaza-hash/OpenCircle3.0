// Used in: (auth)/login.tsx, (auth)/signup.tsx
// Renders the Eventify logo circle, app name, and tagline at the top of auth screens

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  accentColor: string;
  tagline: string;
};

export default function AuthBrandHeader({ accentColor, tagline }: Props) {
  return (
    <View style={styles.brandSection}>
      <View style={[styles.logoCircle, { borderColor: accentColor, shadowColor: accentColor }]}>
        <Ionicons name="flash" size={36} color={accentColor} />
      </View>
      <Text style={styles.appName}>Eventify</Text>
      <Text style={styles.appTagline}>{tagline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A1A24',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F0F0FA',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  appTagline: {
    fontSize: 14,
    color: '#7878A0',
  },
});
