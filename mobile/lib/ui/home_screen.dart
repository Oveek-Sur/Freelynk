import 'package:app_settings/app_settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_config.dart';
import '../core/theme.dart';
import '../data/wifi_network.dart';
import '../state/app_state.dart';
import 'widgets/connect_orb.dart';
import 'widgets/network_tile.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// Guards the one automatic scan we do once networks are known.
  bool _autoScanned = false;

  @override
  void initState() {
    super.initState();
    // If a cached list already exists we can scan right away.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(libraryProvider).networks.isNotEmpty) {
        _autoScanned = true;
        ref.read(connectionProvider.notifier).scan();
      }
    });
  }

  Future<void> _refresh() async {
    await ref.read(libraryProvider.notifier).refresh();
    await ref.read(connectionProvider.notifier).scan();
  }

  @override
  Widget build(BuildContext context) {
    // First run: the cache is empty, so the initial scan had nothing to match
    // against. Fire exactly one scan the moment the first sync lands.
    ref.listen(libraryProvider, (previous, next) {
      final justArrived =
          (previous?.networks.isEmpty ?? true) && next.networks.isNotEmpty;
      if (justArrived && !_autoScanned) {
        _autoScanned = true;
        ref.read(connectionProvider.notifier).scan();
      }
    });

    final library = ref.watch(libraryProvider);
    final conn = ref.watch(connectionProvider);

    final nearbyKeys = conn.nearby.map((n) => n.network.key).toSet();
    final outOfRange =
        library.networks.where((n) => !nearbyKeys.contains(n.key)).toList();

    final connectedKey = conn.ssid == null
        ? null
        : WifiNetwork.normalizeSsid(conn.ssid!);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.backdrop),
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: _refresh,
            backgroundColor: AppColors.shelf,
            color: AppColors.foam,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
              children: [
                _Header(
                  count: library.networks.length,
                  syncing: library.loading,
                  onSync: _refresh,
                ),

                if (!AppConfig.isConfigured) const _ConfigWarning(),

                if (library.notice != null)
                  _Notice(
                    text: library.notice!,
                    onDismiss: () =>
                        ref.read(libraryProvider.notifier).dismissNotice(),
                  ),

                const SizedBox(height: 8),

                Center(
                  child: ConnectOrb(
                    phase: conn.phase,
                    hasInternet: conn.hasInternet,
                    onTap: () =>
                        ref.read(connectionProvider.notifier).autoConnect(),
                  ),
                ),

                const SizedBox(height: 18),
                _StatusLine(message: conn.message, phase: conn.phase),
                const SizedBox(height: 20),

                _ActionRow(
                  scanning: conn.scanning,
                  busy: conn.isBusy,
                  connected: conn.phase == ConnectionPhase.connected,
                  onScan: () => ref.read(connectionProvider.notifier).scan(),
                  onDisconnect: () =>
                      ref.read(connectionProvider.notifier).disconnect(),
                ),

                const SizedBox(height: 28),

                // ---------------------------------------------- in range
                _SectionLabel(
                  title: 'আশেপাশে পাওয়া গেছে',
                  trailing: conn.scanning ? 'স্ক্যান হচ্ছে…' : '${conn.nearby.length}',
                ),
                const SizedBox(height: 10),

                if (library.loading && library.networks.isEmpty)
                  const _Skeleton()
                else if (conn.nearby.isEmpty)
                  _EmptyBox(
                    icon: Icons.travel_explore_rounded,
                    text: library.networks.isEmpty
                        ? 'এখনো কোনো নেটওয়ার্ক সেভ হয়নি।\nউপরে টেনে সিঙ্ক করুন।'
                        : 'আশেপাশে সেভ করা কোনো নেটওয়ার্ক নেই।\nমানুয়ালি স্ক্যান করে দেখুন।',
                  )
                else
                  ...conn.nearby.map(
                    (n) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: NetworkTile(
                        network: n.network,
                        level: n.level,
                        isConnected: connectedKey == n.network.key,
                        disabled: conn.isBusy,
                        onConnect: () => ref
                            .read(connectionProvider.notifier)
                            .connectTo(n.network),
                      ),
                    ),
                  ),

                // ------------------------------------------ out of range
                if (outOfRange.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  _SectionLabel(
                    title: 'সেভ করা (রেঞ্জের বাইরে)',
                    trailing: '${outOfRange.length}',
                  ),
                  const SizedBox(height: 10),
                  ...outOfRange.map(
                    (n) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: NetworkTile(network: n, disabled: true),
                    ),
                  ),
                ],

                const SizedBox(height: 24),
                _Footer(syncedAt: library.syncedAt),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================== pieces

class _Header extends StatelessWidget {
  final int count;
  final bool syncing;
  final Future<void> Function() onSync;

  const _Header({
    required this.count,
    required this.syncing,
    required this.onSync,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18, top: 8),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              gradient: AppColors.accent,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: AppColors.foam.withValues(alpha: 0.28),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(
              Icons.wifi_tethering_rounded,
              color: AppColors.abyss,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'ShareLynk',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4,
                    color: AppColors.text,
                  ),
                ),
                Text(
                  '$count টি নেটওয়ার্ক সেভ আছে',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textFaint,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: syncing ? null : () => onSync(),
            tooltip: 'সিঙ্ক',
            icon: syncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.foam,
                    ),
                  )
                : const Icon(Icons.sync_rounded, color: AppColors.textDim),
          ),
        ],
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  final String message;
  final ConnectionPhase phase;

  const _StatusLine({required this.message, required this.phase});

  Color get _color => switch (phase) {
        ConnectionPhase.connected => AppColors.mint,
        ConnectionPhase.failed => AppColors.rose,
        _ => AppColors.textDim,
      };

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      child: Text(
        message,
        key: ValueKey(message),
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: _color,
          height: 1.4,
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final bool scanning;
  final bool busy;
  final bool connected;
  final VoidCallback onScan;
  final VoidCallback onDisconnect;

  const _ActionRow({
    required this.scanning,
    required this.busy,
    required this.connected,
    required this.onScan,
    required this.onDisconnect,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _PillButton(
            icon: Icons.radar_rounded,
            label: scanning ? 'স্ক্যান হচ্ছে…' : 'আবার স্ক্যান',
            onTap: busy || scanning ? null : onScan,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _PillButton(
            icon: Icons.link_off_rounded,
            label: 'ডিসকানেক্ট',
            danger: true,
            onTap: connected && !busy ? onDisconnect : null,
          ),
        ),
      ],
    );
  }
}

class _PillButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool danger;

  const _PillButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final tint = danger ? AppColors.rose : AppColors.foam;

    return Opacity(
      opacity: enabled ? 1 : 0.38,
      child: GlassCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 13),
        borderColor: tint.withValues(alpha: enabled ? 0.32 : 0.14),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 17, color: tint),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: tint,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String title;
  final String trailing;

  const _SectionLabel({required this.title, required this.trailing});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color: AppColors.textDim,
          ),
        ),
        Text(
          trailing,
          style: const TextStyle(fontSize: 12, color: AppColors.textFaint),
        ),
      ],
    );
  }
}

class _EmptyBox extends StatelessWidget {
  final IconData icon;
  final String text;

  const _EmptyBox({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.symmetric(vertical: 34, horizontal: 20),
      child: Column(
        children: [
          Icon(icon, size: 30, color: AppColors.textFaint),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textFaint,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        3,
        (_) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Container(
            height: 70,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.035),
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  final String text;
  final VoidCallback onDismiss;

  const _Notice({required this.text, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: GlassCard(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        borderColor: AppColors.amber.withValues(alpha: 0.3),
        child: Row(
          children: [
            const Icon(
              Icons.info_outline_rounded,
              size: 17,
              color: AppColors.amber,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(fontSize: 12.5, color: AppColors.textDim),
              ),
            ),
            IconButton(
              onPressed: onDismiss,
              iconSize: 16,
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.close_rounded, color: AppColors.textFaint),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConfigWarning extends StatelessWidget {
  const _ConfigWarning();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: GlassCard(
        borderColor: AppColors.rose.withValues(alpha: 0.35),
        child: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, size: 18, color: AppColors.rose),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'অ্যাপটি কনফিগার করা হয়নি। বিল্ডের সময় SYNC_BASE_URL, '
                'SYNC_CLIENT_KEY ও SYNC_SECRET দিতে হবে।',
                style: TextStyle(fontSize: 12.5, color: AppColors.textDim),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  final DateTime? syncedAt;

  const _Footer({required this.syncedAt});

  String get _label {
    if (syncedAt == null) return 'এখনো সিঙ্ক হয়নি';
    final diff = DateTime.now().difference(syncedAt!);
    if (diff.inMinutes < 1) return 'এইমাত্র সিঙ্ক হয়েছে';
    if (diff.inHours < 1) return '${diff.inMinutes} মিনিট আগে সিঙ্ক হয়েছে';
    if (diff.inDays < 1) return '${diff.inHours} ঘণ্টা আগে সিঙ্ক হয়েছে';
    return '${diff.inDays} দিন আগে সিঙ্ক হয়েছে';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          _label,
          style: const TextStyle(fontSize: 11.5, color: AppColors.textFaint),
        ),
        const SizedBox(height: 10),
        TextButton.icon(
          onPressed: () => AppSettings.openAppSettings(
            type: AppSettingsType.wifi,
          ),
          icon: const Icon(Icons.settings_rounded, size: 15),
          label: const Text('ফোনের ওয়াইফাই সেটিংস', style: TextStyle(fontSize: 12)),
          style: TextButton.styleFrom(foregroundColor: AppColors.textFaint),
        ),
      ],
    );
  }
}
