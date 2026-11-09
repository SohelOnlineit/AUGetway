package expo.modules.uniqpaysms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class WatchReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val prefs = context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE)
    if (prefs.getBoolean("userStop", false)) return
    val base = prefs.getString("base", null) ?: return
    val token = prefs.getString("token", null) ?: return
    val uid = prefs.getString("uid", null) ?: return
    val label = prefs.getString("label", null) ?: "UniqBD handset"
    val pending = goAsync()
    Thread {
      try {
        val code = Heartbeat.send(context)
        if (code == 401 || (code in 200..299 && Outbound.deliver(context) == 401)) {
          prefs.edit().clear().putBoolean("userStop", true).apply()
          Watch.cancel(context)
          context.stopService(Intent(context, KeepAliveService::class.java))
          return@Thread
        }
        try {
          KeepAliveService.start(context, base, token, uid, label)
        } catch (_: Exception) {
          // The pulse above already checked in. The next alarm starts the watch again.
        }
        Watch.schedule(context)
      } finally {
        pending.finish()
      }
    }.apply {
      name = "uniqpay-wake"
      start()
    }
  }
}

object Watch {
  private const val REQUEST = 8

  private fun pending(context: Context): PendingIntent {
    val intent = Intent(context, WatchReceiver::class.java)
    return PendingIntent.getBroadcast(context, REQUEST, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun schedule(context: Context, delayMs: Long = 60_000) {
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    val at = System.currentTimeMillis() + delayMs
    val call = pending(context)
    val exact = Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()
    if (exact && Build.VERSION.SDK_INT >= 23) {
      alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, call)
    } else if (Build.VERSION.SDK_INT >= 23) {
      alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, call)
    } else {
      alarm.setExact(AlarmManager.RTC_WAKEUP, at, call)
    }
  }

  fun cancel(context: Context) {
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    alarm.cancel(pending(context))
  }
}
