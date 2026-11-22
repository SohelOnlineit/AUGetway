package expo.modules.uniqpaysms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    val booted = action == Intent.ACTION_BOOT_COMPLETED || action == "android.intent.action.QUICKBOOT_POWERON" || action == "com.htc.intent.action.QUICKBOOT_POWERON"
    if (!booted) return
    val prefs = context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE)
    val base = prefs.getString("base", null) ?: return
    val token = prefs.getString("token", null) ?: return
    val uid = prefs.getString("uid", null) ?: return
    val label = prefs.getString("label", null) ?: "AU-Getway phone"
    val start = Intent(context, KeepAliveService::class.java)
      .putExtra("base", base)
      .putExtra("token", token)
      .putExtra("uid", uid)
      .putExtra("label", label)
    if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(start) else context.startService(start)
    Watch.schedule(context, 15_000)
  }
}
