// Used in: (auth)/login.tsx, (auth)/signup.tsx
// Renders a dark input row with a left icon and optional right element (e.g. password eye toggle)

import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = TextInputProps & {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  rightElement?: React.ReactNode;
};

export default function AuthInputField({ icon, rightElement, ...inputProps }: Props) {
  return (
    <View style={styles.wrapper}>
      <Ionicons name={icon} size={18} color="#5A5A78" style={styles.icon} />
      <TextInput placeholderTextColor="#5A5A78" style={styles.input} {...inputProps} />
      {rightElement}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F13',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E2E40',
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F0F0FA',
  },
});
