import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'data/consent.dart';
import 'ui/consent_screen.dart';
import 'ui/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(AppTheme.systemOverlay);
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  runApp(const ProviderScope(child: FreeLynkApp()));
}

class FreeLynkApp extends StatelessWidget {
  const FreeLynkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FreeLynk',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      home: const _Gate(),
    );
  }
}

/// Shows the privacy notice on first run, and the app every time after.
///
/// The home screen is not built until consent exists, and that ordering is
/// the point rather than a detail: building it starts the library
/// controller, which fires the daily usage report. Behind a menu link, the
/// notice would have been describing something that had already happened.
class _Gate extends StatefulWidget {
  const _Gate();

  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  /// Null while the stored answer is still being read. Rendering the notice
  /// during that gap would flash it at people who agreed months ago.
  bool? _accepted;

  @override
  void initState() {
    super.initState();
    Consent.isAccepted().then((yes) {
      if (mounted) setState(() => _accepted = yes);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_accepted == null) {
      return const Scaffold(
        body: DecoratedBox(
          decoration: BoxDecoration(gradient: AppColors.backdrop),
          child: SizedBox.expand(),
        ),
      );
    }

    if (_accepted == false) {
      return ConsentScreen(
        onAccept: () async {
          await Consent.accept();
          if (mounted) setState(() => _accepted = true);
        },
      );
    }

    return const HomeScreen();
  }
}
