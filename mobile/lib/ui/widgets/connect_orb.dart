import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../state/app_state.dart';

/// The big tap target. Pulses while working, glows green when connected.
class ConnectOrb extends StatefulWidget {
  final ConnectionPhase phase;
  final bool hasInternet;
  final VoidCallback onTap;

  const ConnectOrb({
    super.key,
    required this.phase,
    required this.hasInternet,
    required this.onTap,
  });

  @override
  State<ConnectOrb> createState() => _ConnectOrbState();
}

class _ConnectOrbState extends State<ConnectOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _busy =>
      widget.phase == ConnectionPhase.preparing ||
      widget.phase == ConnectionPhase.scanning ||
      widget.phase == ConnectionPhase.connecting;

  bool get _connected => widget.phase == ConnectionPhase.connected;

  Color get _tint {
    if (_connected) {
      return widget.hasInternet ? AppColors.mint : AppColors.amber;
    }
    if (widget.phase == ConnectionPhase.failed) return AppColors.rose;
    return AppColors.foam;
  }

  IconData get _icon {
    if (_connected) return Icons.wifi_rounded;
    if (widget.phase == ConnectionPhase.failed) return Icons.wifi_off_rounded;
    return Icons.wifi_find_rounded;
  }

  String get _caption => switch (widget.phase) {
        ConnectionPhase.connected => 'কানেক্টেড',
        ConnectionPhase.preparing => 'প্রস্তুত হচ্ছে',
        ConnectionPhase.scanning => 'খোঁজা হচ্ছে',
        ConnectionPhase.connecting => 'কানেক্ট হচ্ছে',
        ConnectionPhase.failed => 'আবার চেষ্টা করুন',
        ConnectionPhase.idle => 'অটো কানেক্ট',
      };

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _busy ? null : widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 236,
        height: 236,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return CustomPaint(
              painter: _OrbPainter(
                progress: _controller.value,
                tint: _tint,
                animate: _busy || _connected,
                sweeping: _busy,
              ),
              child: child,
            );
          },
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: Icon(
                    _icon,
                    key: ValueKey(_icon),
                    size: 52,
                    color: _tint,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _caption,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: _tint,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OrbPainter extends CustomPainter {
  final double progress;
  final Color tint;
  final bool animate;
  final bool sweeping;

  _OrbPainter({
    required this.progress,
    required this.tint,
    required this.animate,
    required this.sweeping,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final baseRadius = size.width * 0.30;

    // Expanding ripples
    if (animate) {
      for (var i = 0; i < 3; i++) {
        final t = (progress + i / 3) % 1.0;
        final radius = baseRadius + (size.width * 0.20) * t;
        final paint = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..color = tint.withValues(alpha: (1 - t) * 0.35);
        canvas.drawCircle(center, radius, paint);
      }
    }

    // Soft halo
    canvas.drawCircle(
      center,
      baseRadius + 10,
      Paint()
        ..shader = RadialGradient(
          colors: [tint.withValues(alpha: 0.22), Colors.transparent],
        ).createShader(
          Rect.fromCircle(center: center, radius: baseRadius + 26),
        ),
    );

    // Core disc
    canvas.drawCircle(
      center,
      baseRadius,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.shelf.withValues(alpha: 0.95),
            AppColors.deep.withValues(alpha: 0.95),
          ],
        ).createShader(Rect.fromCircle(center: center, radius: baseRadius)),
    );

    // Static rim
    canvas.drawCircle(
      center,
      baseRadius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = tint.withValues(alpha: 0.28),
    );

    // Rotating arc while working
    if (sweeping) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: baseRadius),
        progress * 2 * math.pi,
        math.pi * 0.55,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..strokeCap = StrokeCap.round
          ..color = tint,
      );
    }
  }

  @override
  bool shouldRepaint(_OrbPainter old) =>
      old.progress != progress ||
      old.tint != tint ||
      old.animate != animate ||
      old.sweeping != sweeping;
}
