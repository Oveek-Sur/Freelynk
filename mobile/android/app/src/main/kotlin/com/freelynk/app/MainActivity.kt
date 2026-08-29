package com.freelynk.app

import android.content.Context
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

                else -> result.notImplemented()
            }
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
