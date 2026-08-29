import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sharelynk/core/payload_cipher.dart';
import 'package:sharelynk/data/wifi_network.dart';

/// This fixture was produced by the REAL server code path
/// (`admin-web/src/lib/crypto.ts` → node:crypto AES-256-GCM).
/// If the Dart side ever drifts from the Node side, this test fails.
const _secret = 'shared-test-secret-1234567890';

const _blob =
    'tC0gpTP98MEzn72HSu8TQP3uhDEljKq2mpKyo2WSpg3bXmVHKsbn/VVzp6H/gphIhxSZ'
    '7nRUZvy3cr2+v1g51d5mZ/M7Jzt7iuNwI+tyOnMCxzotNrK0KMgDBgiIHu9qZiWVxyWU'
    'i4bL+JlewH7VeNmgLegUIz4pbwHZRjro3kh3WfRIw7hYaVKm9RPPFaMUWotqdI6PDR5N'
    'ATAiPuboZOZz12X77nAlfZtBuV34hIYupQNMAv69MPJZ+xmlA6/6UeHuNK8xdDLkFdsI'
    'UdanF227bVrX42m+J51YL5qy';

/// Produced by importing `admin-web/src/lib/crypto.ts` itself and calling
/// `encryptPayload(...)` — not a re-implementation. This is the strongest
/// guarantee that server and client agree.
const _realModuleBlob =
    'sKr7iuzroTDI/RTr2cSYguEOnJtrXnp1bR1oIUkSkesJwkMsK0kUXs1/gMBirZHVQ9Sz'
    'rKrRZVfS9HSVMpW9pvUX9kHVTwbbkOTnBcAYBSR0JgrT3jpxWeIIPEsG4YMEIfLg';

void main() {
  group('PayloadCipher ↔ node:crypto interop', () {
    test('decrypts output from the real crypto.ts module', () async {
      final clear = await PayloadCipher.decrypt(_realModuleBlob, _secret);
      final payload = jsonDecode(clear) as Map<String, dynamic>;
      final net = WifiNetwork.fromJson(
        (payload['networks'] as List).first as Map<String, dynamic>,
      );
      expect(net.ssid, 'Cafe_5G');
      expect(net.password, 'hunter2hunter2');
    });

    test('decrypts a payload encrypted by the server', () async {
      final clear = await PayloadCipher.decrypt(_blob, _secret);
      final payload = jsonDecode(clear) as Map<String, dynamic>;
      final networks = (payload['networks'] as List)
          .cast<Map<String, dynamic>>()
          .map(WifiNetwork.fromJson)
          .toList();

      expect(networks, hasLength(1));
      expect(networks.single.ssid, 'Cafe_5G');
      expect(networks.single.password, 'hunter2hunter2');
      expect(networks.single.name, 'Test Cafe');
      expect(networks.single.priority, 3);
      expect(networks.single.isOpen, isFalse);
    });

    test('rejects a wrong secret instead of returning garbage', () async {
      expect(
        () => PayloadCipher.decrypt(_blob, 'wrong-secret'),
        throwsA(isA<SecretBoxAuthenticationError>()),
      );
    });

    test('rejects a tampered payload', () async {
      final bytes = base64.decode(_blob);
      bytes[bytes.length - 20] ^= 0xFF; // flip a bit inside the ciphertext
      expect(
        () => PayloadCipher.decrypt(base64.encode(bytes), _secret),
        throwsA(isA<SecretBoxAuthenticationError>()),
      );
    });

    test('rejects a truncated payload', () async {
      expect(
        () => PayloadCipher.decrypt(base64.encode(List.filled(20, 0)), _secret),
        throwsA(isA<FormatException>()),
      );
    });
  });

  group('WifiNetwork', () {
    test('strips quotes and normalises SSIDs for matching', () {
      final n = WifiNetwork.fromJson({'ssid': '  "Cafe_5G" ', 'name': ''});
      expect(n.ssid, 'Cafe_5G');
      expect(n.key, 'cafe_5g');
      expect(n.displayName, 'Cafe_5G'); // falls back to SSID
    });

    test('classifies signal strength into bars', () {
      const net = WifiNetwork(
        id: '1',
        name: 'x',
        ssid: 'x',
        password: '',
        security: 'OPEN',
        area: '',
        note: '',
        priority: 0,
      );
      expect(const NearbyNetwork(network: net, level: -40).bars, 4);
      expect(const NearbyNetwork(network: net, level: -60).bars, 3);
      expect(const NearbyNetwork(network: net, level: -70).bars, 2);
      expect(const NearbyNetwork(network: net, level: -85).bars, 1);
      expect(const NearbyNetwork(network: net, level: -95).bars, 0);
    });
  });
}
