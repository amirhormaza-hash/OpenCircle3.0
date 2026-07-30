// WhatsApp-style GIF search sheet, powered by Tenor.
// Set EXPO_PUBLIC_TENOR_KEY (a Google Cloud API key with the Tenor API enabled).
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/colors';

const TENOR_KEY = process.env.EXPO_PUBLIC_TENOR_KEY ?? '';
const COLS = 2;
const GAP = 8;
const SIDE = 16;

type TenorGif = { id: string; url: string; preview: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
};

export default function GifPicker({ visible, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colWidth = (Dimensions.get('window').width - SIDE * 2 - GAP) / COLS;

  const fetchGifs = useCallback(async (q: string) => {
    if (!TENOR_KEY) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const endpoint = q.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=24&media_filter=tinygif,gif&contentfilter=high`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=24&media_filter=tinygif,gif&contentfilter=high`;
      const res = await fetch(endpoint);
      const json = await res.json();
      const items: TenorGif[] = (json.results ?? []).map((r: any) => ({
        id: r.id,
        url: r.media_formats?.gif?.url ?? r.media_formats?.tinygif?.url,
        preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url,
      })).filter((g: TenorGif) => g.url);
      setGifs(items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchGifs(query), 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, visible, fetchGifs]);

  useEffect(() => {
    if (!visible) { setQuery(''); setGifs([]); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search GIFs"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancel}>Close</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.line} />
              <Text style={styles.errorText}>
                {TENOR_KEY ? "Couldn't load GIFs. Check your connection." : 'GIF search is not configured yet.'}
              </Text>
            </View>
          ) : loading && gifs.length === 0 ? (
            <ActivityIndicator color={colors.ember} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={gifs}
              keyExtractor={(item) => item.id}
              numColumns={COLS}
              columnWrapperStyle={{ gap: GAP }}
              contentContainerStyle={{ padding: SIDE, gap: GAP }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.8} onPress={() => { onSelect(item.url); onClose(); }}>
                  <Image
                    source={{ uri: item.preview }}
                    style={{ width: colWidth, height: colWidth, borderRadius: 10, backgroundColor: colors.cardAlt }}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No GIFs found.</Text>
              }
            />
          )}

          <Text style={styles.attribution}>Powered by Tenor</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    height: '75%', paddingTop: 10,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 12 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.body, color: colors.text },
  cancel: { fontSize: 14, fontFamily: fonts.bold, color: colors.ember, marginLeft: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  errorText: { fontSize: 14, fontFamily: fonts.body, color: colors.muted, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.muted, textAlign: 'center', marginTop: 30 },
  attribution: { fontSize: 11, fontFamily: fonts.body, color: colors.mutedDeep, textAlign: 'center', paddingVertical: 6 },
});
