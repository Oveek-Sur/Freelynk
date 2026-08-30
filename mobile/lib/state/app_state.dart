import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/content.dart';
import '../data/content_repository.dart';
import '../data/network_repository.dart';
import '../data/usage_reporter.dart';
import '../data/wifi_network.dart';
import '../services/keep_alive.dart';
import '../services/wifi_connector.dart';

final repositoryProvider = Provider((_) => NetworkRepository());
final connectorProvider = Provider((_) => WifiConnector());
final contentRepositoryProvider = Provider((_) => ContentRepository());
final keepAliveProvider = Provider((_) => KeepAlive());

// ============================================================ content

/// Banners + partner shops. Online only, by design.
class ContentState {
  final AppContent content;
  final bool loading;
  final String? error;

  const ContentState({
    this.content = const AppContent(),
    this.loading = false,
    this.error,
  });

  List<AppBanner> get banners => content.banners;
  List<Shop> get shops => content.shops;
}

class ContentController extends StateNotifier<ContentState> {
  final ContentRepository _repo;

  ContentController(this._repo) : super(const ContentState(loading: true)) {
    unawaited(refresh());
  }

  Future<void> refresh() async {
    state = ContentState(content: state.content, loading: true);

    final result = await _repo.fetch();
    if (!mounted) return;

    state = ContentState(
      // Keep whatever we already had if this attempt failed, so a dropped
      // connection doesn't blank out a banner the user was looking at.
      content: result.error == null ? result.content : state.content,
      loading: false,
      error: result.error,
    );
  }
}

final contentProvider =
    StateNotifierProvider<ContentController, ContentState>((ref) {
  return ContentController(ref.watch(contentRepositoryProvider));
});

// ============================================================ library

class LibraryState {
  final List<WifiNetwork> networks;
  final DateTime? syncedAt;
  final bool loading;
  final String? notice;

  const LibraryState({
    this.networks = const [],
    this.syncedAt,
    this.loading = false,
    this.notice,
  });

  LibraryState copyWith({
    List<WifiNetwork>? networks,
    DateTime? syncedAt,
    bool? loading,
    String? notice,
    bool clearNotice = false,
  }) {
    return LibraryState(
      networks: networks ?? this.networks,
      syncedAt: syncedAt ?? this.syncedAt,
      loading: loading ?? this.loading,
      notice: clearNotice ? null : (notice ?? this.notice),
    );
  }
}

class LibraryController extends StateNotifier<LibraryState> {
  final NetworkRepository _repo;

  LibraryController(this._repo) : super(const LibraryState(loading: true)) {
    _boot();
  }

  /// Show the offline copy immediately, then quietly refresh from the server.
  Future<void> _boot() async {
    final cached = await _repo.loadCached();
    state = LibraryState(
      networks: cached.networks,
      syncedAt: cached.syncedAt,
      loading: false,
    );
    unawaited(refresh(silent: true));

    // Fire and forget: it must never delay the list appearing, and a
    // statistic failing to file is not the user's problem.
    unawaited(UsageReporter().reportIfNewDay());
  }

  Future<void> refresh({bool silent = false}) async {
    if (!silent) state = state.copyWith(loading: true, clearNotice: true);

    final result = await _repo.sync();
    if (!mounted) return;

    state = LibraryState(
      networks: result.networks,
      syncedAt: result.syncedAt ?? state.syncedAt,
      loading: false,
      notice: result.error,
    );
  }

  void dismissNotice() => state = state.copyWith(clearNotice: true);
}

final libraryProvider =
    StateNotifierProvider<LibraryController, LibraryState>((ref) {
  return LibraryController(ref.watch(repositoryProvider));
});

// ========================================================= connection

enum ConnectionPhase { idle, preparing, scanning, connecting, connected, failed }

class ConnectionState {
  final ConnectionPhase phase;
  final String message;
  final String? ssid;
  final bool hasInternet;
  final List<NearbyNetwork> nearby;
  final bool scanning;

  /// Set when something the user can fix is stopping a scan — location
  /// switched off, a permission refused. Carried separately from [message]
  /// so the UI can offer the button that clears it instead of only saying
  /// what is wrong.
  final WifiBlocker? blocker;

  const ConnectionState({
    this.phase = ConnectionPhase.idle,
    this.message = 'কানেক্ট করতে প্রস্তুত',
    this.ssid,
    this.hasInternet = false,
    this.nearby = const [],
    this.scanning = false,
    this.blocker,
  });

  bool get isBusy =>
      phase == ConnectionPhase.preparing ||
      phase == ConnectionPhase.scanning ||
      phase == ConnectionPhase.connecting;

  ConnectionState copyWith({
    ConnectionPhase? phase,
    String? message,
    String? ssid,
    bool? hasInternet,
    List<NearbyNetwork>? nearby,
    bool? scanning,
    bool clearSsid = false,
    WifiBlocker? blocker,
    bool clearBlocker = false,
  }) {
    return ConnectionState(
      phase: phase ?? this.phase,
      message: message ?? this.message,
      ssid: clearSsid ? null : (ssid ?? this.ssid),
      hasInternet: hasInternet ?? this.hasInternet,
      nearby: nearby ?? this.nearby,
      scanning: scanning ?? this.scanning,
      blocker: clearBlocker ? null : (blocker ?? this.blocker),
    );
  }
}

class ConnectionController extends StateNotifier<ConnectionState> {
  final WifiConnector _wifi;
  final Ref _ref;
  Timer? _watchdog;

  KeepAlive get _keepAlive => _ref.read(keepAliveProvider);

  /// Tracks what we last told the service, so a connection that survives for
  /// hours does not restart the service on every six-second tick.
  String? _keepAliveSsid;

  /// Holds the process open while we are on a network, and lets go the moment
  /// we are not. Safe to call repeatedly.
  void _syncKeepAlive(String? ssid) {
    if (ssid == _keepAliveSsid) return;
    _keepAliveSsid = ssid;

    if (ssid == null) {
      unawaited(_keepAlive.stop());
    } else {
      unawaited(_keepAlive.start(ssid));
    }
  }

  /// Ticks since the last reachability probe. Checking the SSID is free;
  /// hitting the network every 6s would burn battery and mobile data.
  int _ticksSinceProbe = 0;
  static const _ticksPerProbe = 5; // ~30s

  ConnectionController(this._wifi, this._ref) : super(const ConnectionState()) {
    _syncCurrentStatus();
    _watchdog = Timer.periodic(
      const Duration(seconds: 6),
      (_) => _syncCurrentStatus(),
    );
  }

  @override
  void dispose() {
    _watchdog?.cancel();
    // Deliberately does NOT stop the keep-alive service. The whole point is
    // that closing the UI leaves the connection up; only the user ends it,
    // from the notification, from Disconnect, or by uninstalling.
    super.dispose();
  }

  List<WifiNetwork> get _saved => _ref.read(libraryProvider).networks;

  /// Keeps the UI honest if the user leaves the area or toggles WiFi manually.
  Future<void> _syncCurrentStatus() async {
    if (state.isBusy) return;

    final ssid = await _wifi.currentSsid();
    if (!mounted) return;

    if (ssid == null) {
      // A null SSID does NOT mean we fell off the network. Android redacts
      // it for backgrounded apps, so this fires constantly while the app sits
      // behind another one — and acting on it would announce a phantom
      // disconnect and stop the keep-alive service, dropping the very
      // connection it exists to protect. Ask the radio before believing it.
      if (await _wifi.isOnWifi()) return;
      if (!mounted) return;

      _ticksSinceProbe = 0;
      // Genuinely off WiFi: nothing left to hold the process open for.
      _syncKeepAlive(null);
      if (state.phase == ConnectionPhase.connected) {
        state = state.copyWith(
          phase: ConnectionPhase.idle,
          message: 'সংযোগ বিচ্ছিন্ন হয়েছে',
          hasInternet: false,
          clearSsid: true,
        );
      }
      return;
    }

    final known = _saved.any((n) => n.key == WifiNetwork.normalizeSsid(ssid));
    if (!known) return;

    _syncKeepAlive(ssid);

    // The SSID reading above is local and cheap. Only reach out to the
    // network occasionally, or the moment we notice a different SSID.
    final ssidChanged = state.ssid != ssid;
    _ticksSinceProbe++;

    if (!ssidChanged && _ticksSinceProbe < _ticksPerProbe) {
      if (state.phase != ConnectionPhase.connected) {
        state = state.copyWith(phase: ConnectionPhase.connected, ssid: ssid);
      }
      return;
    }

    _ticksSinceProbe = 0;
    final online = await _wifi.hasInternet();
    if (!mounted) return;

    state = state.copyWith(
      phase: ConnectionPhase.connected,
      ssid: ssid,
      hasInternet: online,
      message: online ? '$ssid — ইন্টারনেট চালু' : '$ssid — ইন্টারনেট পাওয়া যাচ্ছে না',
    );
  }

  // ------------------------------------------------------------ scanning

  Future<void> scan() async {
    if (state.scanning) return;
    state = state.copyWith(scanning: true);

    try {
      final blocker = await _wifi.ensureReady();
      if (blocker != null) {
        state = state.copyWith(
          scanning: false,
          phase: ConnectionPhase.failed,
          message: blocker.message,
          blocker: blocker,
        );
        return;
      }

      final result = await _wifi.scanFor(_saved);
      if (!mounted) return;

      state = state.copyWith(
        nearby: result.nearby,
        scanning: false,
        clearBlocker: true,
        message: result.nearby.isNotEmpty
            ? '${result.nearby.length} টি নেটওয়ার্ক পাওয়া গেছে'
            // Saying how many were seen turns "nothing happened" into an
            // answer: none at all points at the radio or the place, while
            // a dozen means the list simply has none of them.
            : result.seen == 0
                ? 'আশেপাশে কোনো ওয়াইফাই-ই পাওয়া গেল না'
                : 'আশেপাশে ${result.seen} টি ওয়াইফাই আছে, '
                    'কিন্তু সেভ করা কোনোটি নেই',
      );
    } on WifiException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        scanning: false,
        phase: ConnectionPhase.failed,
        message: e.message,
        blocker: e.blocker,
        clearBlocker: e.blocker == null,
      );
    } catch (_) {
      if (!mounted) return;
      state = state.copyWith(
        scanning: false,
        phase: ConnectionPhase.failed,
        message: 'স্ক্যান ব্যর্থ হয়েছে।',
      );
    }
  }

  // --------------------------------------------------------- auto connect

  /// Scan, then walk the candidates strongest-first until one actually
  /// gives us internet.
  Future<void> autoConnect() async {
    if (state.isBusy) return;

    if (_saved.isEmpty) {
      state = state.copyWith(
        phase: ConnectionPhase.failed,
        message: 'কোনো নেটওয়ার্ক সেভ নেই। সিঙ্ক করুন।',
      );
      return;
    }

    state = state.copyWith(
      phase: ConnectionPhase.preparing,
      message: 'প্রস্তুত হচ্ছে…',
    );

    final blocker = await _wifi.ensureReady();
    if (blocker != null) {
      state = state.copyWith(
        phase: ConnectionPhase.failed,
        message: blocker.message,
        blocker: blocker,
      );
      return;
    }

    state = state.copyWith(
      phase: ConnectionPhase.scanning,
      message: 'আশেপাশে খোঁজা হচ্ছে…',
      clearBlocker: true,
    );

    late ({List<NearbyNetwork> nearby, int seen}) scan;
    try {
      scan = await _wifi.scanFor(_saved);
    } on WifiException catch (e) {
      state = state.copyWith(
        phase: ConnectionPhase.failed,
        message: e.message,
        blocker: e.blocker,
        clearBlocker: e.blocker == null,
      );
      return;
    }

    if (!mounted) return;
    final candidates = scan.nearby;
    state = state.copyWith(nearby: candidates);

    if (candidates.isEmpty) {
      state = state.copyWith(
        phase: ConnectionPhase.failed,
        message: scan.seen == 0
            ? 'আশেপাশে কোনো ওয়াইফাই-ই পাওয়া গেল না। '
                'রাউটার চালু আছে কিনা দেখুন।'
            : 'আশেপাশে ${scan.seen} টি ওয়াইফাই আছে, কিন্তু সেভ করা কোনোটি নেই।',
      );
      return;
    }

    for (var i = 0; i < candidates.length; i++) {
      final candidate = candidates[i];
      state = state.copyWith(
        phase: ConnectionPhase.connecting,
        message: 'কানেক্ট করছি: ${candidate.network.displayName}'
            '${candidates.length > 1 ? ' (${i + 1}/${candidates.length})' : ''}',
      );

      try {
        // Join with the spelling the radio just reported, not the one typed
        // into the admin panel — Android matches SSIDs byte for byte.
        await _wifi.connect(
          candidate.network,
          onAirSsid: candidate.onAirSsid,
        );
      } catch (_) {
        continue; // try the next one
      }
      if (!mounted) return;

      final online = await _wifi.hasInternet();
      if (!mounted) return;

      if (online) {
        _syncKeepAlive(candidate.connectSsid);
        state = state.copyWith(
          phase: ConnectionPhase.connected,
          ssid: candidate.network.ssid,
          hasInternet: true,
          message: '${candidate.network.displayName} — কানেক্টেড',
        );
        return;
      }
      // Joined but no internet: keep looking.
    }

    state = state.copyWith(
      phase: ConnectionPhase.failed,
      message: 'কোনো নেটওয়ার্কেই ইন্টারনেট পাওয়া গেল না।',
    );
  }

  // ------------------------------------------------------- manual connect

  Future<void> connectTo(WifiNetwork network, {String? onAirSsid}) async {
    if (state.isBusy) return;

    state = state.copyWith(
      phase: ConnectionPhase.preparing,
      message: 'প্রস্তুত হচ্ছে…',
    );

    final blocker = await _wifi.ensureReady();
    if (blocker != null) {
      state = state.copyWith(
        phase: ConnectionPhase.failed,
        message: blocker.message,
        blocker: blocker,
      );
      return;
    }

    state = state.copyWith(
      phase: ConnectionPhase.connecting,
      message: 'কানেক্ট করছি: ${network.displayName}…',
      clearBlocker: true,
    );

    // Prefer the caller's reading, then anything the last scan saw. Falling
    // back to the stored SSID is a last resort: it only works when the admin
    // panel's capitalisation happens to match the router's.
    final onAir = onAirSsid ??
        state.nearby
            .where((n) => n.network.key == network.key)
            .map((n) => n.onAirSsid)
            .firstWhere((s) => s != null, orElse: () => null);

    try {
      await _wifi.connect(network, onAirSsid: onAir);
    } on WifiException catch (e) {
      if (!mounted) return;
      state = state.copyWith(phase: ConnectionPhase.failed, message: e.message);
      return;
    } catch (_) {
      if (!mounted) return;
      state = state.copyWith(
        phase: ConnectionPhase.failed,
        message: 'কানেক্ট করা যায়নি।',
      );
      return;
    }

    if (!mounted) return;
    final online = await _wifi.hasInternet();
    if (!mounted) return;

    _syncKeepAlive(onAir ?? network.ssid);

    state = state.copyWith(
      phase: ConnectionPhase.connected,
      ssid: network.ssid,
      hasInternet: online,
      message: online
          ? '${network.displayName} — কানেক্টেড'
          : '${network.displayName} — যুক্ত, কিন্তু ইন্টারনেট নেই',
    );
  }

  Future<void> disconnect() async {
    // Let go of the process first: the user asked to stop, so the persistent
    // notification should not outlive the tap.
    _syncKeepAlive(null);
    final left = await _wifi.disconnect();
    if (!mounted) return;

    if (!left) {
      // Android refuses to let an app drop a network the user saved in the
      // phone's own settings. Saying so beats a button that appears dead.
      state = state.copyWith(
        phase: ConnectionPhase.connected,
        message: 'এই নেটওয়ার্কটি ফোনে সেভ করা — ফোনের ওয়াইফাই সেটিংস '
            'থেকে বন্ধ করতে হবে।',
      );
      return;
    }

    state = state.copyWith(
      phase: ConnectionPhase.idle,
      message: 'সংযোগ বন্ধ করা হয়েছে',
      hasInternet: false,
      clearSsid: true,
    );
  }
}

final connectionProvider =
    StateNotifierProvider<ConnectionController, ConnectionState>((ref) {
  return ConnectionController(ref.watch(connectorProvider), ref);
});
