import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

// ---------------------------------------------------------------------------
// Release signing.
//
// Create android/key.properties (git-ignored) to sign real builds:
//
//   storeFile=C:/keys/freelynk.jks
//   storePassword=...
//   keyAlias=freelynk
//   keyPassword=...
//
// Generate the keystore once:
//   keytool -genkey -v -keystore freelynk.jks -keyalg RSA \
//           -keysize 2048 -validity 10000 -alias freelynk
//
// Without that file the build still works but falls back to the debug key —
// fine for testing on your own phone, NOT for anything you hand out. A
// debug-signed APK can never be upgraded by a properly signed one later.
// ---------------------------------------------------------------------------
val keystoreProperties = Properties()
val keystoreFile = rootProject.file("key.properties")
val hasKeystore = keystoreFile.exists()
if (hasKeystore) {
    keystoreFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "com.freelynk.app"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    defaultConfig {
        applicationId = "com.freelynk.app"
        minSdk = 24
        // Play requires new apps to target a recent SDK, and 35 is what
        // Android 15 brings. The change that actually bites is edge-to-edge:
        // from 35 an app can no longer opt out, so content is drawn under
        // the status and navigation bars. Every screen here wraps its body
        // in SafeArea, which is what keeps that from clipping anything.
        targetSdk = 35
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasKeystore) {
                signingConfigs.getByName("release")
            } else {
                logger.warn(
                    "FreeLynk: android/key.properties not found — signing " +
                        "release with the DEBUG key. Do not distribute this build."
                )
                signingConfigs.getByName("debug")
            }

            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")

    // NotificationCompat, for the keep-alive service. Flutter's embedding
    // already pulls androidx.core in transitively; naming it here pins the
    // version so a plugin bump cannot quietly change it underneath us.
    implementation("androidx.core:core-ktx:1.13.1")
}
