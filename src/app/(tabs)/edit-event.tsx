import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  View,
  FlatList,
} from 'react-native';
import { Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase/client';
import { uploadEventImage } from '../../lib/supabase/storage';
import { useAuth } from '../../context/AuthContext';
import Toast from 'react-native-toast-message';
import * as Location from 'expo-location';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';

const MAX_IMAGES = 6;
type ExistingImage = { id: string; path: string; url: string; position: number };

const CATEGORY_OPTIONS = [
  'Sports', 'Party', 'Food', 'Study', 'Networking', 'Ride', 'Outdoors', 'Zen', 'Other',
] as const;

const LEVEL_OPTIONS = [
  'For All', 'Newbie', 'Beginner', 'Intermediate', 'Advanced', 'Expert',
] as const;

// Google Places autocomplete result shape
type Suggestion = { description: string; place_id: string };

// Fields sent to Supabase when saving an edited event
type EventUpdatePayload = {
  name: string;
  address: string;
  description: string;
  date_time: string;
  number_of_guests: number;
  category: string;
  level: string;
  latitude?: number;
  longitude?: number;
};

export default function EditEventScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    address: string;
    description: string;
    number_of_guests: string;
    category: string;
    level: string;
    date_time: string;
  }>();

  const [name, setName] = useState(params.name ?? '');
  const [address, setAddress] = useState(params.address ?? '');
  const [description, setDescription] = useState(params.description ?? '');
  const [numberOfGuests, setNumberOfGuests] = useState(params.number_of_guests ?? '');
  const [category, setCategory] = useState(params.category ?? CATEGORY_OPTIONS[0]);
  const [level, setLevel] = useState(params.level ?? LEVEL_OPTIONS[0]);
  const [eventDate, setEventDate] = useState(() =>
    params.date_time ? new Date(params.date_time) : new Date()
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickedLatLon, setPickedLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  const { user } = useAuth();
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [newImageUris, setNewImageUris] = useState<string[]>([]);
  const [removedImages, setRemovedImages] = useState<{ id: string; path: string }[]>([]);
  const totalImages = existingImages.length + newImageUris.length;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((loc) => {
        setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  // Load the event's existing images
  useEffect(() => {
    if (!params.id) return;
    supabase
      .from('event_images')
      .select('id, image_path, position')
      .eq('event_id', params.id)
      .order('position', { ascending: true })
      .then(({ data }) => {
        setExistingImages((data ?? []).map((r: any) => ({
          id: r.id,
          path: r.image_path,
          position: r.position ?? 0,
          url: supabase.storage.from('event-images').getPublicUrl(r.image_path).data.publicUrl,
        })));
      });
  }, [params.id]);

  async function pickImages() {
    if (totalImages >= MAX_IMAGES) {
      Alert.alert('Limit reached', `You can have up to ${MAX_IMAGES} photos.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to add images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_IMAGES - totalImages,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const uris = result.assets.map((a) => a.uri).filter(Boolean);
      setNewImageUris((prev) => [...prev, ...uris].slice(0, MAX_IMAGES - existingImages.length));
    }
  }

  function removeExistingImage(img: ExistingImage) {
    setExistingImages((prev) => prev.filter((x) => x.id !== img.id));
    setRemovedImages((prev) => [...prev, { id: img.id, path: img.path }]);
  }

  function removeNewImage(uri: string) {
    setNewImageUris((prev) => prev.filter((u) => u !== uri));
  }

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) { setSuggestions([]); return; }
    try {
      const locationParam = userLocation
        ? `&location=${userLocation.lat},${userLocation.lon}&radius=50000`
        : '';
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:us${locationParam}&key=${PLACES_KEY}`
      );
      const json = await res.json();
      setSuggestions(json.predictions ?? []);
      setShowSuggestions(true);
    } catch (_) {
      setSuggestions([]);
    }
  }, [userLocation]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(address), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [address, fetchSuggestions]);

  async function pickSuggestion(s: Suggestion) {
    setAddress(s.description);
    setSuggestions([]);
    setShowSuggestions(false);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${s.place_id}&fields=geometry&key=${PLACES_KEY}`
      );
      const json = await res.json();
      const loc = json.result?.geometry?.location;
      if (loc) setPickedLatLon({ lat: loc.lat, lon: loc.lng });
    } catch (_) {
      // coords unavailable, will fall back to geocoding on submit
    }
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    const updated = new Date(eventDate);
    updated.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    setEventDate(updated);
  }

  function handleTimeChange(event: DateTimePickerEvent, selectedTime?: Date) {
    setShowTimePicker(false);
    if (event.type === 'dismissed' || !selectedTime) return;
    const updated = new Date(eventDate);
    updated.setHours(selectedTime.getHours());
    updated.setMinutes(selectedTime.getMinutes());
    updated.setSeconds(0);
    setEventDate(updated);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Missing field', 'Please enter the event name.'); return; }
    if (!address.trim()) { Alert.alert('Missing field', 'Please enter the address.'); return; }
    const guestCount = Number(numberOfGuests);
    if (!numberOfGuests.trim() || Number.isNaN(guestCount) || guestCount <= 0) {
      Alert.alert('Invalid guests', 'Please enter a valid number of guests.');
      return;
    }

    setSaving(true);
    try {
      const updateData: EventUpdatePayload = {
        name: name.trim(),
        address: address.trim(),
        description: description.trim(),
        date_time: eventDate.toISOString(),
        number_of_guests: guestCount,
        category,
        level,
        ...(pickedLatLon && { latitude: pickedLatLon.lat, longitude: pickedLatLon.lon }),
      };

      const { error } = await supabase
        .from('event')
        .update(updateData)
        .eq('id', params.id);

      if (error) throw error;

      // Remove deleted images (DB rows + storage files)
      if (removedImages.length > 0) {
        await supabase.from('event_images').delete().in('id', removedImages.map((r) => r.id));
        await supabase.storage.from('event-images').remove(removedImages.map((r) => r.path));
      }

      // Upload and insert new images, positioned after the remaining ones
      if (newImageUris.length > 0 && user) {
        let nextPos = existingImages.length > 0
          ? Math.max(...existingImages.map((x) => x.position)) + 1
          : 0;
        for (const uri of newImageUris) {
          const uploaded = await uploadEventImage(user.id, uri, nextPos);
          await supabase.from('event_images').insert({
            event_id: params.id,
            image_url: uploaded.image_url,
            image_path: uploaded.image_path,
            position: nextPos,
          });
          nextPos += 1;
        }
      }

      Toast.show({ type: 'success', text1: 'Event updated!', position: 'bottom' });
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update event.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={18} color="#FF6B00" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Event</Text>

          <Text style={styles.label}>Photos</Text>
          <View style={styles.imageGrid}>
            {existingImages.map((img) => (
              <View key={img.id} style={styles.imageTile}>
                <Image source={{ uri: img.url }} style={styles.imageTileImg} />
                <TouchableOpacity
                  style={styles.imageTileRemove}
                  onPress={() => removeExistingImage(img)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {newImageUris.map((uri, i) => (
              <View key={`new-${uri}-${i}`} style={styles.imageTile}>
                <Image source={{ uri }} style={styles.imageTileImg} />
                <View style={styles.newBadge}><Text style={styles.newBadgeText}>New</Text></View>
                <TouchableOpacity
                  style={styles.imageTileRemove}
                  onPress={() => removeNewImage(uri)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {totalImages < MAX_IMAGES && (
              <TouchableOpacity style={styles.addTile} onPress={pickImages}>
                <Ionicons name="add" size={28} color="#FF6B00" />
                <Text style={styles.addTileText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {totalImages === 0 && (
            <Text style={styles.imageHint}>No photos yet. Tap Add to include some.</Text>
          )}

          <Text style={styles.label}>Event name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Soccer Match"
            placeholderTextColor="#5A5A78"
            style={styles.input}
          />

          <Text style={styles.label}>Address *</Text>
          <View style={styles.addressWrapper}>
            <TextInput
              value={address}
              onChangeText={(t) => { setAddress(t); setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Miami"
              placeholderTextColor="#5A5A78"
              style={styles.input}
            />
            {showSuggestions && suggestions.length > 0 && (
              <FlatList
                data={suggestions}
                keyExtractor={(_, i) => String(i)}
                style={styles.suggestionList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.suggestionItem} onPress={() => pickSuggestion(item)}>
                    <Text style={styles.suggestionText} numberOfLines={2}>{item.description}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the event"
            placeholderTextColor="#5A5A78"
            multiline
            style={[styles.input, styles.textArea]}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={category} onValueChange={(v: string) => setCategory(v)}>
              {CATEGORY_OPTIONS.map((item) => (
                <Picker.Item key={item} label={item} value={item} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Level</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={level} onValueChange={(v: string) => setLevel(v)}>
              {LEVEL_OPTIONS.map((item) => (
                <Picker.Item key={item} label={item} value={item} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Date *</Text>
          <TouchableOpacity style={styles.selectorButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.selectorButtonText}>{eventDate.toLocaleDateString()}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Time *</Text>
          <TouchableOpacity style={styles.selectorButton} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.selectorButtonText}>
              {eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={eventDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={eventDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
            />
          )}

          <Text style={styles.label}>Number of guests *</Text>
          <TextInput
            value={numberOfGuests}
            onChangeText={setNumberOfGuests}
            placeholder="20"
            placeholderTextColor="#5A5A78"
            keyboardType="numeric"
            style={styles.input}
          />

          <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F13' },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backButtonText: { color: '#FF6B00', fontSize: 16, fontWeight: '700' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  imageTile: { width: '30%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  imageTileImg: { width: '100%', height: '100%' },
  imageTileRemove: {
    position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center',
  },
  newBadge: {
    position: 'absolute', bottom: 5, left: 5, backgroundColor: '#FF6B00',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  addTile: {
    width: '30%', aspectRatio: 1, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed',
    borderColor: '#2E2E40', justifyContent: 'center', alignItems: 'center', gap: 2,
  },
  addTileText: { color: '#7878A0', fontSize: 12, fontWeight: '600' },
  imageHint: { color: '#5A5A78', fontSize: 13, marginTop: -8, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 20, color: '#F0F0FA' },
  label: { marginBottom: 6, fontWeight: '600', color: '#C0C0D8', fontSize: 14 },
  input: {
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    fontSize: 16,
    color: '#F0F0FA',
  },
  textArea: { height: 110, textAlignVertical: 'top' },
  pickerWrapper: {
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  selectorButton: {
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 16,
  },
  selectorButtonText: { fontSize: 16, color: '#F0F0FA' },
  button: {
    backgroundColor: '#FF6B00',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addressWrapper: { position: 'relative', zIndex: 10 },
  suggestionList: {
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 12,
    marginTop: -12,
    marginBottom: 16,
    maxHeight: 200,
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2E2E40',
  },
  suggestionText: { color: '#F0F0FA', fontSize: 14 },
});
