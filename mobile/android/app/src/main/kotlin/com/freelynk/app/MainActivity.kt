package com.freelynk.app

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import androidx.annotation.NonNull
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val channelName = "com.freelynk.app/wifi"
    private var boundNetwork: Network? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun configureFlutterEngine(@NonNull flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            channelName
        ).setMethodCallHandler { call, result ->

            when (call.method) {
                "getWifiDetails" -> {
                    try {
                        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                        val details = mutableMapOf<String, Any>()

                        var linkSpeed = 0
                        var rssi = -100
                        var ssid = ""

                        @Suppress("DEPRECATION")
                        val info: WifiInfo? = wm.connectionInfo
                        if (info != null) {
                            linkSpeed = info.linkSpeed
                            rssi = info.rssi
                            ssid = info.ssid ?: ""
                        }

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val activeNet = cm.activeNetwork
                            if (activeNet != null) {
                                val caps = cm.getNetworkCapabilities(activeNet)
                                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                                    val downstreamKbps = caps.linkDownstreamBandwidthKbps
                                    if (linkSpeed <= 0 || linkSpeed > 5000) {
                                        linkSpeed = downstreamKbps / 1000
                                    }
                                    
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                        val tInfo = caps.transportInfo
                                        if (tInfo is WifiInfo) {
                                            if (tInfo.linkSpeed > 0) linkSpeed = tInfo.linkSpeed
                                            if (tInfo.rssi > -100) rssi = tInfo.rssi
                                            if (ssid.isEmpty() || ssid == "<unknown ssid>") {
                                                ssid = tInfo.ssid ?: ""
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        details["linkSpeed"] = if (linkSpeed > 0) linkSpeed else 0
                        details["rssi"] = rssi
                        details["ssid"] = ssid.replace("\"", "")
                        result.success(details)
                    } catch (e: Exception) {
                        result.error("WIFI_DETAILS_ERROR", e.message, null)
                    }
                }

                "bindToWifi" -> {
                    val ssidArg = call.argument<String>("ssid") ?: ""
                    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

                    // বর্তমানে কানেক্টেড নেটওয়ার্কটি খোঁজা হচ্ছে
                    val wifiNetwork = findWifiNetwork(cm)
                    
                    if (wifiNetwork != null) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            cm.bindProcessToNetwork(wifiNetwork)
                            boundNetwork = wifiNetwork
                        }
                        result.success(true)
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        // যদি নেটওয়ার্ক সরাসরি না পাওয়া যায়, তবে রিকোয়েস্ট করা হচ্ছে
                        requestAndBindNetwork(cm, ssidArg, result)
                    } else {
                        result.success(false)
                    }
                }

                "forceDisconnect" -> {
                    try {
                        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            cm.bindProcessToNetwork(null)
                            boundNetwork = null
                        }

                        networkCallback?.let {
                            try { cm.unregisterNetworkCallback(it) } catch (_: Exception) {}
                            networkCallback = null
                        }

                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                            @Suppress("DEPRECATION")
                            wm.disconnect()
                        }

                        result.success(true)
                    } catch (e: Exception) {
                        result.error("DISCONNECT_ERROR", e.message, null)
                    }
                }

                /*
                 * Whether the radio is on a WiFi network at all.
                 *
                 * Deliberately NOT WifiManager.getConnectionInfo(): from
                 * Android 9 the SSID counts as location data, so a
                 * backgrounded app gets "<unknown ssid>" back. Reading that
                 * as "disconnected" made the app announce a dropped
                 * connection every time it left the foreground — and tear
                 * down its own keep-alive service with it.
                 *
                 * ConnectivityManager answers truthfully in the background
                 * and needs no location grant.
                 */
                "isWifiConnected" -> {
                    try {
                        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                        val connected = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val active = cm.activeNetwork
                            val caps = active?.let { cm.getNetworkCapabilities(it) }
                            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
                        } else {
                            @Suppress("DEPRECATION")
                            cm.activeNetworkInfo?.type == android.net.ConnectivityManager.TYPE_WIFI
                        }
                        result.success(connected)
                    } catch (e: Exception) {
                        Log.w(TAG, "could not read wifi state", e)
                        result.success(false)
                    }
                }

                /*
                 * Join a network, whatever generation of security it uses.
                 *
                 * Replaces wifi_iot's connect, which only ever calls
                 * setWpa2Passphrase(). A WPA3-only access point can never
                 * match a WPA2 suggestion, so the app sat spinning until it
                 * timed out with no explanation — which is exactly what
                 * happened at a shop whose router was newer than the plugin.
                 *
                 * The security is read from the live scan rather than from
                 * whatever the admin panel says, because the router is the
                 * authority on what it will accept and a human typing "WPA"
                 * into a form is not.
                 */
                "connectToNetwork" -> {
                    val ssid = call.argument<String>("ssid").orEmpty()
                    val password = call.argument<String>("password").orEmpty()
                    if (ssid.isEmpty()) {
                        result.success(mapOf("ok" to false, "reason" to "no-ssid"))
                    } else {
                        result.success(suggestNetwork(ssid, password))
                    }
                }

                /*
                 * Drop every suggestion this app has registered.
                 *
                 * Asks the system what we suggested instead of remembering it
                 * in a field, which is why wifi_iot could not do this: its
                 * memory dies with the process while Android's does not, so
                 * after any restart its disconnect refused with "networkC
                 * allback and networkSuggestions is null" even though the
                 * app had made the connection.
                 *
                 * Removing the suggestion the device is currently using makes
                 * Android disconnect from it.
                 */
                "clearSuggestions" -> {
                    result.success(clearOurSuggestions())
                }

                // ------------------------------------------- keep alive
                "startKeepAlive" -> {
                    try {
                        ConnectionService.start(this, call.argument<String>("ssid"))
                        result.success(true)
                    } catch (e: Exception) {
                        Log.w(TAG, "could not start the keep-alive service", e)
                        result.success(false)
                    }
                }

                "stopKeepAlive" -> {
                    try {
                        ConnectionService.stop(this)
                        result.success(true)
                    } catch (e: Exception) {
                        Log.w(TAG, "could not stop the keep-alive service", e)
                        result.success(false)
                    }
                }

                // Whether the OS has agreed to leave us alone. Vendor power
                // managers are the usual reason a foreground service still
                // dies overnight, and only the user can grant this.
                "isBatteryUnrestricted" -> {
                    result.success(isIgnoringBatteryOptimizations())
                }

                "requestBatteryUnrestricted" -> {
                    result.success(requestIgnoreBatteryOptimizations())
                }

                else -> result.notImplemented()
            }
        }
    }

    private fun isIgnoringBatteryOptimizations(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        return try {
            val pm = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            pm.isIgnoringBatteryOptimizations(packageName)
        } catch (e: Exception) {
            Log.w(TAG, "battery optimisation state unreadable", e)
            false
        }
    }

    /**
     * Opens the OS dialog asking to be exempt from battery optimisation.
     *
     * Deliberately uses the settings screen rather than
     * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS with a package: uri, which
     * Play policy treats as a violation for most apps. The user stays in
     * control either way.
     */
    private fun requestIgnoreBatteryOptimizations(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        if (isIgnoringBatteryOptimizations()) return true

        return try {
            startActivity(
                Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        } catch (e: Exception) {
            Log.w(TAG, "could not open battery optimisation settings", e)
            false
        }
    }

    /**
     * What an access point will actually accept, read off the air.
     *
     * ScanResult.capabilities looks like "[RSN-SAE-CCMP][ESS]" or
     * "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]". A router in WPA2/WPA3
     * transition mode advertises both, and phones differ in which they
     * pick, so that case is reported as both rather than guessed at.
     */
    private data class ApSecurity(
        val sae: Boolean,     // WPA3
        val psk: Boolean,     // WPA2
        val wep: Boolean,
        val owe: Boolean,     // enhanced open
        val open: Boolean,
        val found: Boolean,
    )

    private fun readSecurity(ssid: String): ApSecurity {
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

        val caps = try {
            @Suppress("DEPRECATION")
            wm.scanResults
                .filter { it.SSID?.trim() == ssid.trim() }
                .joinToString(" ") { it.capabilities ?: "" }
                .uppercase()
        } catch (e: SecurityException) {
            // No location grant: fall through to trying everything.
            Log.w(TAG, "scan results unreadable", e)
            ""
        }

        if (caps.isEmpty()) {
            return ApSecurity(false, false, false, false, false, found = false)
        }

        return ApSecurity(
            sae = caps.contains("SAE"),
            psk = caps.contains("PSK"),
            wep = caps.contains("WEP"),
            owe = caps.contains("OWE"),
            // No PSK, SAE or WEP anywhere in the capabilities means open.
            open = !caps.contains("PSK") && !caps.contains("SAE") &&
                !caps.contains("WEP") && !caps.contains("OWE"),
            found = true,
        )
    }

    private fun suggestNetwork(ssid: String, password: String): Map<String, Any?> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Pre-10 has the old WifiConfiguration API; wifi_iot still
            // handles those correctly, so leave them to it.
            return mapOf("ok" to false, "reason" to "legacy-android")
        }

        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val sec = readSecurity(ssid)
        val suggestions = mutableListOf<android.net.wifi.WifiNetworkSuggestion>()

        fun builder() = android.net.wifi.WifiNetworkSuggestion.Builder().setSsid(ssid)

        when {
            sec.open && password.isEmpty() -> suggestions += builder().build()

            !sec.found -> {
                // The scan came back empty — hidden network, or the results
                // went stale. Offer every credentialled form we can and let
                // Android pick the one the router answers to, rather than
                // failing on a guess.
                if (password.isNotEmpty()) {
                    suggestions += builder().setWpa2Passphrase(password).build()
                    suggestions += builder().setWpa3Passphrase(password).build()
                } else {
                    suggestions += builder().build()
                }
            }

            else -> {
                // Transition-mode routers advertise both; suggest both so
                // the phone can take whichever it prefers.
                if (sec.psk && password.isNotEmpty()) {
                    suggestions += builder().setWpa2Passphrase(password).build()
                }
                if (sec.sae && password.isNotEmpty()) {
                    suggestions += builder().setWpa3Passphrase(password).build()
                }
                if (sec.owe) suggestions += builder().setIsEnhancedOpen(true).build()
                if (sec.wep) {
                    // WPA3-era Android dropped WEP from the suggestion API
                    // entirely. Say so plainly instead of failing silently.
                    return mapOf(
                        "ok" to false,
                        "reason" to "wep-unsupported",
                        "security" to "WEP",
                    )
                }
            }
        }

        if (suggestions.isEmpty()) {
            return mapOf("ok" to false, "reason" to "no-usable-security")
        }

        // Clear ours first: leaving a stale suggestion for the same SSID
        // makes addNetworkSuggestions return DUPLICATE and change nothing.
        clearOurSuggestions()

        val status = try {
            wm.addNetworkSuggestions(suggestions)
        } catch (e: Exception) {
            Log.w(TAG, "addNetworkSuggestions failed", e)
            return mapOf("ok" to false, "reason" to "add-failed")
        }

        // Android re-evaluates suggestions when fresh scan results land, so
        // asking for a scan turns a wait of minutes into one of seconds.
        try {
            @Suppress("DEPRECATION")
            wm.startScan()
        } catch (e: Exception) {
            Log.w(TAG, "startScan refused", e)
        }

        val label = buildString {
            if (sec.sae) append("WPA3 ")
            if (sec.psk) append("WPA2 ")
            if (sec.owe) append("OWE ")
            if (sec.open) append("OPEN ")
            if (isEmpty()) append("unknown")
        }.trim()

        return mapOf(
            "ok" to (status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS),
            "status" to status,
            "security" to label,
            "count" to suggestions.size,
            // The user refused this app's suggestions in a previous prompt;
            // nothing will ever connect until they change that.
            "needsApproval" to (status == 5),
        )
    }

    private fun clearOurSuggestions(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        return try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            // Straight from the system, so this still works in a process
            // that did not make the original suggestion.
            val ours = wm.networkSuggestions
            if (ours.isEmpty()) return true
            wm.removeNetworkSuggestions(ours) ==
                WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
        } catch (e: Exception) {
            Log.w(TAG, "could not clear suggestions", e)
            false
        }
    }

    private fun findWifiNetwork(cm: ConnectivityManager): Network? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            for (network in cm.allNetworks) {
                val caps = cm.getNetworkCapabilities(network) ?: continue
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    return network
                }
            }
        }
        return null
    }

    private fun requestAndBindNetwork(
        cm: ConnectivityManager,
        ssid: String,
        result: MethodChannel.Result
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            result.success(false)
            return
        }

        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()

        networkCallback?.let {
            try { cm.unregisterNetworkCallback(it) } catch (_: Exception) {}
            networkCallback = null
        }

        // A MethodChannel result must be delivered exactly once. Miss it and
        // the Dart side awaits a Future that never completes — which is
        // exactly what happened on a Unisoc Android 11 handset: this callback
        // fired neither onAvailable nor onUnavailable, and the UI sat on
        // "কানেক্ট হচ্ছে" for minutes with no error and no way out.
        //
        // requestNetwork's own timeout is not trustworthy on every ROM, so we
        // run a watchdog too and make delivery idempotent.
        val delivered = AtomicBoolean(false)
        val watchdog = Handler(Looper.getMainLooper())

        fun deliver(value: Boolean) {
            if (delivered.compareAndSet(false, true)) {
                watchdog.removeCallbacksAndMessages(null)
                runOnUiThread {
                    try { result.success(value) } catch (_: Exception) {}
                }
            }
        }

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                super.onAvailable(network)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    try {
                        cm.bindProcessToNetwork(network)
                        boundNetwork = network
                    } catch (e: Exception) {
                        Log.w(TAG, "bindProcessToNetwork failed", e)
                        deliver(false)
                        return
                    }
                }
                deliver(true)
            }

            override fun onUnavailable() {
                super.onUnavailable()
                deliver(false)
            }
        }
        networkCallback = callback

        try {
            cm.requestNetwork(request, callback, REQUEST_TIMEOUT_MS)
        } catch (e: Exception) {
            // SecurityException on ROMs that restrict CHANGE_NETWORK_STATE.
            // Answer the caller rather than stranding it.
            Log.w(TAG, "requestNetwork failed", e)
            networkCallback = null
            deliver(false)
            return
        }

        // Outlive the platform timeout by a margin, then answer anyway and
        // release the callback so it cannot leak.
        watchdog.postDelayed({
            if (!delivered.get()) {
                try { cm.unregisterNetworkCallback(callback) } catch (_: Exception) {}
                if (networkCallback === callback) networkCallback = null
                deliver(false)
            }
        }, REQUEST_TIMEOUT_MS + 2000L)
    }

    private companion object {
        const val TAG = "FreeLynk"
        const val REQUEST_TIMEOUT_MS = 5000
    }
}
