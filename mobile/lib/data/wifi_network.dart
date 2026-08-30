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

  /// The SSID exactly as the radio reported it, capitals and all.
  ///
  /// Matching a scan result against the saved list is deliberately
  /// case-insensitive (see [WifiNetwork.normalizeSsid]) — whoever types the
  /// network into the admin panel rarely reproduces the router's capitals.
  /// Joining is the opposite: an SSID is a byte string, so Android will never
  /// associate with `supti & oveek` when the access point announces
  /// `Supti & oveek`. Connecting with the database's spelling therefore fails
  /// silently, which is exactly what happened on the first real handset.
  ///
  /// So we keep what was actually on the air and connect with that.
  final String? onAirSsid;

  /// What the access point advertised, e.g. "[RSN-SAE-CCMP][ESS]".
  ///
  /// Kept so the app can say which generation of security a network uses
  /// instead of trusting whatever was typed into the admin panel — the
  /// router is the authority on what it will accept.
  final String? capabilities;

  const NearbyNetwork({
    required this.network,
    required this.level,
    this.onAirSsid,
    this.capabilities,
  });

  /// A short, readable name for the security in use.
  ///
  /// WPA2 and WPA3 both appear on a transition-mode router, which is
  /// common and worth showing as such rather than picking one.
  String get securityLabel {
    final caps = (capabilities ?? '').toUpperCase();
    if (caps.isEmpty) return 'অজানা';

    final parts = <String>[
      if (caps.contains('SAE')) 'WPA3',
      if (caps.contains('PSK')) 'WPA2',
      if (caps.contains('WEP')) 'WEP',
      if (caps.contains('OWE')) 'OWE',
    ];
    if (parts.isEmpty) return 'খোলা';
    return parts.join('/');
  }

  /// The SSID to hand to Android. Falls back to the stored spelling when the
  /// network was not seen in a scan (manual connect from the saved list).
  String get connectSsid =>
      (onAirSsid != null && onAirSsid!.isNotEmpty) ? onAirSsid! : network.ssid;

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
