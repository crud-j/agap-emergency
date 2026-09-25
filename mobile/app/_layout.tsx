import { Stack } from 'expo-router';

export default function RootLayout() {
  // Let Expo Router auto-discover all routes — only suppress the header globally.
  // Explicit Stack.Screen declarations for groups that don't exist yet cause warnings.
  return <Stack screenOptions={{ headerShown: false }} />;
}
