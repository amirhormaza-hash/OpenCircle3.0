// Renders chat media inside a message bubble: image, gif, or video.
import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

export type MediaType = 'image' | 'video' | 'gif';

const SIZE = 230;

function VideoBubble({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  return (
    <View style={styles.media}>
      <VideoView player={player} style={styles.media} nativeControls contentFit="cover" />
    </View>
  );
}

export default function MediaBubble({
  url,
  type,
  onPressImage,
}: {
  url: string;
  type: MediaType;
  onPressImage?: (url: string) => void;
}) {
  if (type === 'video') {
    return <VideoBubble url={url} />;
  }
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPressImage?.(url)}>
      <Image source={{ uri: url }} style={styles.media} contentFit="cover" />
      {type === 'gif' && (
        <View style={styles.gifBadge}>
          <Ionicons name="film-outline" size={11} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  media: {
    width: SIZE,
    height: SIZE,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
    overflow: 'hidden',
  },
  gifBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
});
