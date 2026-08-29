package com.freelynk.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
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
        }

        var resultSent = false

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                super.onAvailable(network)
                if (!resultSent) {
                    resultSent = true
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        cm.bindProcessToNetwork(network)
                        boundNetwork = network
                    }
                    runOnUiThread { result.success(true) }
                }
            }

            override fun onUnavailable() {
                super.onUnavailable()
                if (!resultSent) {
                    resultSent = true
                    runOnUiThread { result.success(false) }
                }
            }
        }

        cm.requestNetwork(request, networkCallback!!, 5000)
    }
}
