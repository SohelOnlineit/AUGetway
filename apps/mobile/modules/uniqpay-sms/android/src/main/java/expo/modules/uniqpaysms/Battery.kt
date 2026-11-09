package expo.modules.uniqpaysms

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

fun batteryPercent(context: Context): Int? {
  val sticky = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
  val level = sticky.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
  val scale = sticky.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
  if (level < 0 || scale <= 0) return null
  return (level * 100 / scale).coerceIn(0, 100)
}
