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
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase/client';
import Toast from 'react-native-toast-message';
import * as Location from 'expo-location';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';

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

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PLACES_KEY = 'AIzaSyBthTvUzhvd_c7XYtF5mxgRMdIr5kLg8rA';

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((loc) => {
        setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }).catch(() => {});
    }).catch(() => {});
  }, []);

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
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Event</Text>

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
  backButton: { marginBottom: 8 },
  backButtonText: { color: '#7C3AED', fontSize: 16, fontWeight: '700' },
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
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#7C3AED',
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
