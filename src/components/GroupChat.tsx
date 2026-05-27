// Used in: available for any screen that needs a direct link to the event group chat
// Button that navigates to the event's group chat screen

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

interface Props {
  event: { id: string; name: string };
}

export default function GroupChat({ event }: Props) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.push(`/(tabs)/messages/${event.id}`)}
    >
      <Text style={styles.buttonText}>Open Group Chat</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FF6B00',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
