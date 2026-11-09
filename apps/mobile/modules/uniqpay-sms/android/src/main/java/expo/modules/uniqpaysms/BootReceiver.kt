package expo.modules.uniqpaysms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
    val prefs = context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE)
    val base = prefs.getString("base", null) ?: return
    val token = prefs.getString("token", null) ?: return
    val uid = prefs.getString("uid", null) ?: return
    val label = prefs.getString("label", null) ?: "UniqBD handset"
    val start = Intent(context, KeepAliveService::class.java)
      .putExtra("base", base)
      .putExtra("token", token)
      .putExtra("uid", uid)
      .putExtra("label", label)
    if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(start) else context.startService(start)
  }
}
