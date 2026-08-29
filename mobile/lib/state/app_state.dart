import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/content.dart';
import '../data/content_repository.dart';
import '../data/network_repository.dart';
import '../data/wifi_network.dart';
import '../services/wifi_connector.dart';

final repositoryProvider = Provider((_) => NetworkRepository());
final connectorProvider = Provider((_) => WifiConnector());
final contentRepositoryProvider = Provider((_) => ContentRepository());

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

  const ConnectionState({
    this.phase = ConnectionPhase.idle,
    this.message = 'কানেক্ট করতে প্রস্তুত',
    this.ssid,
    this.hasInternet = false,
    this.nearby = const [],
    this.scanning = false,
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
  }) {
    return ConnectionState(
      phase: phase ?? this.phase,
      message: message ?? this.message,
      ssid: clearSsid ? null : (ssid ?? this.ssid),
      hasInternet: hasInternet ?? this.hasInternet,
      nearby: nearby ?? this.nearby,
      scanning: scanning ?? this.scanning,
    );
  }
}

class ConnectionController extends StateNotifier<ConnectionState> {
  final WifiConnector _wifi;
  final Ref _ref;
  Timer? _watchdog;

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
    super.dispose();
  }

  List<WifiNetwork> get _saved => _ref.read(libraryProvider).networks;

  /// Keeps the UI honest if the user leaves the area or toggles WiFi manually.
  Future<void> _syncCurrentStatus() async {
    if (state.isBusy) return;

    final ssid = await _wifi.currentSsid();
    if (!mounted) return;

    if (ssid == null) {
      _ticksSinceProbe = 0;
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
          message: blocker,
        );
        return;
      }

      final nearby = await _wifi.scanFor(_saved);
      if (!mounted) return;

      state = state.copyWith(
        nearby: nearby,
        scanning: false,
        message: nearby.isEmpty
            ? 'আশেপাশে সেভ করা কোনো নেটওয়ার্ক নেই'
            : '${nearby.length} টি নেটওয়ার্ক পাওয়া গেছে',
      );
    } on WifiException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        scanning: false,
        phase: ConnectionPhase.failed,
        message: e.message,
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
      state = state.copyWith(phase: ConnectionPhase.failed, message: blocker);
      return;
    }

    state = state.copyWith(
      phase: ConnectionPhase.scanning,
      message: 'আশেপাশে খোঁজা হচ্ছে…',
    );

    late List<NearbyNetwork> candidates;
    try {
      candidates = await _wifi.scanFor(_saved);
    } on WifiException catch (e) {
      state = state.copyWith(phase: ConnectionPhase.failed, message: e.message);
      return;
    }

    if (!mounted) return;
    state = state.copyWith(nearby: candidates);

    if (candidates.isEmpty) {
      state = state.copyWith(
        phase: ConnectionPhase.failed,
        message: 'আশেপাশে সেভ করা কোনো নেটওয়ার্ক পাওয়া যায়নি।',
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
        await _wifi.connect(candidate.network);
      } catch (_) {
        continue; // try the next one
      }
      if (!mounted) return;

      final online = await _wifi.hasInternet();
      if (!mounted) return;

      if (online) {
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

  Future<void> connectTo(WifiNetwork network) async {
    if (state.isBusy) return;

    state = state.copyWith(
      phase: ConnectionPhase.preparing,
      message: 'প্রস্তুত হচ্ছে…',
    );

    final blocker = await _wifi.ensureReady();
    if (blocker != null) {
      state = state.copyWith(phase: ConnectionPhase.failed, message: blocker);
      return;
    }

    state = state.copyWith(
      phase: ConnectionPhase.connecting,
      message: 'কানেক্ট করছি: ${network.displayName}…',
    );

    try {
      await _wifi.connect(network);
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
    await _wifi.disconnect();
    if (!mounted) return;
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
