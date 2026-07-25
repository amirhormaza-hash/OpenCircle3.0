// Used in: (auth)/login.tsx, (auth)/signup.tsx
// Renders the OpenCircle ring mark, app name, and tagline at the top of auth screens

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import OpenRing from './OpenRing';
import { colors, fonts } from '../constants/colors';

type Props = {
  accentColor: string;
  tagline: string;
};

export default function AuthBrandHeader({ accentColor, tagline }: Props) {
  return (
    <View style={styles.brandSection}>
      <View style={[styles.logoCircle, { shadowColor: accentColor }]}>
        <OpenRing size={40} color={accentColor} bg={colors.card} />
      </View>
      <Text style={styles.appName}>OpenCircle</Text>
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
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  appName: {
    fontSize: 30,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  appTagline: {
    fontSize: 14,
    fontFamily: fonts.body,
    color: colors.muted,
  },
});
