import React, { useEffect, useRef } from "react";
import { Text } from "react-native";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BadgeProvider } from "@/context/BadgeContext";
import { useRouter, Stack } from "expo-router";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from "@expo-google-fonts/nunito";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "react-native-toast-message";

SplashScreen.preventAutoHideAsync();

function AppNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { user, isLoading, needsPasswordReset } = useAuth();
  const router = useRouter();
  const hasNavigated = useRef(false);

  // Initial navigation on app launch
  useEffect(() => {
    if (!fontsLoaded || isLoading) return;
    if (hasNavigated.current) return;

    (Text as any).defaultProps = (Text as any).defaultProps || {};
    (Text as any).defaultProps.style = { fontFamily: "Nunito_400Regular" };

    SplashScreen.hideAsync();
    hasNavigated.current = true;

    if (user?.onboardingCompleted) {
      router.replace("/(tabs)");
    } else if (user) {
      router.replace("/(auth)/onboarding");
    } else {
      router.replace("/(auth)/login");
    }
  }, [fontsLoaded, isLoading, user]);

  // Route to reset-password whenever Supabase fires PASSWORD_RECOVERY
  useEffect(() => {
    if (needsPasswordReset && fontsLoaded && !isLoading) {
      router.replace("/(auth)/reset-password");
    }
  }, [needsPasswordReset, fontsLoaded, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BadgeProvider>
        <AuthProvider>
          <AppNavigator fontsLoaded={fontsLoaded ?? false} />
        </AuthProvider>
      </BadgeProvider>
      <Toast />
    </GestureHandlerRootView>
  );
}
