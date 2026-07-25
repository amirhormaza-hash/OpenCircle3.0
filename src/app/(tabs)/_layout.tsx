import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBadge } from "../../context/BadgeContext";
import { colors, fonts } from "../../constants/colors";

export default function Layout() {
    const { myListBadge } = useBadge();
    const insets = useSafeAreaInsets();

    return (
        <Tabs screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.ember,
            tabBarInactiveTintColor: colors.mutedDeep,
            tabBarLabelStyle: {
                fontSize: 11,
                fontFamily: fonts.bold,
                marginBottom: 2,
            },
            tabBarStyle: {
                backgroundColor: Platform.OS === 'ios' ? 'rgba(15,15,19,0.88)' : colors.bg,
                borderTopWidth: 1,
                borderTopColor: '#1E1E2A',
                elevation: 0,
                height: 56 + insets.bottom,
                paddingTop: 6,
                paddingBottom: Math.max(insets.bottom, 8),
            },
            tabBarBackground: Platform.OS === 'ios' ? () => (
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            ) : undefined,
        }}>
            <Tabs.Screen name="index" options={{
                tabBarLabel: "Home",
                tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
                ),
            }} />
            <Tabs.Screen name="mylist" options={{
                tabBarLabel: "My List",
                tabBarIcon: ({ color, size, focused }) => (
                    <View>
                        <Ionicons name={focused ? "list" : "list-outline"} size={size} color={color} />
                        {myListBadge && <View style={styles.badge} />}
                    </View>
                ),
            }} />
            <Tabs.Screen name="create" options={{
                tabBarLabel: "Create",
                tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? "add-circle" : "add-circle-outline"} size={size} color={color} />
                ),
            }} />
            <Tabs.Screen name="messages/index" options={{
                tabBarLabel: "Messages",
                tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? "chatbubble" : "chatbubble-outline"} size={size} color={color} />
                ),
            }} />
            <Tabs.Screen name="profile" options={{
                tabBarLabel: "Profile",
                tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
                ),
            }} />
            <Tabs.Screen name="messages/[eventId]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
            <Tabs.Screen name="messages/dm/[userId]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
            <Tabs.Screen name="edit-event" options={{ href: null }} />
            <Tabs.Screen name="profile-settings" options={{ href: null }} />
            <Tabs.Screen name="user-profile" options={{ href: null }} />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    badge: {
        position: 'absolute',
        top: -2,
        right: -4,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.ember,
    },
});
