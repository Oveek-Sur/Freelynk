/// Banners and partner shops.
///
/// Unlike [WifiNetwork] this data is not secret and is not cached offline —
/// it arrives as plain JSON from /api/content and needs a live connection,
/// which is exactly how the product is meant to behave.
library;

class AppBanner {
  final String id;
  final String title;
  final String imageUrl;
  final String linkUrl;

  const AppBanner({
    required this.id,
    required this.title,
    required this.imageUrl,
    required this.linkUrl,
  });

  bool get hasLink => linkUrl.trim().isNotEmpty;

  static AppBanner? tryParse(Map<String, dynamic> json) {
    final image = (json['imageUrl'] as String?)?.trim() ?? '';
    if (image.isEmpty) return null; // a banner with no image is not a banner

    return AppBanner(
      id: (json['id'] as String?) ?? '',
      title: (json['title'] as String?) ?? '',
      imageUrl: image,
      linkUrl: (json['linkUrl'] as String?)?.trim() ?? '',
    );
  }
}

class Shop {
  final String id;
  final String name;
  final String imageUrl;
  final String sells;
  final String address;
  final String phone;

  const Shop({
    required this.id,
    required this.name,
    required this.imageUrl,
    required this.sells,
    required this.address,
    required this.phone,
  });

  bool get hasImage => imageUrl.trim().isNotEmpty;
  bool get hasPhone => phone.trim().isNotEmpty;

  static Shop? tryParse(Map<String, dynamic> json) {
    final name = (json['name'] as String?)?.trim() ?? '';
    if (name.isEmpty) return null;

    return Shop(
      id: (json['id'] as String?) ?? '',
      name: name,
      imageUrl: (json['imageUrl'] as String?)?.trim() ?? '',
      sells: (json['sells'] as String?)?.trim() ?? '',
      address: (json['address'] as String?)?.trim() ?? '',
      phone: (json['phone'] as String?)?.trim() ?? '',
    );
  }
}

class AppContent {
  final List<AppBanner> banners;
  final List<Shop> shops;

  const AppContent({this.banners = const [], this.shops = const []});

  bool get isEmpty => banners.isEmpty && shops.isEmpty;
}
