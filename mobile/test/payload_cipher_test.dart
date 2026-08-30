import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:freelynk/core/payload_cipher.dart';
import 'package:freelynk/data/content.dart';
import 'package:freelynk/data/wifi_network.dart';

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

    test('joins with the SSID the radio broadcast, not the stored one', () {
      // Found on a real handset: the admin panel held "supti & oveek" while
      // the router announced "Supti & oveek". Matching is case-insensitive so
      // the network showed up in the list, but Android compares SSIDs byte
      // for byte, so every connect attempt silently went nowhere.
      final saved = WifiNetwork.fromJson({
        'ssid': 'supti & oveek',
        'name': 'Home',
      });
      const onAir = 'Supti & oveek';

      // It still matches the scan result...
      expect(saved.key, WifiNetwork.normalizeSsid(onAir));

      // ...but we must hand Android the broadcast spelling.
      final seen = NearbyNetwork(network: saved, level: -50, onAirSsid: onAir);
      expect(seen.connectSsid, onAir);
      expect(seen.connectSsid, isNot(saved.ssid));
    });

    test('reads the security an access point actually advertises', () {
      const net = WifiNetwork(
        id: '1', name: 'n', ssid: 'n', password: 'p',
        security: 'WPA', area: '', note: '', priority: 0,
      );
      String label(String caps) =>
          NearbyNetwork(network: net, level: -50, capabilities: caps)
              .securityLabel;

      // The generation the stored 'security' column cannot express. This is
      // the case that made a shop's router spin forever: a WPA2-only
      // passphrase can never match it.
      expect(label('[RSN-SAE-CCMP][ESS]'), 'WPA3');

      expect(label('[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]'), 'WPA2');

      // Transition mode is common and belongs to both, so it is reported as
      // both rather than the code picking one and being wrong half the time.
      expect(label('[RSN-PSK+SAE-CCMP][ESS]'), 'WPA3/WPA2');

      expect(label('[WEP][ESS]'), 'WEP');
      expect(label('[RSN-OWE-CCMP][ESS]'), 'OWE');
      expect(label('[ESS]'), 'খোলা');

      // Never seen in a scan: say so instead of guessing "open", which
      // would invite a connection attempt with no password.
      expect(label(''), 'অজানা');
    });

    test('shop search looks at the name, the stock and the address', () {
      final grocer = Shop.tryParse({
        'name': 'রহিম স্টোর',
        'sells': 'চাল, ডাল, তেল',
        'address': 'মিরপুর ১০',
      })!;
      final pharmacy = Shop.tryParse({
        'name': 'Popular Pharmacy',
        'sells': 'ওষুধ',
        'address': 'ধানমন্ডি',
      })!;

      // By name, in either script.
      expect(grocer.matches('রহিম'), isTrue);
      expect(pharmacy.matches('popular'), isTrue);

      // By what they sell — the whole point, since someone wanting rice does
      // not know which shop stocks it.
      expect(grocer.matches('চাল'), isTrue);
      expect(pharmacy.matches('ওষুধ'), isTrue);
      expect(pharmacy.matches('চাল'), isFalse);

      // By address.
      expect(grocer.matches('মিরপুর'), isTrue);

      // Case-insensitive, and blank matches everything.
      expect(pharmacy.matches('POPULAR'), isTrue);
      expect(grocer.matches('   '), isTrue);
    });

    test('every search word must match, so terms narrow rather than widen', () {
      final grocer = Shop.tryParse({
        'name': 'রহিম স্টোর',
        'sells': 'চাল, ডাল',
        'address': 'মিরপুর ১০',
      })!;

      // Both words hit: one the stock, one the address.
      expect(grocer.matches('চাল মিরপুর'), isTrue);
      // Second word hits nothing, so the shop drops out.
      expect(grocer.matches('চাল ধানমন্ডি'), isFalse);
    });

    test('falls back to the stored SSID when the network was not scanned', () {
      final saved = WifiNetwork.fromJson({'ssid': 'Cafe_5G', 'name': ''});

      expect(NearbyNetwork(network: saved, level: -50).connectSsid, 'Cafe_5G');
      // An empty reading must not blank out the SSID we do have.
      expect(
        NearbyNetwork(network: saved, level: -50, onAirSsid: '').connectSsid,
        'Cafe_5G',
      );
    });
  });
}
