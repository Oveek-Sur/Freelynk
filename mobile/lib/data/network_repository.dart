import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_config.dart';
import '../core/payload_cipher.dart';
import 'wifi_network.dart';

class SyncResult {
  final List<WifiNetwork> networks;
  final DateTime? syncedAt;
  final bool fromCache;
  final String? error;

  const SyncResult({
    required this.networks,
    this.syncedAt,
    this.fromCache = false,
    this.error,
  });
}

/// Offline-first store for the network list.
///
/// The encrypted blob from `/api/sync` is written to disk **exactly as
/// received**. Plaintext passwords never touch storage — they are only
/// decrypted into memory when the app needs them. Losing the phone does
/// not leak the list unless the attacker also pulls SYNC_SECRET out of
/// the APK.
class NetworkRepository {
  static const _blobFile = 'networks.blob';
  static const _prefsEtag = 'sync_etag';
  static const _prefsSyncedAt = 'sync_at';

  Future<File> _file() async {
    final dir = await getApplicationSupportDirectory();
    if (!await dir.exists()) await dir.create(recursive: true);
    return File('${dir.path}${Platform.pathSeparator}$_blobFile');
  }

  // ---------------------------------------------------------------- cache

  Future<SyncResult> loadCached() async {
    try {
      final file = await _file();
      if (!await file.exists()) {
        return const SyncResult(networks: [], fromCache: true);
      }

      final networks = await _decode(await file.readAsString());
      final prefs = await SharedPreferences.getInstance();
      final at = prefs.getString(_prefsSyncedAt);

      return SyncResult(
        networks: networks,
        syncedAt: at == null ? null : DateTime.tryParse(at),
        fromCache: true,
      );
    } catch (e) {
      debugPrint('loadCached failed: $e');
      return SyncResult(
        networks: const [],
        fromCache: true,
        error: 'সেভ করা ডেটা পড়া যায়নি।',
      );
    }
  }

  // ----------------------------------------------------------------- sync

  Future<SyncResult> sync() async {
    if (!AppConfig.isConfigured) {
      final cached = await loadCached();
      return SyncResult(
        networks: cached.networks,
        syncedAt: cached.syncedAt,
        fromCache: true,
        error: 'অ্যাপটি এখনো কনফিগার করা হয়নি (SYNC_SECRET সেট করুন)।',
      );
    }

    final prefs = await SharedPreferences.getInstance();

    try {
      final res = await http.get(
        AppConfig.syncUrl,
        headers: {
          'X-Client-Key': AppConfig.clientKey,
          if (prefs.getString(_prefsEtag) != null)
            'If-None-Match': prefs.getString(_prefsEtag)!,
        },
      ).timeout(const Duration(seconds: 20));

      // Server says nothing changed — keep using what we already have.
      if (res.statusCode == 304) {
        final cached = await loadCached();
        await prefs.setString(_prefsSyncedAt, DateTime.now().toIso8601String());
        return SyncResult(
          networks: cached.networks,
          syncedAt: DateTime.now(),
        );
      }

      if (res.statusCode == 403) {
        final cached = await loadCached();
        return SyncResult(
          networks: cached.networks,
          syncedAt: cached.syncedAt,
          fromCache: true,
          error: 'সার্ভার এই অ্যাপটিকে চিনছে না (client key ভুল)।',
        );
      }

      if (res.statusCode != 200) {
        final cached = await loadCached();
        return SyncResult(
          networks: cached.networks,
          syncedAt: cached.syncedAt,
          fromCache: true,
          error: 'সার্ভার সাড়া দেয়নি (${res.statusCode})।',
        );
      }

      final body = utf8.decode(res.bodyBytes);

      // Decode BEFORE overwriting the cache, so a bad payload can never
      // destroy a working offline copy.
      final networks = await _decode(body);

      await (await _file()).writeAsString(body, flush: true);
      final etag = res.headers['etag'];
      if (etag != null) await prefs.setString(_prefsEtag, etag);
      final now = DateTime.now();
      await prefs.setString(_prefsSyncedAt, now.toIso8601String());

      return SyncResult(networks: networks, syncedAt: now);
    } on SocketException {
      final cached = await loadCached();
      return SyncResult(
        networks: cached.networks,
        syncedAt: cached.syncedAt,
        fromCache: true,
        error: 'ইন্টারনেট নেই — অফলাইন তালিকা দেখানো হচ্ছে।',
      );
    } catch (e) {
      debugPrint('sync failed: $e');
      final cached = await loadCached();
      return SyncResult(
        networks: cached.networks,
        syncedAt: cached.syncedAt,
        fromCache: true,
        error: 'সিঙ্ক ব্যর্থ — অফলাইন তালিকা দেখানো হচ্ছে।',
      );
    }
  }

  Future<void> clearCache() async {
    final file = await _file();
    if (await file.exists()) await file.delete();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefsEtag);
    await prefs.remove(_prefsSyncedAt);
  }

  // --------------------------------------------------------------- decode

  Future<List<WifiNetwork>> _decode(String envelopeJson) async {
    final envelope = jsonDecode(envelopeJson) as Map<String, dynamic>;
    final blob = envelope['data'] as String?;
    if (blob == null) throw const FormatException('Missing "data" field.');

    final clear = await PayloadCipher.decrypt(blob, AppConfig.syncSecret);
    final payload = jsonDecode(clear) as Map<String, dynamic>;
    final list = (payload['networks'] as List?) ?? const [];

    final networks = list
        .whereType<Map<String, dynamic>>()
        .map(WifiNetwork.fromJson)
        .where((n) => n.ssid.isNotEmpty)
        .toList();

    networks.sort((a, b) {
      final byPriority = b.priority.compareTo(a.priority);
      return byPriority != 0
          ? byPriority
          : a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase());
    });

    return networks;
  }
}
