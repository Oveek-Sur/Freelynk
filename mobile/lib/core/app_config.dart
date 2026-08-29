/// Build-time configuration.
///
/// Nothing here is a user secret — the app has no accounts and no login.
/// These values pair the APK with your Vercel deployment.
///
/// Override at build time instead of editing this file:
///
///   flutter build apk --release \
///     --dart-define=SYNC_BASE_URL=https://your-app.vercel.app \
///     --dart-define=SYNC_CLIENT_KEY=... \
///     --dart-define=SYNC_SECRET=...
///
/// SYNC_SECRET must be byte-identical to the one in Vercel env vars,
/// otherwise decryption fails and the app shows "ডেটা পড়া যায়নি".
class AppConfig {
  const AppConfig._();

  static const String baseUrl = String.fromEnvironment(
    'SYNC_BASE_URL',
    defaultValue: 'https://freelynk.vercel.app',
  );

  static const String clientKey = String.fromEnvironment(
    'SYNC_CLIENT_KEY',
    defaultValue: 'replace-me-with-your-SYNC_CLIENT_KEY',
  );

  static const String syncSecret = String.fromEnvironment(
    'SYNC_SECRET',
    defaultValue: 'replace-me-with-your-SYNC_SECRET',
  );

  static Uri get syncUrl => Uri.parse('$baseUrl/api/sync');

  static bool get isConfigured =>
      !clientKey.startsWith('replace-me') && !syncSecret.startsWith('replace-me');
}
