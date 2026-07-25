// Used in: (tabs)/index.tsx, (tabs)/mylist.tsx
// Bottom-sheet modal showing full event details: image gallery, info boxes, and action buttons.
// The close button is built in; pass renderActions() for screen-specific action buttons (Join, Edit, Leave, etc.)

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../constants/colors';

export type ModalEventItem = {
  id: string;
  name: string;
  date_time: string;
  address: string;
  number_of_guests?: number;
  description?: string;
  category?: string;
  level?: string;
  profile_id?: string;
  owner_username?: string | null;
  owner_profile_id?: string | null;
  rating?: number | null;
  image_urls?: string[];
};

type Props = {
  event: ModalEventItem | null;
  visible: boolean;
  onClose: () => void;
  /** Called when user taps the main image to view it fullscreen */
  onImageFullscreen: (uri: string) => void;
  /** Action buttons rendered next to the Close button (e.g. Join, Edit, Leave) */
  renderActions: () => React.ReactNode;
  /** When true, tapping the address opens the native maps app */
  addressLinkable?: boolean;
  /** Called when user taps the owner username link */
  onOwnerPress?: (userId: string) => void;
};

export default function EventDetailsModal({
  event,
  visible,
  onClose,
  onImageFullscreen,
  renderActions,
  addressLinkable = false,
  onOwnerPress,
}: Props) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Reset gallery index each time a new event is opened
  useEffect(() => {
    if (visible) setSelectedImageIndex(0);
  }, [visible, event?.id]);

  const imageUrls = event?.image_urls ?? [];
  const currentImage = imageUrls.length > 0 ? imageUrls[selectedImageIndex] : null;

  function showPrevious() {
    setSelectedImageIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1));
  }

  function showNext() {
    setSelectedImageIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1));
  }

  function openMaps() {
    if (!event?.address || !addressLinkable) return;
    const q = encodeURIComponent(event.address);
    const url = Platform.OS === 'ios' ? `maps://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`)
    );
  }

  const formattedDate = event?.date_time
    ? new Date(event.date_time).toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'No date provided';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <Pressable style={styles.overlayDismiss} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.topLine} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
          >
            <Text style={styles.title}>{event?.name}</Text>

            {/* Owner username — tappable link to their profile */}
            {event?.owner_username ? (
              <TouchableOpacity
                style={styles.ownerRow}
                activeOpacity={onOwnerPress && event.owner_profile_id ? 0.6 : 1}
                onPress={() => {
                  if (onOwnerPress && event?.owner_profile_id) {
                    onOwnerPress(event.owner_profile_id);
                  }
                }}
              >
                <Ionicons name="person-circle-outline" size={15} color="#FF6B00" style={{ marginRight: 6 }} />
                <Text style={styles.ownerLabel}>Hosted by </Text>
                <Text style={[
                  styles.ownerUsername,
                  onOwnerPress && event.owner_profile_id ? styles.ownerUsernameLink : null,
                ]}>
                  @{event.owner_username}
                </Text>
                {onOwnerPress && event.owner_profile_id && (
                  <Ionicons name="chevron-forward" size={13} color="#FF8A3D" style={{ marginLeft: 2 }} />
                )}
              </TouchableOpacity>
            ) : null}

            {/* Image gallery with prev/next arrows and thumbnail strip */}
            {currentImage ? (
              <>
                <View style={styles.mainImageWrapper}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => onImageFullscreen(currentImage)}>
                    <Image source={{ uri: currentImage }} style={styles.mainImage} resizeMode="cover" />
                  </TouchableOpacity>
                  {imageUrls.length > 1 && (
                    <>
                      <Pressable style={[styles.arrowButton, styles.leftArrow]} onPress={showPrevious}>
                        <Ionicons name="chevron-back" size={22} color="#fff" />
                      </Pressable>
                      <Pressable style={[styles.arrowButton, styles.rightArrow]} onPress={showNext}>
                        <Ionicons name="chevron-forward" size={22} color="#fff" />
                      </Pressable>
                    </>
                  )}
                </View>
                {imageUrls.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    contentContainerStyle={styles.thumbnailRow}
                  >
                    {imageUrls.map((url, index) => (
                      <Pressable
                        key={`${url}-${index}`}
                        onPress={() => setSelectedImageIndex(index)}
                        style={[
                          styles.thumbnailWrapper,
                          selectedImageIndex === index && styles.thumbnailWrapperActive,
                        ]}
                      >
                        <Image source={{ uri: url }} style={styles.thumbnailImage} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </>
            ) : (
              <View style={styles.noImageBox}>
                <Text style={styles.noImageText}>No images uploaded</Text>
              </View>
            )}

            {/* Address — tappable only when addressLinkable is true */}
            <TouchableOpacity
              style={styles.infoBox}
              activeOpacity={addressLinkable && event?.address ? 0.65 : 1}
              onPress={openMaps}
            >
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={16} color="#FF6B00" style={styles.infoIcon} />
                <Text style={[styles.infoValue, addressLinkable && !!event?.address && styles.infoValueLink]}>
                  {event?.address || 'No address provided'}
                </Text>
                {addressLinkable && !!event?.address && (
                  <Ionicons name="navigate-outline" size={14} color="#FF6B00" style={{ marginLeft: 6 }} />
                )}
              </View>
            </TouchableOpacity>

            {/* Date */}
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={16} color="#FF6B00" style={styles.infoIcon} />
                <Text style={styles.infoValue}>{formattedDate}</Text>
              </View>
            </View>

            {/* Guest count */}
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Ionicons name="people-outline" size={16} color="#FF6B00" style={styles.infoIcon} />
                <Text style={styles.infoValue}>{event?.number_of_guests ?? 'No guest limit'} guests max</Text>
              </View>
            </View>

            {/* Category */}
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Ionicons name="grid-outline" size={16} color="#FF6B00" style={styles.infoIcon} />
                <Text style={styles.infoValue}>{event?.category || 'No category'}</Text>
              </View>
            </View>

            {/* Rating */}
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Ionicons name="star" size={16} color="#FFB800" style={styles.infoIcon} />
                <Text style={styles.infoValue}>
                  {event?.rating != null ? `${event.rating.toFixed(2)} ★` : 'No reviews yet'}
                </Text>
              </View>
            </View>

            {/* Level */}
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Ionicons name="bar-chart-outline" size={16} color="#FF6B00" style={styles.infoIcon} />
                <Text style={styles.infoValue}>{event?.level || 'No level'}</Text>
              </View>
            </View>

            {/* Description */}
            <View style={styles.descriptionBox}>
              <View style={styles.infoRow}>
                <Ionicons name="document-text-outline" size={16} color="#FF6B00" style={styles.infoIcon} />
                <Text style={styles.infoLabel}>Description</Text>
              </View>
              <Text style={styles.description}>{event?.description || 'No description provided'}</Text>
            </View>

            {/* Close + screen-specific action buttons */}
            <View style={styles.buttonRow}>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.buttonText}>Close</Text>
              </Pressable>
              {renderActions()}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Exported so screens can style their action buttons to match the close button height/radius
export const actionButtonStyles = StyleSheet.create({
  base: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  join: {
    backgroundColor: '#FF6B00',
    flex: 2,
    flexDirection: 'row' as const,
    gap: 8,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  edit: {
    backgroundColor: '#1E1E28',
    borderWidth: 1,
    borderColor: '#FF6B00',
  },
  leave: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Nunito_800ExtraBold',
    letterSpacing: 0.3,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  overlayDismiss: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#1A1A24',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 40,
    maxHeight: '92%',
  },
  topLine: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#2E2E40',
    alignSelf: 'center',
    marginBottom: 18,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.display,
    color: '#F0F0FA',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ownerLabel: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: '#7878A0',
  },
  ownerUsername: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#C0C0D8',
  },
  ownerUsernameLink: {
    color: '#FF8A3D',
    textDecorationLine: 'underline',
  },
  mainImageWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  mainImage: {
    width: '100%',
    height: 240,
    borderRadius: 18,
    backgroundColor: '#1E1E28',
  },
  arrowButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(31, 41, 55, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  leftArrow: {
    left: 10,
  },
  rightArrow: {
    right: 10,
  },
  thumbnailRow: {
    paddingBottom: 12,
    paddingTop: 2,
  },
  thumbnailWrapper: {
    marginRight: 10,
    borderRadius: 12,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailWrapperActive: {
    borderColor: '#FF6B00',
  },
  thumbnailImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#1E1E28',
  },
  noImageBox: {
    height: 180,
    borderRadius: 18,
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2E2E40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  noImageText: {
    color: '#7878A0',
    fontSize: 14,
    fontFamily: fonts.body,
  },
  infoBox: {
    backgroundColor: '#222230',
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  descriptionBox: {
    backgroundColor: '#222230',
    borderWidth: 1,
    borderColor: '#2E2E40',
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    marginRight: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#FF6B00',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: '#F0F0FA',
    lineHeight: 22,
    flex: 1,
  },
  infoValueLink: {
    color: '#FF8A3D',
    textDecorationLine: 'underline',
  },
  description: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: '#C0C0D8',
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  closeButton: {
    flex: 1,
    backgroundColor: '#2E2E40',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: fonts.heading,
    letterSpacing: 0.3,
  },
});
