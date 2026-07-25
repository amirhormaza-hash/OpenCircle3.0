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
  Image,
  FlatList,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase/client';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../context/AuthContext';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

const CATEGORY_OPTIONS = [
  'Sports', 'Party', 'Food', 'Study', 'Networking', 'Ride', 'Outdoors', 'Zen', 'Other',
] as const;

const LEVEL_OPTIONS = [
  'For All', 'Newbie', 'Beginner', 'Intermediate', 'Advanced', 'Expert',
] as const;

const CATEGORY_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Sports: 'football-outline',
  Party: 'musical-notes-outline',
  Food: 'restaurant-outline',
  Study: 'book-outline',
  Networking: 'people-outline',
  Ride: 'car-outline',
  Outdoors: 'leaf-outline',
  Zen: 'moon-outline',
  Other: 'ellipsis-horizontal-outline',
};

// Google Places autocomplete result shape
type Suggestion = { description: string; place_id: string };

type UploadedImage = {
  image_url: string;
  image_path: string;
  position: number;
};

export default function CreateEventScreen(): React.JSX.Element {
  const { user } = useAuth();

  const [name, setName] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [numberOfGuests, setNumberOfGuests] = useState<string>('');
  const [category, setCategory] = useState<string>(CATEGORY_OPTIONS[0]);
  const [level, setLevel] = useState<string>(LEVEL_OPTIONS[0]);

  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [tempTime, setTempTime] = useState<Date>(new Date());

  const [imageUris, setImageUris] = useState<string[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pickedLatLon, setPickedLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  type Suggestion = { description: string; place_id: string };
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
    } catch (_) {}
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateTimeForDb(date: Date): string {
    return date.toISOString();
  }

  function getExtensionFromUri(uri: string): string {
    const cleanUri = uri.split('?')[0];
    const extension = cleanUri.split('.').pop()?.toLowerCase();
    if (!extension) return 'jpg';
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension)) return extension;
    return 'jpg';
  }

  function getContentType(extension: string): string {
    switch (extension) {
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'webp': return 'image/webp';
      case 'heic': return 'image/heic';
      case 'heif': return 'image/heif';
      default: return 'image/jpeg';
    }
  }

  function generateUniqueFilename(userId: string, index: number, extension: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).slice(2, 8);
    return `${userId}/${timestamp}-${randomString}-${index}.${extension}`;
  }

  async function pickImages(): Promise<void> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'You need to allow access to your photos to choose event images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 6,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const newUris = result.assets.map((asset) => asset.uri).filter(Boolean);
      setImageUris((prev) => Array.from(new Set([...prev, ...newUris])).slice(0, 6));
    }
  }

  function removeImage(indexToRemove: number): void {
    setImageUris((prev) => prev.filter((_, index) => index !== indexToRemove));
  }

  async function uploadSingleEventImage(userId: string, uri: string, index: number): Promise<UploadedImage> {
    const extension = getExtensionFromUri(uri);
    const filePath = generateUniqueFilename(userId, index, extension);

    const bytes = await new File(uri).bytes();

    const { error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(filePath, bytes.buffer, { contentType: getContentType(extension), cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('event-images').getPublicUrl(filePath);
    if (!publicUrl) throw new Error('Failed to generate public URL for uploaded image.');
    return { image_url: publicUrl, image_path: filePath, position: index };
  }

  async function uploadEventImages(uris: string[]): Promise<UploadedImage[]> {
    if (!user) throw new Error('User not authenticated');
    const uploadedImages: UploadedImage[] = [];
    try {
      for (let i = 0; i < uris.length; i++) {
        setUploadProgress(i / uris.length);
        const uploadedImage = await uploadSingleEventImage(user.id, uris[i], i);
        uploadedImages.push(uploadedImage);
      }
      setUploadProgress(1);
      return uploadedImages;
    } catch (error) {
      if (uploadedImages.length > 0) {
        await supabase.storage.from('event-images').remove(uploadedImages.map((img) => img.image_path));
      }
      throw error;
    }
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date): void {
    setShowDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    const updated = new Date(eventDate);
    updated.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    setEventDate(updated);
  }

  function openTimePicker(): void {
    setTempTime(new Date(eventDate));
    setShowTimePicker(true);
  }

  function handleTempTimeChange(_: DateTimePickerEvent, selected?: Date): void {
    if (Platform.OS === 'android') {
      // Android: dialog closes itself, apply immediately
      setShowTimePicker(false);
      if (!selected) return;
      const updated = new Date(eventDate);
      updated.setHours(selected.getHours());
      updated.setMinutes(selected.getMinutes());
      updated.setSeconds(0);
      setEventDate(updated);
    } else {
      // iOS spinner: update temp while user scrolls
      if (selected) setTempTime(selected);
    }
  }

  function confirmTime(): void {
    const updated = new Date(eventDate);
    updated.setHours(tempTime.getHours());
    updated.setMinutes(tempTime.getMinutes());
    updated.setSeconds(0);
    setEventDate(updated);
    setShowTimePicker(false);
  }

  async function handleCreateEvent(): Promise<void> {
    if (!name.trim()) { Alert.alert('Missing field', 'Please enter the event name.'); return; }
    if (!address.trim()) { Alert.alert('Missing field', 'Please enter the address.'); return; }
    if (!description.trim()) { Alert.alert('Missing field', 'Please enter the description.'); return; }
    const guestCount = Number(numberOfGuests);
    if (!numberOfGuests.trim() || Number.isNaN(guestCount) || guestCount <= 0) {
      Alert.alert('Invalid guests', 'Please enter a valid positive number of guests.');
      return;
    }
    if (!user) { Alert.alert('Authentication required', 'You must be logged in to create an event.'); return; }
    if (eventDate < new Date()) { Alert.alert('Invalid date', 'Event date cannot be in the past.'); return; }

    setSaving(true);
    setUploadProgress(null);

    // Tracks the inserted event row so a failure in any later step
    // (attendee insert, image upload, image rows insert) rolls it back —
    // an event must never survive a creation error.
    let createdEventId: string | null = null;

    try {
      let latitude: number | null = pickedLatLon?.lat ?? null;
      let longitude: number | null = pickedLatLon?.lon ?? null;
      if (latitude === null) {
        try {
          const geocoded = await Location.geocodeAsync(address.trim());
          if (geocoded.length > 0) {
            latitude = geocoded[0].latitude;
            longitude = geocoded[0].longitude;
          }
        } catch (_) {}
      }

      const { data: createdEvent, error: eventError } = await supabase
        .from('event')
        .insert([{
          name: name.trim(), address: address.trim(), description: description.trim(),
          date_time: formatDateTimeForDb(eventDate), number_of_guests: guestCount,
          profile_id: user.id, category, level, latitude, longitude,
        }])
        .select()
        .single();

      if (eventError) throw eventError;
      createdEventId = createdEvent.id;

      const { error: attendeeError } = await supabase
        .from('event_attendees')
        .insert([{ event_id: createdEvent.id, user_id: user.id, owner: true }]);

      if (attendeeError) throw attendeeError;

      if (imageUris.length > 0) {
        const uploadedImages = await uploadEventImages(imageUris);
        const imageRows = uploadedImages.map((img) => ({
          event_id: createdEvent.id, image_url: img.image_url,
          image_path: img.image_path, position: img.position,
        }));
        const { error: imagesError } = await supabase.from('event_images').insert(imageRows);
        if (imagesError) {
          await supabase.storage.from('event-images').remove(uploadedImages.map((img) => img.image_path));
          throw imagesError;
        }
      }

      Toast.show({ type: 'success', text1: 'Event created!', text2: 'Your event is now live.', position: 'bottom' });
      router.back();
    } catch (error: unknown) {
      if (createdEventId) {
        try {
          await supabase.from('event_attendees').delete().eq('event_id', createdEventId);
          await supabase.from('event_images').delete().eq('event_id', createdEventId);
          await supabase.from('event').delete().eq('id', createdEventId);
        } catch (_) {
          // Best-effort rollback; the error below is what the user needs to see.
        }
      }
      const msg = error instanceof Error ? error.message : 'Could not create event.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Event</Text>
            <Text style={styles.subtitle}>Fill in the details below</Text>
          </View>

          {/* ── Photos ── */}
          <SectionCard icon="images-outline" title="Photos">
            <TouchableOpacity style={styles.imagePickerZone} onPress={pickImages}>
              <Ionicons name="cloud-upload-outline" size={28} color="#FF6B00" />
              <Text style={styles.imagePickerTitle}>
                {imageUris.length > 0 ? `${imageUris.length} / 6 selected — Add more` : 'Upload photos'}
              </Text>
              <Text style={styles.imagePickerSub}>Tap to select up to 6 images</Text>
            </TouchableOpacity>

            {imageUris.length > 0 && (
              <View style={styles.imageGrid}>
                {imageUris.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.imageTile}>
                    <Image source={{ uri }} style={styles.imageTileImg} />
                    <TouchableOpacity
                      style={styles.imageTileRemove}
                      onPress={() => removeImage(index)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                    {index === 0 && (
                      <View style={styles.imageTileBadge}>
                        <Text style={styles.imageTileBadgeText}>Cover</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          {/* ── Details ── */}
          <SectionCard icon="create-outline" title="Event Details">
            <FieldLabel text="Event name *" />
            <InputRow icon="text-outline">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Soccer Match"
                placeholderTextColor="#5A5A78"
                style={styles.input}
              />
            </InputRow>

            <FieldLabel text="Address *" />
            <View style={styles.addressWrapper}>
              <InputRow icon="location-outline">
                <TextInput
                  value={address}
                  onChangeText={(t) => { setAddress(t); setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="e.g. Miami, FL"
                  placeholderTextColor="#5A5A78"
                  style={styles.input}
                />
              </InputRow>
              {showSuggestions && suggestions.length > 0 && (
                <FlatList
                  data={suggestions}
                  keyExtractor={(_, i) => String(i)}
                  style={styles.suggestionList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.suggestionItem} onPress={() => pickSuggestion(item)}>
                      <Ionicons name="location-outline" size={14} color="#7878A0" style={{ marginRight: 8 }} />
                      <Text style={styles.suggestionText} numberOfLines={2}>{item.description}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>

            <FieldLabel text="Description *" />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your event..."
              placeholderTextColor="#5A5A78"
              multiline
              style={styles.textArea}
            />

            <FieldLabel text="Number of guests *" />
            <InputRow icon="people-outline">
              <TextInput
                value={numberOfGuests}
                onChangeText={setNumberOfGuests}
                placeholder="e.g. 20"
                placeholderTextColor="#5A5A78"
                keyboardType="numeric"
                style={styles.input}
              />
            </InputRow>
          </SectionCard>

          {/* ── Category ── */}
          <SectionCard icon="grid-outline" title="Category">
            <View style={styles.pillGrid}>
              {CATEGORY_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.pill, category === item && styles.pillActive]}
                  onPress={() => setCategory(item)}
                >
                  <Ionicons
                    name={CATEGORY_ICONS[item]}
                    size={14}
                    color={category === item ? '#fff' : '#7878A0'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.pillText, category === item && styles.pillTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* ── Level ── */}
          <SectionCard icon="bar-chart-outline" title="Level">
            <View style={styles.pillGrid}>
              {LEVEL_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.pill, level === item && styles.pillActiveLevel]}
                  onPress={() => setLevel(item)}
                >
                  <Text style={[styles.pillText, level === item && styles.pillTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* ── Schedule ── */}
          <SectionCard icon="calendar-outline" title="Schedule">
            <FieldLabel text="Date *" />
            <TouchableOpacity style={styles.selectorButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={18} color="#FF6B00" style={{ marginRight: 10 }} />
              <Text style={styles.selectorButtonText}>{formatDate(eventDate)}</Text>
              <Ionicons name="chevron-forward" size={16} color="#3A3A55" />
            </TouchableOpacity>

            <FieldLabel text="Time *" />
            <TouchableOpacity style={styles.selectorButton} onPress={openTimePicker}>
              <Ionicons name="time-outline" size={18} color="#FF6B00" style={{ marginRight: 10 }} />
              <Text style={styles.selectorButtonText}>{formatTime(eventDate)}</Text>
              <Ionicons name="chevron-forward" size={16} color="#3A3A55" />
            </TouchableOpacity>
          </SectionCard>

          {showDatePicker && (
            <DateTimePicker
              value={eventDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
            />
          )}

          {/* Time picker — modal on iOS, native dialog on Android */}
          {Platform.OS === 'ios' ? (
            <Modal visible={showTimePicker} transparent animationType="slide">
              <View style={styles.timeModalOverlay}>
                <View style={styles.timeModalSheet}>
                  <View style={styles.timeModalHandle} />
                  <View style={styles.timeModalHeader}>
                    <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                      <Text style={styles.timeModalCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.timeModalTitle}>Select Time</Text>
                    <TouchableOpacity onPress={confirmTime}>
                      <Text style={styles.timeModalDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={tempTime}
                    mode="time"
                    display="spinner"
                    onChange={handleTempTimeChange}
                    style={styles.timeModalPicker}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            showTimePicker && (
              <DateTimePicker
                value={eventDate}
                mode="time"
                display="default"
                onChange={handleTempTimeChange}
              />
            )
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handleCreateEvent}
            disabled={saving}
          >
            {saving ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#fff" />
                {uploadProgress !== null && (
                  <Text style={styles.progressText}>
                    Uploading {Math.round(uploadProgress * 100)}%
                  </Text>
                )}
              </View>
            ) : (
              <>
                <Ionicons name="flash" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.submitButtonText}>Create Event</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Reusable components ────────────────────────────────────────────────────

function SectionCard({ icon, title, children }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconBox}>
          <Ionicons name={icon} size={15} color="#FF6B00" />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

function InputRow({ icon, children }: { icon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  return (
    <View style={styles.inputRow}>
      <Ionicons name={icon} size={17} color="#5A5A78" style={styles.inputIcon} />
      {children}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  header: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F0F0FA',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#5A5A78',
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#1A1A24',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2E2E40',
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FF6B0022',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F0F0FA',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7878A0',
    marginBottom: 6,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F13',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E2E40',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: '#F0F0FA',
  },
  textArea: {
    backgroundColor: '#0F0F13',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E2E40',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#F0F0FA',
    height: 110,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  addressWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  suggestionList: {
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 12,
    marginTop: -8,
    marginBottom: 12,
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#2E2E40',
  },
  suggestionText: {
    color: '#F0F0FA',
    fontSize: 14,
    flex: 1,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F13',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E2E40',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
  },
  selectorButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#F0F0FA',
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0F0F13',
    borderWidth: 1,
    borderColor: '#2E2E40',
  },
  pillActive: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },
  pillActiveLevel: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7878A0',
  },
  pillTextActive: {
    color: '#fff',
  },
  imagePickerZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#2E2E40',
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    backgroundColor: '#0F0F13',
  },
  imagePickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F0F0FA',
    marginTop: 4,
  },
  imagePickerSub: {
    fontSize: 12,
    color: '#5A5A78',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageTile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imageTileImg: {
    width: '100%',
    height: '100%',
  },
  imageTileRemove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageTileBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    backgroundColor: '#FF6B00',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageTileBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#FF6B00',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 4,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Time modal (iOS)
  timeModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  timeModalSheet: {
    backgroundColor: '#1A1A24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: '#2E2E40',
  },
  timeModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2E2E40',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  timeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2E2E40',
  },
  timeModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F0F0FA',
  },
  timeModalCancel: {
    fontSize: 15,
    color: '#7878A0',
    fontWeight: '500',
  },
  timeModalDone: {
    fontSize: 15,
    color: '#FF6B00',
    fontWeight: '700',
  },
  timeModalPicker: {
    backgroundColor: '#1A1A24',
  },
});
