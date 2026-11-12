package expo.modules.uniqpaysms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class KeepAliveService : Service() {
  @Volatile private var running = false
  private var worker: Thread? = null
  private var wake: PowerManager.WakeLock? = null
  private var wifi: WifiManager.WifiLock? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    val power = getSystemService(PowerManager::class.java)
    wake = power?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "uniqpay:keepalive")?.apply {
      setReferenceCounted(false)
    }
    try {
      val radios = applicationContext.getSystemService(WifiManager::class.java)
      wifi = radios?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "uniqpay:wifi")?.apply {
        setReferenceCounted(false)
      }
    } catch (_: Exception) {
      wifi = null
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
        .putBoolean("userStop", false)
        .apply()
    } else {
      prefs.edit().putBoolean("userStop", false).apply()
    }
    val notice = notification()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTICE_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTICE_ID, notice)
    }
    if (wake?.isHeld != true) {
      try {
        wake?.acquire()
      } catch (_: Exception) {
        // The alarm still wakes the phone if the lock is refused.
      }
    }
    if (wifi?.isHeld != true) {
      try {
        wifi?.acquire()
      } catch (_: Exception) {
        // Mobile data does not need the Wi-Fi lock.
      }
    }
    Watch.schedule(applicationContext)
    ensureLoop()
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    Watch.schedule(applicationContext, 5_000)
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    running = false
    worker?.interrupt()
    worker = null
    if (wake?.isHeld == true) wake?.release()
    if (wifi?.isHeld == true) wifi?.release()
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val stopped = prefs.getBoolean("userStop", false)
    val token = prefs.getString("token", null)
    if (!stopped && !token.isNullOrBlank()) Watch.schedule(applicationContext, 15_000) else Watch.cancel(applicationContext)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun ensureLoop() {
    if (worker?.isAlive == true) return
    running = true
    worker = Thread {
      var beat = 0
      while (running) {
        try {
          if (beat == 0) ping() else if (Outbound.deliver(this) == 401) signOff()
        } catch (_: Exception) {
          // One failed send must not stop the watch. The next pass tries again.
        }
        if (!running) break
        beat = (beat + 1) % 3
        try {
          Watch.schedule(applicationContext, 15_000)
        } catch (_: Exception) {
          // The running loop still checks the queue on the next pass.
        }
        try {
          Thread.sleep(5_000)
        } catch (_: InterruptedException) {
          break
        }
      }
    }.apply {
      name = "uniqpay-keep"
      isDaemon = true
      start()
    }
  }

  private fun ping() {
    val code = Heartbeat.send(this)
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    if (code == 401) {
      signOff()
      return
    }
    if (Outbound.deliver(this) == 401) {
      signOff()
      return
    }
    if (code !in 200..299) return
    val base = prefs.getString("base", null) ?: return
    val token = prefs.getString("token", null) ?: return
    val uid = prefs.getString("uid", null) ?: return
    if (SmsSync.push(applicationContext, base, token, uid) == 401) signOff()
  }

  private fun signOff() {
    running = false
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().putBoolean("userStop", true).apply()
    Watch.cancel(applicationContext)
    stopSelf()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(CHANNEL, "AU-Getway", NotificationManager.IMPORTANCE_DEFAULT)
    channel.description = "Keeps this phone online while the screen is off."
    channel.setSound(null, null)
    channel.enableVibration(false)
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
      .setContentTitle("AU-Getway")
      .setContentText("Online. This phone stays connected in the background.")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_SERVICE)
    if (open != null) builder.setContentIntent(open)
    if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return builder.build()
  }

  companion object {
    const val PREFS = "uniqpay_keep"
    private const val CHANNEL = "uniqpay_online"
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
      context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().putBoolean("userStop", true).apply()
      Watch.cancel(context)
      context.stopService(Intent(context, KeepAliveService::class.java))
    }
  }
}
