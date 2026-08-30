import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_config.dart';
import 'consent.dart';

/// Tells the server "this device was used today", once a day at most.
///
/// The admin panel needs to know how many people actually use the app.
/// Counting /api/sync would have been simpler, but that endpoint is
/// served from the CDN precisely so it never reaches a function — making
/// it countable would mean paying an invocation for every launch, which
/// is the cost the caching exists to avoid. So the counting lives in one
/// small, deliberately uncached call instead, and the throttle below
/// keeps it to one per calendar day however often the app is opened.
///
/// What is sent: a random id this app generated for itself, the platform,
/// and the app version. No account, no phone number, no advertising id,
/// no location. The app asks for no login, so it has no business knowing
/// who anyone is.
///
/// Failure is silent by design. Nobody's WiFi should stop working because
/// a statistic could not be filed.
class UsageReporter {
  static const _prefsDeviceId = 'device_id';
  static const _prefsLastPing = 'last_ping_day';

  final http.Client _client;

  UsageReporter({http.Client? client}) : _client = client ?? http.Client();

  /// The stable, anonymous id for this install, creating one if needed.
  ///
  /// Cleared app data or a reinstall produces a new id, so this counts
  /// installs rather than people — which is exactly what it claims to.
  static Future<String> deviceId() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_prefsDeviceId);
    if (existing != null && existing.isNotEmpty) return existing;

    final id = _uuidV4();
    await prefs.setString(_prefsDeviceId, id);
    return id;
  }

  /// Reports today's use, unless today has already been reported.
  Future<void> reportIfNewDay() async {
    if (!AppConfig.isConfigured) return;

    // Checked here as well as in the launch gate. The privacy notice says
    // nothing leaves the phone before it is read, and a promise that holds
    // only because the screens happen to be ordered correctly is one bad
    // refactor away from being untrue.
    if (!await Consent.isAccepted()) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final today = _todayInDhaka();

      // The server would deduplicate anyway — (device, day) is its primary
      // key — but not sending the request at all is the point: it keeps
      // the traffic proportional to daily users, not to launches.
      if (prefs.getString(_prefsLastPing) == today) return;

      final res = await _client
          .post(
            AppConfig.pingUrl,
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Key': AppConfig.clientKey,
            },
            body: jsonEncode({
              'deviceId': await deviceId(),
              'platform': Platform.isAndroid ? 'android' : 'other',
              'appVersion': AppConfig.version,
            }),
          )
          .timeout(const Duration(seconds: 10));

      // Only mark the day done when the server actually recorded it,
      // otherwise a day spent offline would never be counted at all.
      if (res.statusCode == 200) {
        await prefs.setString(_prefsLastPing, today);
      }
    } catch (e) {
      debugPrint('usage ping skipped: $e');
    }
  }

  /// Records that somebody tapped an advert.
  ///
  /// Unlike the daily report this fires every time, because the question
  /// it answers is "what did this advertiser get for their money", and a
  /// shop that was called twice was called twice.
  ///
  /// Fire and forget: the phone call or the browser must open whether or
  /// not the counter was reached, so this never blocks and never throws.
  Future<void> recordClick(String kind, String id) async {
    if (!AppConfig.isConfigured || id.isEmpty) return;
    if (!await Consent.isAccepted()) return;

    try {
      await _client
          .post(
            AppConfig.trackUrl,
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Key': AppConfig.clientKey,
            },
            body: jsonEncode({'kind': kind, 'id': id}),
          )
          .timeout(const Duration(seconds: 6));
    } catch (e) {
      debugPrint('click not recorded: $e');
    }
  }

  /// Today's date in Dhaka, as YYYY-MM-DD.
  ///
  /// Must agree with the server, which also counts days in Asia/Dhaka —
  /// otherwise a phone set to another timezone would report a day the
  /// server considers tomorrow.
  static String _todayInDhaka() {
    final dhaka = DateTime.now().toUtc().add(const Duration(hours: 6));
    final m = dhaka.month.toString().padLeft(2, '0');
    final d = dhaka.day.toString().padLeft(2, '0');
    return '${dhaka.year}-$m-$d';
  }

  /// A random v4 UUID. Random.secure() so ids cannot be guessed or
  /// collide across a large install base.
  static String _uuidV4() {
    final rng = Random.secure();
    final bytes = List<int>.generate(16, (_) => rng.nextInt(256));

    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }
}
