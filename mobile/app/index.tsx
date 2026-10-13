import { View, ActivityIndicator, StyleSheet } from 'react-native';

/**
 * Root entry point — renders only a neutral splash while AuthGuard in
 * _layout.tsx reads SecureStore and decides where to navigate.
 *
 * Do NOT redirect from here. Any unconditional <Redirect> fires before
 * isLoading resolves, which causes a visible flash of the target screen
 * for already-authenticated users.
 */
export default function Index() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#0D6053" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F5F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
