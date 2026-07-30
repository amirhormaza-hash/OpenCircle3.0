import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase/client';

export type UpdateInfo = {
  required: boolean;   // true = must update (blocking)
  url: string;         // store link
  message: string;
};

/**
 * Check the app_config version gate against this device's build number.
 * Returns null when up to date, in dev, or on any error (never blocks the app).
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const currentBuild = Number(Constants.nativeBuildVersion ?? 0);
  // No native build number in Expo Go / dev — skip the check.
  if (!currentBuild) return null;

  try {
    const { data } = await supabase
      .from('app_config')
      .select('latest_build, min_build, android_url, ios_url, message')
      .eq('id', 1)
      .maybeSingle();
    if (!data) return null;

    const url = Platform.OS === 'ios' && data.ios_url ? data.ios_url : data.android_url;

    if (currentBuild < (data.min_build ?? 0)) {
      return { required: true, url, message: data.message };
    }
    if (currentBuild < (data.latest_build ?? 0)) {
      return { required: false, url, message: data.message };
    }
    return null;
  } catch {
    return null;
  }
}
