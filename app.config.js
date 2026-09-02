// app.json stays the single source of truth for every static field — this
// file only exists to add the one thing app.json (plain JSON) structurally
// cannot do: read a build-time env var. The react-native-maps config plugin
// needs the Google Maps API key baked into the native project at prebuild
// time (AndroidManifest.xml / AppDelegate), which means it must come from
// process.env here, not from the EXPO_PUBLIC_* vars Metro inlines into the
// JS bundle — see .env / GOOGLE_MAPS_API_KEY and the Set Location + Pick on
// Map report for the full setup.
//
// `config` here is Expo CLI's own already-loaded app.json — read through
// that (not a separate require('./app.json')) so this can never diverge
// from what the CLI actually resolved.
module.exports = ({ config }) => {
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: mapsApiKey,
          iosGoogleMapsApiKey: mapsApiKey,
        },
      ],
    ],
  };
};
