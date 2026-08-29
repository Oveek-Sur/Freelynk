import 'dart:convert';

import 'package:cryptography/cryptography.dart';

/// Mirror of `admin-web/src/lib/crypto.ts`.
///
///   key   = SHA-256(secret)
///   blob  = base64( iv(12) || ciphertext || tag(16) )
///
/// AES-256-GCM is authenticated: a wrong secret or a tampered payload
/// throws instead of returning garbage.
class PayloadCipher {
  const PayloadCipher._();

  static const int _nonceLength = 12;
  static const int _macLength = 16;

  static final AesGcm _aes = AesGcm.with256bits(nonceLength: _nonceLength);

  static Future<SecretKey> _deriveKey(String secret) async {
    final digest = await Sha256().hash(utf8.encode(secret));
    return SecretKey(digest.bytes);
  }

  static Future<String> decrypt(String base64Blob, String secret) async {
    final raw = base64.decode(base64Blob);

    if (raw.length <= _nonceLength + _macLength) {
      throw const FormatException('Encrypted payload is too short.');
    }

    final box = SecretBox(
      raw.sublist(_nonceLength, raw.length - _macLength),
      nonce: raw.sublist(0, _nonceLength),
      mac: Mac(raw.sublist(raw.length - _macLength)),
    );

    final clear = await _aes.decrypt(box, secretKey: await _deriveKey(secret));
    return utf8.decode(clear);
  }
}
