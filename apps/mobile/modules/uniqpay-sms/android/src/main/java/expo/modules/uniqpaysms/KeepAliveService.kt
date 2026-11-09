package expo.modules.uniqpaysms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.net.HttpURLConnection
import java.net.URL

class KeepAliveService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var wake: PowerManager.WakeLock? = null
  private val pulse = object : Runnable {
    override fun run() {
      Thread { ping() }.start()
      handler.postDelayed(this, 20_000)
    }
  }

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    val power = getSystemService(PowerManager::class.java)
    wake = power?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "uniqpay:keepalive")?.apply {
      setReferenceCounted(false)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val base = intent?.getStringExtra("base")
    val token = intent?.getStringExtra("token")
    val uid = intent?.getStringExtra("uid")
    if (!base.isNullOrBlank() && !token.isNullOrBlank() && !uid.isNullOrBlank()) {
      prefs.edit()
        .putString("base", base)
        .putString("token", token)
        .putString("uid", uid)
        .putString("label", intent.getStringExtra("label") ?: "UniqBD handset")
        .apply()
    }
    val notice = notification()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTICE_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTICE_ID, notice)
    }
    if (wake?.isHeld != true) wake?.acquire()
    handler.removeCallbacks(pulse)
    handler.post(pulse)
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    try {
      val again = Intent(applicationContext, KeepAliveService::class.java)
      if (Build.VERSION.SDK_INT >= 26) applicationContext.startForegroundService(again) else applicationContext.startService(again)
    } catch (_: Exception) {
      // Some phones block a restart while the app is being swiped away. START_STICKY asks the system to bring it back.
    }
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    handler.removeCallbacks(pulse)
    if (wake?.isHeld == true) wake?.release()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun ping() {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val base = prefs.getString("base", null) ?: return
    val token = prefs.getString("token", null) ?: return
    val uid = prefs.getString("uid", null) ?: return
    val label = prefs.getString("label", null) ?: "UniqBD handset"
    if (!base.startsWith("https://")) return
    val endpoint = URL("${base.trimEnd('/')}/handset/pulse")
    val connection = (endpoint.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 8000
      readTimeout = 8000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer $token")
    }
    try {
      val body = """{"uid":${json(uid)},"label":${json(label)},"model":"Android"}"""
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      if (code == 401) {
        prefs.edit().clear().apply()
        stopSelf()
      }
    } catch (_: Exception) {
      // The next pulse retries. The desk marks the phone offline only after the pulses stop.
    } finally {
      connection.disconnect()
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(CHANNEL, "Payment watch", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Keeps this phone online while the screen is off."
    channel.setSound(null, null)
    manager.createNotificationChannel(channel)
  }

  private fun notification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val open = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    builder
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle("UniqBD Pay")
      .setContentText("Online. Watching for payment SMS.")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
    if (open != null) builder.setContentIntent(open)
    if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return builder.build()
  }

  private fun json(value: String): String {
    val escaped = value.take(80).replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
    return "\"$escaped\""
  }

  companion object {
    const val PREFS = "uniqpay_keep"
    private const val CHANNEL = "uniqpay_keep"
    private const val NOTICE_ID = 7

    fun start(context: Context, base: String, token: String, uid: String, label: String) {
      if (!base.startsWith("https://") || token.length < 20 || uid.length < 4) return
      val intent = Intent(context, KeepAliveService::class.java)
        .putExtra("base", base)
        .putExtra("token", token)
        .putExtra("uid", uid)
        .putExtra("label", label.take(80))
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    }

    fun stop(context: Context) {
      context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply()
      context.stopService(Intent(context, KeepAliveService::class.java))
    }
  }
}
