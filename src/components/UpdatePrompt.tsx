// Shows an "update available" popup on launch when a newer build exists.
// Optional updates are dismissible; required updates block until you update.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Linking } from 'react-native';
import OpenRing from './OpenRing';
import { colors, fonts } from '../constants/colors';
import { checkForUpdate, type UpdateInfo } from '../lib/updateCheck';

export default function UpdatePrompt() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkForUpdate().then(setInfo).catch(() => {});
  }, []);

  const visible = !!info && (info.required || !dismissed);
  if (!info) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.ring}>
            <OpenRing size={40} bg={colors.card} />
          </View>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.message}>{info.message}</Text>

          <TouchableOpacity
            style={styles.updateBtn}
            activeOpacity={0.85}
            onPress={() => Linking.openURL(info.url)}
          >
            <Text style={styles.updateText}>Update now</Text>
          </TouchableOpacity>

          {!info.required && (
            <TouchableOpacity style={styles.laterBtn} onPress={() => setDismissed(true)}>
              <Text style={styles.laterText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 28,
  },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: colors.card,
    borderRadius: 24, borderWidth: 1, borderColor: colors.line,
    padding: 26, alignItems: 'center',
  },
  ring: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 22, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4, marginBottom: 8 },
  message: { fontSize: 15, fontFamily: fonts.body, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  updateBtn: {
    width: '100%', backgroundColor: colors.ember, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  updateText: { fontSize: 16, fontFamily: fonts.heading, color: '#fff', letterSpacing: 0.3 },
  laterBtn: { paddingVertical: 12, marginTop: 4 },
  laterText: { fontSize: 14, fontFamily: fonts.bold, color: colors.muted },
});
