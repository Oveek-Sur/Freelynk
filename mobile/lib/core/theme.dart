import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppColors {
  const AppColors._();

  static const abyss = Color(0xFF00131F);
  static const deep = Color(0xFF001B2E);
  static const shelf = Color(0xFF012A45);
  static const foam = Color(0xFF38BDF8);
  static const glow = Color(0xFF22D3EE);
  static const mint = Color(0xFF34D399);
  static const amber = Color(0xFFFBBF24);
  static const rose = Color(0xFFFB7185);

  static const text = Color(0xFFE2F2FF);
  static const textDim = Color(0x99E2F2FF);
  static const textFaint = Color(0x59E2F2FF);

  static const stroke = Color(0x2494D2FF);

  static const backdrop = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF00131F), Color(0xFF001B2E), Color(0xFF00131F)],
  );

  static const accent = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [foam, glow],
  );
}

class AppTheme {
  const AppTheme._();

  /// Light icons over transparent system bars.
  ///
  /// The navigation bar is transparent rather than painted [AppColors.abyss].
  /// From Android 15 an app targeting SDK 35 always draws edge to edge and
  /// the bar colour is ignored, so asking for a solid one would be a request
  /// the OS quietly drops — matching on older phones and not on newer ones.
  /// Letting the page's own gradient run underneath looks right on both.
  static const systemOverlay = SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarIconBrightness: Brightness.light,
    systemNavigationBarDividerColor: Colors.transparent,
  );

  static ThemeData get dark {
    const scheme = ColorScheme.dark(
      primary: AppColors.foam,
      secondary: AppColors.glow,
      surface: AppColors.deep,
      error: AppColors.rose,
      onPrimary: AppColors.abyss,
      onSurface: AppColors.text,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.abyss,
      fontFamily: 'Roboto',
      splashFactory: InkSparkle.splashFactory,
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.shelf,
        contentTextStyle: TextStyle(color: AppColors.text),
      ),
      textTheme: const TextTheme(
        headlineSmall: TextStyle(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.4,
          color: AppColors.text,
        ),
        titleMedium: TextStyle(
          fontWeight: FontWeight.w600,
          color: AppColors.text,
        ),
        bodyMedium: TextStyle(color: AppColors.textDim, height: 1.45),
        labelSmall: TextStyle(
          color: AppColors.textFaint,
          letterSpacing: 0.6,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Frosted panel used across the app.
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? borderColor;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.045),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderColor ?? AppColors.stroke),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}
