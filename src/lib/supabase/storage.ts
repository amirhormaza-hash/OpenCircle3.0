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
