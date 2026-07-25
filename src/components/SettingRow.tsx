// Used in: (tabs)/profile.tsx
// Renders a single settings list row: colored icon box, label text, and a chevron

import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  iconColor?: string;
  onPress?: () => void;
};

export default function SettingRow({ icon, label, iconColor = '#FF6B00', onPress }: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.iconBox, { backgroundColor: `${iconColor}22` }]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#3A3A55" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: '#F0F0FA',
    fontWeight: '500',
  },
});
