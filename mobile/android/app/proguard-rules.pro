# ShareLynk — ProGuard / R8 rules
#
# The old rules here referenced Supabase, Hive and flutter_background_service,
# none of which exist in this app any more.

# Flutter engine
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# Our MethodChannel host
-keep class com.sharelynk.app.MainActivity { *; }

# wifi_iot / wifi_scan talk to framework classes reflectively
-keep class com.alternadom.wifiiot.** { *; }
-keep class dev.flutternetwork.wifi.** { *; }
-keep class android.net.wifi.** { *; }

# permission_handler
-keep class com.baseflow.permissionhandler.** { *; }

# Play Core is referenced by Flutter's deferred-components support, which we
# do not use. Without this R8 fails on missing classes.
-dontwarn com.google.android.play.core.**
