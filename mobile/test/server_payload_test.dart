import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:freelynk/core/payload_cipher.dart';

/// Cross-language check: bytes produced by the Node server must decrypt with
/// the Dart cipher. AES-GCM implementations disagree in exactly the places
/// that are easy to get wrong — nonce placement, tag position, key
/// derivation — and a mismatch would only show up on a real device.
///
/// The fixture carries the live SYNC_SECRET so it is git-ignored. Generate it
/// with the dev server running:
///
///   cd admin-web && node scripts/make-fixture.mjs
void main() {
  final file = File('test/fixtures/server_payload.json');

  if (!file.existsSync()) {
    // Nothing to verify on a machine that has not generated the fixture.
    test('server payload fixture', () {}, skip: 'run admin-web/scripts/make-fixture.mjs first');
    return;
  }

  final fixture = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;

  test('decrypts a real /api/sync response from the Node server', () async {
    final plain = await PayloadCipher.decrypt(
      fixture['data'] as String,
      fixture['secret'] as String,
    );

    final decoded = jsonDecode(plain) as Map<String, dynamic>;
    final networks = (decoded['networks'] as List).cast<Map<String, dynamic>>();

    final match = networks.firstWhere(
      (n) => n['ssid'] == fixture['expectSsid'],
      orElse: () => throw StateError('fixture network missing from payload'),
    );

    expect(match['password'], fixture['expectPassword']);
  });

  test('a wrong secret is rejected rather than silently returning junk', () async {
    await expectLater(
      PayloadCipher.decrypt(fixture['data'] as String, 'not-the-real-secret'),
      throwsA(isA<Exception>()),
    );
  });
}
