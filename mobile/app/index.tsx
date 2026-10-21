import { View, StyleSheet } from 'react-native';

/**
 * Root entry point — renders a blank white screen (the animated AgapSplash
 * overlay from _layout.tsx sits on top) while AuthGuard in
 * _layout.tsx reads SecureStore and decides where to navigate.
 *
 * Do NOT redirect from here. Any unconditional <Redirect> fires before
 * isLoading resolves, which causes a visible flash of the target screen
 * for already-authenticated users.
 */
export default function Index() {
  return (
    <View style={styles.root} />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
