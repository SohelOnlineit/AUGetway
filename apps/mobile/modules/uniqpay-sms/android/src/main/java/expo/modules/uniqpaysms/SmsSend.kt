package expo.modules.uniqpaysms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

object SmsSend {
  fun send(context: Context, to: String, message: String, slot: Int) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
      throw IllegalStateException("SMS permission is not granted")
    }
    val number = normalize(to) ?: throw IllegalStateException("Use a Bangladesh mobile number, like 01XXXXXXXXX")
    val text = message.trim()
    if (text.length !in 1..320) throw IllegalStateException("Message must be 1 to 320 characters")
    val manager = manager(context, if (slot == 1) 1 else 0)
    if (text.length <= 160) {
      manager.sendTextMessage(number, null, text, null, null)
    } else {
      manager.sendMultipartTextMessage(number, null, manager.divideMessage(text), null, null)
    }
  }

  private fun manager(context: Context, slot: Int): SmsManager {
    val fallback = if (Build.VERSION.SDK_INT >= 31) {
      context.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    } ?: throw IllegalStateException("This phone cannot send SMS")
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
      throw IllegalStateException("Allow phone permission so the desk can choose SIM 1 or SIM 2")
    }
    val subscriptions = context.getSystemService(SubscriptionManager::class.java) ?: return fallback
    val match = subscriptions.activeSubscriptionInfoList
      ?.firstOrNull { it.simSlotIndex == slot }
      ?: throw IllegalStateException(if (slot == 1) "SIM 2 is not in this phone" else "SIM 1 is not in this phone")
    return if (Build.VERSION.SDK_INT >= 31) {
      fallback.createForSubscriptionId(match.subscriptionId)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getSmsManagerForSubscriptionId(match.subscriptionId)
    }
  }

  private fun normalize(raw: String): String? {
    val digits = raw.filter { it.isDigit() }
    return when {
      Regex("^01[3-9]\\d{8}$").matches(digits) -> digits
      Regex("^8801[3-9]\\d{8}$").matches(digits) -> "0${digits.drop(3)}"
      else -> null
    }
  }
}
