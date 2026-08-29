import 'package:flutter/material.dart';

import '../../core/theme.dart';

class SignalBars extends StatelessWidget {
  final int bars; // 0..4
  final double size;

  const SignalBars({super.key, required this.bars, this.size = 18});

  Color get _color => switch (bars) {
        >= 3 => AppColors.mint,
        2 => AppColors.amber,
        _ => AppColors.rose,
      };

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: size,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: List.generate(4, (i) {
          final filled = i < bars;
          return Padding(
            padding: const EdgeInsets.only(right: 2.5),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: size * 0.18,
              height: size * (0.34 + i * 0.22),
              decoration: BoxDecoration(
                color: filled ? _color : AppColors.textFaint.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(size * 0.09),
              ),
            ),
          );
        }),
      ),
    );
  }
}
