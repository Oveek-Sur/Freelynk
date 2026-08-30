import 'package:shared_preferences/shared_preferences.dart';

/// Remembers that the user has read the privacy notice.
///
/// Stored as a version rather than a boolean. If the policy ever changes in
/// a way that matters — something new being collected, say — bumping
/// [currentVersion] asks again, which a plain `true` could never do. Cosmetic
/// rewording should not bump it; agreeing once should mean agreeing once.
class Consent {
  static const _key = 'privacy_accepted_version';

  /// Raise this only when what the app does with data actually changes.
  static const int currentVersion = 1;

  static Future<bool> isAccepted() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getInt(_key) ?? 0) >= currentVersion;
  }

  static Future<void> accept() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key, currentVersion);
  }
}
