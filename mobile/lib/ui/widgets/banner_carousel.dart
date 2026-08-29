import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme.dart';
import '../../data/content.dart';

/// Swipeable banner strip. Renders nothing at all when there are no
/// banners — the admin turning every banner off must leave no trace in
/// the layout, not an empty box.
class BannerCarousel extends StatefulWidget {
  final List<AppBanner> banners;

  const BannerCarousel({super.key, required this.banners});

  @override
  State<BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<BannerCarousel> {
  final PageController _controller = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _restartAutoPlay();
  }

  @override
  void didUpdateWidget(BannerCarousel old) {
    super.didUpdateWidget(old);
    if (old.banners.length != widget.banners.length) {
      _page = 0;
      _restartAutoPlay();
    }
  }

  void _restartAutoPlay() {
    _timer?.cancel();
    if (widget.banners.length < 2) return;

    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_page + 1) % widget.banners.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _open(AppBanner banner) async {
    if (!banner.hasLink) return;

    final uri = Uri.tryParse(banner.linkUrl);
    if (uri == null) return;

    // The server already rejects anything that isn't http(s), but the APK
    // may be talking to an older deployment, so check again here.
    if (uri.scheme != 'http' && uri.scheme != 'https') return;

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('লিংকটি খোলা যায়নি।')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.banners.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        children: [
          SizedBox(
            height: 150,
            child: PageView.builder(
              controller: _controller,
              itemCount: widget.banners.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, i) {
                final banner = widget.banners[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: GestureDetector(
                    onTap: banner.hasLink ? () => _open(banner) : null,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(18),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          CachedNetworkImage(
                            imageUrl: banner.imageUrl,
                            fit: BoxFit.cover,
                            placeholder: (_, _) => const _BannerPlaceholder(),
                            errorWidget: (_, _, _) =>
                                const _BannerPlaceholder(broken: true),
                          ),
                          if (banner.title.isNotEmpty)
                            Positioned(
                              left: 0,
                              right: 0,
                              bottom: 0,
                              child: Container(
                                padding: const EdgeInsets.fromLTRB(14, 22, 14, 12),
                                decoration: const BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Colors.transparent,
                                      Color(0xCC00131F),
                                    ],
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        banner.title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.text,
                                        ),
                                      ),
                                    ),
                                    if (banner.hasLink)
                                      const Icon(
                                        Icons.open_in_new_rounded,
                                        size: 15,
                                        color: AppColors.foam,
                                      ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          if (widget.banners.length > 1) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(widget.banners.length, (i) {
                final active = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  height: 5,
                  width: active ? 18 : 5,
                  decoration: BoxDecoration(
                    color: active ? AppColors.foam : AppColors.textFaint,
                    borderRadius: BorderRadius.circular(3),
                  ),
                );
              }),
            ),
          ],
        ],
      ),
    );
  }
}

class _BannerPlaceholder extends StatelessWidget {
  final bool broken;
  const _BannerPlaceholder({this.broken = false});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.white.withValues(alpha: 0.04),
      child: Center(
        child: Icon(
          broken ? Icons.image_not_supported_outlined : Icons.image_outlined,
          color: AppColors.textFaint,
          size: 26,
        ),
      ),
    );
  }
}
