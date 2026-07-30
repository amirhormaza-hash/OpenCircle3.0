import { File } from "expo-file-system";
import { supabase } from "./client";

export const uploadProfileImage = async (userId: string, imageUri: string) => {
  const cleanUri = imageUri.split("?")[0];
  const ext = (cleanUri.split(".").pop() || "jpg").toLowerCase();
  const mimeType = ext === "jpg" ? "jpeg" : ext;
  const fileName = `${userId}/profile.${ext}`;

  const bytes = await new File(imageUri).bytes();

  const { error } = await supabase.storage
    .from("profiles")
    .upload(fileName, bytes.buffer, {
      contentType: `image/${mimeType}`,
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("profiles").getPublicUrl(fileName);
  return data.publicUrl;
};

const VIDEO_EXTS = ["mp4", "mov", "m4v", "webm"];

function contentTypeFor(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "application/octet-stream";
}

/**
 * Upload a picked photo or video to the chat-media bucket.
 * Returns the public URL and the media type ('image' | 'video').
 */
export const uploadChatMedia = async (
  userId: string,
  uri: string,
): Promise<{ url: string; mediaType: "image" | "video" }> => {
  const cleanUri = uri.split("?")[0];
  const ext = (cleanUri.split(".").pop() || "jpg").toLowerCase();
  const isVideo = VIDEO_EXTS.includes(ext);
  const rand = Math.random().toString(36).slice(2, 10);
  const fileName = `${userId}/${Date.now()}-${rand}.${ext}`;

  const bytes = await new File(uri).bytes();

  const { error } = await supabase.storage
    .from("chat-media")
    .upload(fileName, bytes.buffer, {
      contentType: contentTypeFor(ext),
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("chat-media").getPublicUrl(fileName);
  return { url: data.publicUrl, mediaType: isVideo ? "video" : "image" };
};
