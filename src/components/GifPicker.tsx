// WhatsApp-style GIF search sheet, powered by GIPHY.
// Set EXPO_PUBLIC_GIPHY_KEY (from developers.giphy.com).
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/colors';

const GIPHY_KEY = process.env.EXPO_PUBLIC_GIPHY_KEY ?? '';
const COLS = 2;
const GAP = 8;
const SIDE = 16;

type Gif = { id: string; url: string; preview: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
};

export default function GifPicker({ visible, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colWidth = (Dimensions.get('window').width - SIDE * 2 - GAP) / COLS;

  const fetchGifs = useCallback(async (q: string) => {
    if (!GIPHY_KEY) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const base = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13&bundle=messaging_non_clips`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13&bundle=messaging_non_clips`;
      const res = await fetch(base);
      const json = await res.json();
      const items: Gif[] = (json.data ?? []).map((g: any) => ({
        id: g.id,
        url: g.images?.downsized?.url ?? g.images?.original?.url,
        preview: g.images?.fixed_width?.url ?? g.images?.downsized?.url,
      })).filter((g: Gif) => g.url && g.preview);
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
                {GIPHY_KEY ? "Couldn't load GIFs. Check your connection." : 'GIF search is not configured yet.'}
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

          <Text style={styles.attribution}>Powered By GIPHY</Text>
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
