import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../core/app_config.dart';
import 'content.dart';

class ContentResult {
  final AppContent content;
  final String? error;

  const ContentResult(this.content, {this.error});
}

/// Fetches banners and shops from /api/content.
///
/// No disk cache on purpose: this section is documented as needing a live
/// connection, and stale adverts or a closed shop's phone number are worse
/// than showing nothing.
class ContentRepository {
  final http.Client _client;

  ContentRepository({http.Client? client}) : _client = client ?? http.Client();

  Future<ContentResult> fetch() async {
    if (!AppConfig.isConfigured) {
      return const ContentResult(
        AppContent(),
        error: 'অ্যাপটি কনফিগার করা হয়নি।',
      );
    }

    try {
      final res = await _client.get(
        AppConfig.contentUrl,
        headers: {'x-client-key': AppConfig.clientKey},
      ).timeout(const Duration(seconds: 15));

      if (res.statusCode == 403) {
        return const ContentResult(
          AppContent(),
          error: 'সার্ভার অ্যাক্সেস দেয়নি। অ্যাপ আপডেট করুন।',
        );
      }

      if (res.statusCode != 200) {
        return ContentResult(
          const AppContent(),
          error: 'সার্ভার সমস্যা (${res.statusCode})।',
        );
      }

      final json = jsonDecode(utf8.decode(res.bodyBytes));
      if (json is! Map<String, dynamic>) {
        return const ContentResult(AppContent(), error: 'ডেটা পড়া যায়নি।');
      }

      final banners = (json['banners'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(AppBanner.tryParse)
          .whereType<AppBanner>()
          .toList();

      final shops = (json['shops'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(Shop.tryParse)
          .whereType<Shop>()
          .toList();

      return ContentResult(AppContent(banners: banners, shops: shops));
    } on SocketException {
      return const ContentResult(
        AppContent(),
        error: 'ইন্টারনেট সংযোগ নেই।',
      );
    } on HttpException {
      return const ContentResult(AppContent(), error: 'সার্ভারে পৌঁছানো যায়নি।');
    } on FormatException {
      return const ContentResult(AppContent(), error: 'ডেটা পড়া যায়নি।');
    } catch (_) {
      return const ContentResult(AppContent(), error: 'লোড করা যায়নি।');
    }
  }
}
