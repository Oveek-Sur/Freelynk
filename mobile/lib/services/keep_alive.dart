import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// Keeps the app running while it is holding a WiFi connection.
///
/// Without this, Android reclaims the process and the user quietly drops off
/// the network they just joined — the binding and the network suggestion both
/// belong to the process. A foreground service is the only supported way to
/// ask for a stay of execution, and its notification doubles as the off
/// switch, so nothing runs that the user cannot see and stop.
class KeepAlive {
  static const MethodChannel _channel = MethodChannel('com.freelynk.app/wifi');

  /// Starts the service, showing [ssid] in the notification.
  ///
  /// Android 13+ will not display a notification without permission, and a
  /// foreground service the user cannot see or stop is exactly what we are
  /// trying not to build — so ask first. The service still starts if the
  /// request is refused; it just runs without a visible status line.
  Future<void> start(String? ssid) async {
    if (!Platform.isAndroid) return;

    await _requestNotificationPermission();
    await _call('startKeepAlive', {'ssid': ssid ?? ''});
  }

  Future<void> stop() async {
    if (!Platform.isAndroid) return;
    await _call('stopKeepAlive');
  }

  /// Whether the OS has agreed to stop putting the app to sleep.
  ///
  /// A foreground service is not actually enough on handsets whose vendor
  /// ships an aggressive power manager on top of Android's own. Only the user
  /// can lift that, so we check before nagging.
  Future<bool> isBatteryUnrestricted() async {
    if (!Platform.isAndroid) return true;
    return await _call('isBatteryUnrestricted') as bool? ?? false;
  }

  /// Opens the OS screen where the user can lift the restriction.
  Future<void> requestBatteryUnrestricted() async {
    if (!Platform.isAndroid) return;
    await _call('requestBatteryUnrestricted');
  }

  Future<void> _requestNotificationPermission() async {
    try {
      final status = await Permission.notification.status;
      if (status.isDenied) await Permission.notification.request();
    } catch (e) {
      // Pre-13 devices have no such permission. Not worth failing over.
      debugPrint('notification permission check skipped: $e');
    }
  }

  Future<Object?> _call(String method, [Map<String, Object?>? args]) async {
    try {
      return await _channel
          .invokeMethod<Object?>(method, args)
          .timeout(const Duration(seconds: 8));
    } catch (e) {
      debugPrint('keep-alive $method failed: $e');
      return null;
    }
  }
}
