import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:freelynk/core/app_config.dart';
import 'package:freelynk/data/network_repository.dart';

/// The offline promise, tested for real.
///
/// Sync once against a payload the Node server actually produced, then cut
/// the connection completely and prove the WiFi passwords are still there.
///
/// Run with the same secrets the fixture was generated with:
///
///   cd admin-web && node scripts/make-fixture.mjs
///   cd ../mobile && flutter test \
///     --dart-define=SYNC_BASE_URL=http://127.0.0.1:3000 \
///     --dart-define=SYNC_CLIENT_KEY=<key> \
///     --dart-define=SYNC_SECRET=<secret>
class _FakePaths extends PathProviderPlatform with MockPlatformInterfaceMixin {
  _FakePaths(this.root);
  final String root;

  @override
  Future<String?> getApplicationSupportPath() async => root;
}

void main() {
  final fixtureFile = File('test/fixtures/server_payload.json');

  if (!fixtureFile.existsSync()) {
    test('offline cache', () {},
        skip: 'run admin-web/scripts/make-fixture.mjs first');
    return;
  }

  final fixture =
      jsonDecode(fixtureFile.readAsStringSync()) as Map<String, dynamic>;

  if (!AppConfig.isConfigured || AppConfig.syncSecret != fixture['secret']) {
    test('offline cache', () {},
        skip: 'pass --dart-define=SYNC_SECRET matching the fixture');
    return;
  }

  // Exactly what /api/sync sends back.
  final envelope = jsonEncode({
    'v': 1,
    'alg': 'AES-256-GCM',
    'rev': fixture['rev'],
    'data': fixture['data'],
  });

  late Directory temp;

  setUp(() async {
    temp = await Directory.systemTemp.createTemp('freelynk_offline');
    PathProviderPlatform.instance = _FakePaths(temp.path);
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(() async {
    if (temp.existsSync()) await temp.delete(recursive: true);
  });

  test('data synced once stays readable with the network gone', () async {
    // --- online: one successful sync -------------------------------------
    var serverHits = 0;
    final online = NetworkRepository(
      client: MockClient((_) async {
        serverHits++;
        return http.Response(
          envelope,
          200,
          headers: {'etag': '"${fixture['rev']}"'},
        );
      }),
    );

    final first = await online.sync();
    expect(serverHits, 1);
    expect(first.error, isNull);
    expect(first.networks, isNotEmpty);

    final saved = first.networks.firstWhere(
      (n) => n.ssid == fixture['expectSsid'],
      orElse: () => throw StateError('fixture network missing'),
    );
    expect(saved.password, fixture['expectPassword']);

    // --- offline: the phone has no connection at all ---------------------
    final offline = NetworkRepository(
      client: MockClient((_) async {
        throw const SocketException('network is unreachable');
      }),
    );

    final second = await offline.sync();

    expect(second.fromCache, isTrue);
    expect(second.error, contains('অফলাইন'));
    expect(
      second.networks.map((n) => n.ssid),
      contains(fixture['expectSsid']),
      reason: 'the cached list must survive a dead connection',
    );
    expect(
      second.networks.firstWhere((n) => n.ssid == fixture['expectSsid']).password,
      fixture['expectPassword'],
      reason: 'passwords must still be usable offline',
    );

    // --- and again after a cold start, still with no network -------------
    final coldStart = await NetworkRepository(
      client: MockClient((_) async => throw const SocketException('down')),
    ).loadCached();

    expect(coldStart.networks.map((n) => n.ssid), contains(fixture['expectSsid']));
  });

  test('what sits on disk is ciphertext, not readable passwords', () async {
    final repo = NetworkRepository(
      client: MockClient((_) async => http.Response(envelope, 200)),
    );
    await repo.sync();

    final blob = File('${temp.path}${Platform.pathSeparator}networks.blob');
    expect(blob.existsSync(), isTrue, reason: 'cache file should exist');

    final onDisk = blob.readAsStringSync();
    expect(
      onDisk.contains(fixture['expectPassword'] as String),
      isFalse,
      reason: 'a stolen phone must not give up the passwords',
    );
    expect(
      onDisk.contains(fixture['expectSsid'] as String),
      isFalse,
      reason: 'even the network names stay encrypted at rest',
    );
  });

  test('a corrupt server reply does not destroy a working offline copy',
      () async {
    final good = NetworkRepository(
      client: MockClient((_) async => http.Response(envelope, 200)),
    );
    await good.sync();

    final broken = NetworkRepository(
      client: MockClient((_) async => http.Response('{"data":"garbage"}', 200)),
    );
    final result = await broken.sync();

    expect(result.error, isNotNull);
    expect(
      result.networks.map((n) => n.ssid),
      contains(fixture['expectSsid']),
      reason: 'the previous good cache must survive a bad payload',
    );
  });
}
