import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_config.dart';
import '../core/theme.dart';

/// Shown once, before anything is sent anywhere.
///
/// Deliberately placed ahead of the home screen rather than behind a link
/// in a menu: the daily usage ping would otherwise have already gone out by
/// the time anyone could read what it said. Agreeing first and reporting
/// afterwards is the only order in which the notice is truthful.
///
/// It says what is taken and what is not, in that order, because "no name,
/// no number, no location" is the part that actually answers the question a
/// person has when an app asks for location permission a moment later.
class ConsentScreen extends StatelessWidget {
  final VoidCallback onAccept;

  const ConsentScreen({super.key, required this.onAccept});

  Future<void> _openFullPolicy() async {
    final uri = Uri.parse('${AppConfig.baseUrl}/privacy');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.backdrop),
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
                  children: [
                    const _Mark(),
                    const SizedBox(height: 22),

                    const Text(
                      'শুরু করার আগে',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: AppColors.text,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'FreeLynk-এ কোনো অ্যাকাউন্ট বা লগইন নেই। '
                      'আপনার সম্পর্কে কী নেওয়া হয় আর কী নেওয়া হয় না, '
                      'একবার দেখে নিন।',
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.6,
                        color: AppColors.textDim,
                      ),
                    ),

                    const SizedBox(height: 26),

                    const _Block(
                      icon: Icons.block_rounded,
                      tint: AppColors.mint,
                      title: 'যা নেওয়া হয় না',
                      lines: [
                        'আপনার নাম, ফোন নম্বর বা ইমেইল',
                        'আপনার অবস্থান — কোথাও পাঠানো হয় না',
                        'কোন ওয়াইফাইয়ে যুক্ত হলেন',
                        'Google-এর বিজ্ঞাপন আইডি',
                      ],
                    ),

                    const SizedBox(height: 14),

                    const _Block(
                      icon: Icons.tag_rounded,
                      tint: AppColors.foam,
                      title: 'যা নেওয়া হয়',
                      lines: [
                        'একটি এলোমেলো নম্বর, যেটা অ্যাপ নিজেই বানায় — '
                            'শুধু গোনার জন্য যে কতজন ব্যবহার করছে',
                        'ফোনের ধরন ও অ্যাপের সংস্করণ',
                        'কোনো বিজ্ঞাপনে ট্যাপ পড়লে তার সংখ্যা '
                            '(কে ট্যাপ করল তা নয়)',
                      ],
                    ),

                    const SizedBox(height: 14),

                    const _Block(
                      icon: Icons.my_location_rounded,
                      tint: AppColors.amber,
                      title: 'লোকেশন অনুমতি কেন চাইবে',
                      lines: [
                        'অ্যান্ড্রয়েডের নিয়ম — লোকেশন চালু না থাকলে ফোন '
                            'আশেপাশের ওয়াইফাই খুঁজতেই দেয় না। এটি শুধু '
                            'ওয়াইফাই খোঁজার কাজেই লাগে।',
                      ],
                    ),

                    const SizedBox(height: 14),

                    const _Block(
                      icon: Icons.lock_outline_rounded,
                      tint: AppColors.glow,
                      title: 'পাসওয়ার্ড কোথায় থাকে',
                      lines: [
                        'ওয়াইফাই পাসওয়ার্ড এনক্রিপ্ট করা অবস্থায় ফোনে জমা '
                            'থাকে, সাধারণ লেখায় কখনো নয়। তাই ইন্টারনেট '
                            'ছাড়াও অ্যাপটি কাজ করে।',
                      ],
                    ),

                    const SizedBox(height: 20),

                    Center(
                      child: TextButton.icon(
                        onPressed: _openFullPolicy,
                        icon: const Icon(Icons.open_in_new_rounded, size: 16),
                        label: const Text(
                          'পুরো গোপনীয়তা নীতি পড়ুন',
                          style: TextStyle(fontSize: 13.5),
                        ),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.foam,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Kept out of the scroll view so it cannot be missed on a
              // short screen, and so nobody agrees to something they never
              // saw arrive.
              Container(
                padding: const EdgeInsets.fromLTRB(24, 14, 24, 20),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(
                      color: AppColors.stroke.withValues(alpha: 0.5),
                    ),
                  ),
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: onAccept,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.foam,
                      foregroundColor: AppColors.abyss,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const Text(
                      'বুঝেছি, শুরু করুন',
                      style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Mark extends StatelessWidget {
  const _Mark();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 74,
        height: 74,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          gradient: const LinearGradient(
            colors: [AppColors.foam, AppColors.glow],
          ),
        ),
        child: const Icon(Icons.wifi_rounded, size: 40, color: AppColors.abyss),
      ),
    );
  }
}

class _Block extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final String title;
  final List<String> lines;

  const _Block({
    required this.icon,
    required this.tint,
    required this.title,
    required this.lines,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 17, color: tint),
              const SizedBox(width: 9),
              Text(
                title,
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: tint,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...lines.map(
            (l) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 7, right: 9),
                    child: Container(
                      width: 4,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.textFaint,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      l,
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.55,
                        color: AppColors.textDim,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
