import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../data/wifi_network.dart';
import 'signal_bars.dart';

class NetworkTile extends StatelessWidget {
  final WifiNetwork network;

  /// Null when the network is saved but not currently in range.
  final int? level;
  final bool isConnected;
  final bool disabled;
  final VoidCallback? onConnect;

  const NetworkTile({
    super.key,
    required this.network,
    this.level,
    this.isConnected = false,
    this.disabled = false,
    this.onConnect,
  });

  bool get inRange => level != null;

  @override
  Widget build(BuildContext context) {
    final nearby =
        level == null ? null : NearbyNetwork(network: network, level: level!);

    return GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      borderColor: isConnected
          ? AppColors.mint.withValues(alpha: 0.45)
          : AppColors.stroke,
      onTap: disabled || isConnected ? null : onConnect,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: (isConnected ? AppColors.mint : AppColors.foam)
                  .withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              network.isOpen ? Icons.lock_open_rounded : Icons.lock_rounded,
              size: 19,
              color: isConnected ? AppColors.mint : AppColors.foam,
            ),
          ),
          const SizedBox(width: 13),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        network.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                          color: AppColors.text,
                        ),
                      ),
                    ),
                    if (isConnected) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.mint.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'যুক্ত',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: AppColors.mint,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    network.ssid,
                    if (network.area.isNotEmpty) network.area,
                    if (nearby != null) nearby.strengthLabel,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textFaint,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 10),

          if (nearby != null)
            SignalBars(bars: nearby.bars)
          else
            const Text(
              'রেঞ্জে নেই',
              style: TextStyle(fontSize: 11, color: AppColors.textFaint),
            ),

          if (inRange && !isConnected) ...[
            const SizedBox(width: 10),
            Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: disabled ? AppColors.textFaint : AppColors.foam,
            ),
          ],
        ],
      ),
    );
  }
}
