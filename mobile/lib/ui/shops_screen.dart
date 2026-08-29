import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/theme.dart';
import '../data/content.dart';
import '../state/app_state.dart';

/// Partner shops. Needs a live connection — this is not cached offline.
class ShopsScreen extends ConsumerWidget {
  const ShopsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final content = ref.watch(contentProvider);
    final shops = content.shops;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.backdrop),
        child: SafeArea(
          child: Column(
            children: [
              _Bar(count: shops.length),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () =>
                      ref.read(contentProvider.notifier).refresh(),
                  backgroundColor: AppColors.shelf,
                  color: AppColors.foam,
                  child: _Body(
                    shops: shops,
                    loading: content.loading,
                    error: content.error,
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

class _Body extends StatelessWidget {
  final List<Shop> shops;
  final bool loading;
  final String? error;

  const _Body({required this.shops, required this.loading, required this.error});

  @override
  Widget build(BuildContext context) {
    if (shops.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 60, 20, 20),
        children: [
          GlassCard(
            padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
            child: Column(
              children: [
                Icon(
                  loading
                      ? Icons.hourglass_empty_rounded
                      : error != null
                          ? Icons.wifi_off_rounded
                          : Icons.storefront_outlined,
                  size: 32,
                  color: AppColors.textFaint,
                ),
                const SizedBox(height: 14),
                Text(
                  loading
                      ? 'লোড হচ্ছে…'
                      : error ?? 'এখনো কোনো পার্টনার দোকান যোগ করা হয়নি।',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textFaint,
                    height: 1.6,
                  ),
                ),
                if (error != null) ...[
                  const SizedBox(height: 8),
                  const Text(
                    'দোকানের তালিকা দেখতে ইন্টারনেট দরকার।',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11.5, color: AppColors.textFaint),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
      itemCount: shops.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, i) => _ShopCard(shop: shops[i]),
    );
  }
}

class _ShopCard extends StatelessWidget {
  final Shop shop;

  const _ShopCard({required this.shop});

  Future<void> _call(BuildContext context) async {
    final uri = Uri(scheme: 'tel', path: shop.phone.replaceAll(' ', ''));
    final ok = await launchUrl(uri);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('কল করা যায়নি।')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (shop.hasImage)
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: Image.network(
                  shop.imageUrl,
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, progress) =>
                      progress == null ? child : const _ImageFallback(),
                  errorBuilder: (_, _, _) => const _ImageFallback(broken: true),
                ),
              ),
            ),

          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  shop.name,
                  style: const TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.text,
                  ),
                ),

                if (shop.sells.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    shop.sells,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textDim,
                      height: 1.4,
                    ),
                  ),
                ],

                if (shop.address.isNotEmpty) ...[
                  const SizedBox(height: 9),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.place_outlined,
                        size: 15,
                        color: AppColors.textFaint,
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          shop.address,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textFaint,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],

                if (shop.hasPhone) ...[
                  const SizedBox(height: 13),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton.icon(
                      onPressed: () => _call(context),
                      icon: const Icon(Icons.call_rounded, size: 17),
                      label: Text(
                        shop.phone,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.mint,
                        backgroundColor: AppColors.mint.withValues(alpha: 0.11),
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(13),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ImageFallback extends StatelessWidget {
  final bool broken;
  const _ImageFallback({this.broken = false});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.white.withValues(alpha: 0.04),
      child: Center(
        child: Icon(
          broken ? Icons.image_not_supported_outlined : Icons.image_outlined,
          color: AppColors.textFaint,
          size: 24,
        ),
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  final int count;

  const _Bar({required this.count});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 6, 20, 12),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.arrow_back_rounded, color: AppColors.text),
          ),
          const SizedBox(width: 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'পার্টনার দোকান',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                    color: AppColors.text,
                  ),
                ),
                Text(
                  count == 0 ? 'ইন্টারনেট প্রয়োজন' : '$count টি দোকান',
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textFaint,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
