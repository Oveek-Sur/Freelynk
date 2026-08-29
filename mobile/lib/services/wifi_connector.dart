import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:permission_handler/permission_handler.dart';
// wifi_iot exports its own WifiNetwork type; ours must win.
import 'package:wifi_iot/wifi_iot.dart' hide WifiNetwork;
import 'package:wifi_scan/wifi_scan.dart';

import '../data/wifi_network.dart';

/// Thrown for problems we want to show the user verbatim.
class WifiException implements Exception {
  final String message;
  const WifiException(this.message);
  @override
  String toString() => message;
}

class WifiConnector {
  static const MethodChannel _channel = MethodChannel('com.freelynk.app/wifi');

  // ------------------------------------------------------------ permission

  /// Returns null when everything is ready, otherwise a user-facing reason.
  ///
  /// Two different worlds here:
  ///   • Android 12 and below — scan results are gated behind location
  ///     permission AND the location service being switched on.
  ///   • Android 13+ — NEARBY_WIFI_DEVICES (declared `neverForLocation`)
  ///     is enough; GPS can stay off.
  ///
  /// So we accept either path instead of always demanding location.
  Future<String?> ensureReady() async {
    if (!Platform.isAndroid) return null;

    final statuses = await [
      Permission.locationWhenInUse,
      Permission.nearbyWifiDevices,
    ].request();

    final nearbyGranted =
        statuses[Permission.nearbyWifiDevices]?.isGranted ?? false;
    final locationGranted =
        statuses[Permission.locationWhenInUse]?.isGranted ?? false;

    if (!nearbyGranted && !locationGranted) {
      final permanentlyBlocked =
          (statuses[Permission.locationWhenInUse]?.isPermanentlyDenied ??
                  false) ||
              (statuses[Permission.nearbyWifiDevices]?.isPermanentlyDenied ??
                  false);
      return permanentlyBlocked
          ? 'পারমিশন স্থায়ীভাবে বন্ধ আছে। সেটিংস → পারমিশন থেকে চালু করুন।'
          : 'আশেপাশের ওয়াইফাই খুঁজতে পারমিশন দরকার।';
    }

    // Only the legacy path needs the GPS toggle.
    if (!nearbyGranted && !await Permission.location.serviceStatus.isEnabled) {
      return 'ওয়াইফাই স্ক্যান করতে ফোনের লোকেশন (GPS) চালু করুন।';
    }

    if (!await WiFiForIoTPlugin.isEnabled()) {
      await WiFiForIoTPlugin.setEnabled(true, shouldOpenSettings: true);
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!await WiFiForIoTPlugin.isEnabled()) {
        return 'ফোনের ওয়াইফাই চালু করুন।';
      }
    }

    return null;
  }

  // ----------------------------------------------------------------- scan

  /// Scans the air and returns only those saved networks that are in range,
  /// strongest first (priority wins ties).
  Future<List<NearbyNetwork>> scanFor(List<WifiNetwork> saved) async {
    if (saved.isEmpty) return const [];

    final can = await WiFiScan.instance.canStartScan();
    if (can != CanStartScan.yes) {
      throw WifiException(_scanErrorText(can));
    }

    await WiFiScan.instance.startScan();
    await Future<void>.delayed(const Duration(seconds: 3));

    final canRead = await WiFiScan.instance.canGetScannedResults();
    if (canRead != CanGetScannedResults.yes) {
      throw const WifiException('স্ক্যানের ফলাফল পড়া যাচ্ছে না।');
    }

    final results = await WiFiScan.instance.getScannedResults();

    // Strongest reading wins when an SSID shows up on several APs/bands.
    // Keep the SSID as broadcast, not the normalised key — we match loosely
    // but must join byte-exactly. See [NearbyNetwork.onAirSsid].
    final strongest = <String, ({int level, String ssid})>{};
    for (final ap in results) {
      final key = WifiNetwork.normalizeSsid(ap.ssid);
      if (key.isEmpty) continue;
      final current = strongest[key];
      if (current == null || ap.level > current.level) {
        strongest[key] = (level: ap.level, ssid: ap.ssid.trim());
      }
    }

    final nearby = <NearbyNetwork>[];
    for (final network in saved) {
      final hit = strongest[network.key];
      if (hit != null) {
        nearby.add(
          NearbyNetwork(
            network: network,
            level: hit.level,
            onAirSsid: hit.ssid,
          ),
        );
      }
    }

    nearby.sort((a, b) {
      final byPriority = b.network.priority.compareTo(a.network.priority);
      return byPriority != 0 ? byPriority : b.level.compareTo(a.level);
    });

    return nearby;
  }

  String _scanErrorText(CanStartScan can) => switch (can) {
        CanStartScan.noLocationPermissionRequired ||
        CanStartScan.noLocationPermissionDenied =>
          'লোকেশন পারমিশন দরকার।',
        CanStartScan.noLocationServiceDisabled => 'লোকেশন (GPS) চালু করুন।',
        CanStartScan.notSupported => 'এই ডিভাইসে ওয়াইফাই স্ক্যান সাপোর্ট করে না।',
        _ => 'এখন স্ক্যান করা যাচ্ছে না, একটু পরে চেষ্টা করুন।',
      };

  // -------------------------------------------------------------- connect

  /// Joins [network]. Throws [WifiException] with a readable reason on failure.
  ///
  /// Pass [onAirSsid] — the SSID as the scan reported it — whenever the
  /// network was just seen. Android joins by exact bytes, so the database's
  /// capitalisation is not good enough. See [NearbyNetwork.onAirSsid].
  Future<void> connect(WifiNetwork network, {String? onAirSsid}) async {
    final ssid = (onAirSsid?.trim().isNotEmpty ?? false)
        ? onAirSsid!.replaceAll('"', '').trim()
        : network.ssid.replaceAll('"', '').trim();

    // Drop any process-level binding left over from a previous session,
    // otherwise Android keeps routing traffic through the old network.
    await _safe(() => _channel.invokeMethod('forceDisconnect', {'ssid': ''}));
    await _safe(() => WiFiForIoTPlugin.forceWifiUsage(false));
    await _safe(() => WiFiForIoTPlugin.disconnect());
    await Future<void>.delayed(const Duration(seconds: 1));

    final accepted = await WiFiForIoTPlugin.connect(
      ssid,
      password: network.isOpen ? null : network.password,
      security: switch (network.security) {
        'OPEN' => NetworkSecurity.NONE,
        'WEP' => NetworkSecurity.WEP,
        _ => NetworkSecurity.WPA,
      },
      joinOnce: true,
      withInternet: true,
    ).timeout(
      const Duration(seconds: 35),
      onTimeout: () => false,
    );

    if (!accepted) {
      throw const WifiException(
        'কানেক্ট করা গেল না। পাসওয়ার্ড ভুল হতে পারে, অথবা সিগন্যাল দুর্বল।',
      );
    }

    // On Android 10+ the plugin only *registers a suggestion*; a `true` here
    // means Android accepted the suggestion, not that we joined anything.
    // The radio may still be sitting on the old network, or waiting for the
    // user to approve the suggestion notification. Confirm before believing.
    if (!await _waitForAssociation(ssid)) {
      throw WifiException(
        'ফোনটি $ssid-এ যুক্ত হয়নি। অ্যান্ড্রয়েড অনুমতি চাইলে '
        'নোটিফিকেশন থেকে "Allow"/"অনুমতি দিন" চাপুন, তারপর আবার চেষ্টা করুন।',
      );
    }

    await _bindWithRetry(ssid);
  }

  /// Polls until the radio actually reports [ssid], or gives up.
  ///
  /// Comparison is case-insensitive: we asked for the on-air spelling, but
  /// some ROMs echo the SSID back with different quoting.
  Future<bool> _waitForAssociation(String ssid) async {
    final want = WifiNetwork.normalizeSsid(ssid);
    final deadline = DateTime.now().add(const Duration(seconds: 25));

    while (DateTime.now().isBefore(deadline)) {
      final current = await currentSsid();
      if (current != null && WifiNetwork.normalizeSsid(current) == want) {
        return true;
      }
      await Future<void>.delayed(const Duration(milliseconds: 800));
    }
    return false;
  }

  Future<void> _bindWithRetry(String ssid) async {
    if (!Platform.isAndroid) return;
    for (var attempt = 0; attempt < 3; attempt++) {
      await Future<void>.delayed(const Duration(seconds: 2));
      await _safe(() => WiFiForIoTPlugin.forceWifiUsage(true));
      final bound = await _safe(
        () => _channel.invokeMethod('bindToWifi', {'ssid': ssid}),
      );
      if (bound == true) return;
    }
  }

  Future<void> disconnect() async {
    await _safe(() => _channel.invokeMethod('forceDisconnect', {'ssid': ''}));
    await _safe(() => WiFiForIoTPlugin.forceWifiUsage(false));
    await _safe(() => WiFiForIoTPlugin.disconnect());
  }

  // --------------------------------------------------------------- status

  Future<String?> currentSsid() async {
    try {
      final ssid = await WiFiForIoTPlugin.getSSID();
      if (ssid == null) return null;
      final clean = ssid.replaceAll('"', '').trim();
      if (clean.isEmpty || clean == '<unknown ssid>') return null;
      return clean;
    } catch (_) {
      return null;
    }
  }

  /// True when the current network actually reaches the internet.
  Future<bool> hasInternet() async {
    try {
      final res = await http
          .get(Uri.parse('http://connectivitycheck.gstatic.com/generate_204'))
          .timeout(const Duration(seconds: 6));
      return res.statusCode == 204;
    } catch (_) {
      try {
        final lookup = await InternetAddress.lookup('one.one.one.one')
            .timeout(const Duration(seconds: 4));
        return lookup.isNotEmpty && lookup.first.rawAddress.isNotEmpty;
      } catch (_) {
        return false;
      }
    }
  }

  /// Runs a best-effort platform call. Never throws, and never hangs.
  ///
  /// The timeout is not decoration. On a Unisoc Android 11 handset
  /// `bindToWifi` returned no result at all — ConnectivityManager delivered
  /// neither `onAvailable` nor `onUnavailable` — so the awaiting Future
  /// stayed pending forever and the UI sat on "কানেক্ট হচ্ছে" with no error
  /// and no way out. An unbounded platform call is a hang waiting to happen.
  Future<T?> _safe<T>(
    Future<T> Function() action, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    try {
      return await action().timeout(timeout);
    } on TimeoutException {
      debugPrint('wifi op timed out after ${timeout.inSeconds}s');
      return null;
    } catch (e) {
      debugPrint('wifi op ignored: $e');
      return null;
    }
  }
}
