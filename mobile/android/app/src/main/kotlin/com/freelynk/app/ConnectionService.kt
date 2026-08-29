package com.freelynk.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps FreeLynk alive while it is holding a WiFi connection.
 *
 * Android will happily kill a backgrounded process, and this handset's
 * vendor power manager is more eager than most. That matters here because the
 * process owns the network binding and the network suggestion — kill it and
 * the user silently drops off the WiFi they just joined.
 *
 * A foreground service is the only sanctioned way to say "leave this one
 * running". The trade is a permanent notification, which is honest: something
 * IS running on the user's behalf, and the notification is also the off
 * switch. The service stops only when the user asks it to — via the
 * notification's stop action, via Disconnect in the app, or by uninstalling.
 * Swiping the app out of Recents deliberately does NOT stop it
 * (`stopWithTask="false"` in the manifest).
 */
class ConnectionService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
        }

        val ssid = intent?.getStringExtra(EXTRA_SSID)?.takeIf { it.isNotBlank() }
        startForegroundCompat(buildNotification(ssid))

        // If the system kills us under memory pressure, come back. The user
        // asked for this to stay up; only the user should take it down.
        return START_STICKY
    }

    private fun startForegroundCompat(notification: Notification) {
        ensureChannel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        // LOW: visible and permanent, but no sound and no heads-up. This is a
        // status line, not an alert.
        val channel = NotificationChannel(
            CHANNEL_ID,
            "সংযোগ চালু",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "ওয়াইফাই সংযোগ ধরে রাখার জন্য"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(ssid: String?): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, ConnectionService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(if (ssid != null) "যুক্ত: $ssid" else "FreeLynk চালু আছে")
            .setContentText(
                if (ssid != null) {
                    "সংযোগ ধরে রাখা হচ্ছে। বন্ধ করতে চাপুন।"
                } else {
                    "ব্যাকগ্রাউন্ডে চালু আছে।"
                },
            )
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentIntent(open)
            .addAction(0, "বন্ধ করুন", stop)
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "freelynk_connection"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "com.freelynk.app.STOP"
        const val EXTRA_SSID = "ssid"

        fun start(context: Context, ssid: String?) {
            val intent = Intent(context, ConnectionService::class.java)
                .putExtra(EXTRA_SSID, ssid)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ConnectionService::class.java))
        }
    }
}
