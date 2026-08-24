// Custom entry point (replaces the default "expo-router/entry" in package.json's "main") —
// the FCM background message handler must be registered outside the React tree, before
// anything else loads, per @react-native-firebase/messaging's requirements. Everything else
// about the app (routing, providers, screens) is unchanged; expo-router/entry is still what
// actually boots the app, just required one line later.

import { getApp } from '@react-native-firebase/app';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

// Data-only handling for when the app is backgrounded or killed. A message with a `notification`
// payload is already displayed by the OS automatically in that state — this only needs to run for
// side effects (e.g. logging), never call notify()/show UI here, since there's no in-app banner
// to show it in.
setBackgroundMessageHandler(getMessaging(getApp()), async () => {});

import 'expo-router/entry';
