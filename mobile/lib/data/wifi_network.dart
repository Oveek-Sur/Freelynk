/// A WiFi network published from the admin panel.
class WifiNetwork {
  final String id;
  final String name;
  final String ssid;
  final String password;
  final String security; // WPA | WEP | OPEN
  final String area;
  final String note;
  final int priority;

  const WifiNetwork({
    required this.id,
    required this.name,
    required this.ssid,
    required this.password,
    required this.security,
    required this.area,
    required this.note,
    required this.priority,
  });

  bool get isOpen => security.toUpperCase() == 'OPEN';

  /// Normalised key used for matching against scan results.
  String get key => normalizeSsid(ssid);

  static String normalizeSsid(String raw) =>
      raw.replaceAll('"', '').replaceAll("'", '').trim().toLowerCase();

  factory WifiNetwork.fromJson(Map<String, dynamic> json) {
    return WifiNetwork(
      id: (json['id'] ?? '').toString(),
      ssid: (json['ssid'] ?? '').toString().replaceAll('"', '').trim(),
      name: (json['name'] ?? '').toString().trim(),
      password: (json['password'] ?? '').toString(),
      security: (json['security'] ?? 'WPA').toString().toUpperCase(),
      area: (json['area'] ?? '').toString(),
      note: (json['note'] ?? '').toString(),
      priority: int.tryParse('${json['priority'] ?? 0}') ?? 0,
    );
  }

  String get displayName => name.isNotEmpty ? name : ssid;
}

/// A saved network that the radio can currently see.
class NearbyNetwork {
  final WifiNetwork network;

  /// RSSI in dBm, e.g. -55. Lower is weaker.
  final int level;

  const NearbyNetwork({required this.network, required this.level});

  /// 0-4 bars.
  int get bars {
    if (level >= -55) return 4;
    if (level >= -67) return 3;
    if (level >= -78) return 2;
    if (level >= -88) return 1;
    return 0;
  }

  String get strengthLabel => switch (bars) {
        4 => 'চমৎকার',
        3 => 'ভালো',
        2 => 'মোটামুটি',
        1 => 'দুর্বল',
        _ => 'খুব দুর্বল',
      };
}
