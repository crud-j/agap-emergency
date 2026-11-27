// Background work must be defined before the app starts, because Android can start the
// app's code with no screen at all (a push arriving while AGAP is closed).
import './src/services/push/assignment-ring-task';
import 'expo-router/entry';
