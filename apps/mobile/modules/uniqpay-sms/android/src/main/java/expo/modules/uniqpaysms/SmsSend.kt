package expo.modules.uniqpaysms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

object SmsSend {
  private val deliveryThread = HandlerThread("uniqpay-sms-result").apply { start() }
  private val delivery = Handler(deliveryThread.looper)
  private val requests = AtomicInteger(20)

  fun send(context: Context, to: String, message: String, slot: Int) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
      throw IllegalStateException("SMS permission is not granted")
    }
    val number = normalize(to) ?: throw IllegalStateException("Use a Bangladesh mobile number, like 01XXXXXXXXX")
    val text = message.trim()
    if (text.length !in 1..320) throw IllegalStateException("Message must be 1 to 320 characters")
    if (Looper.myLooper() == delivery.looper) throw IllegalStateException("Could not send the SMS")
    val manager = manager(context, if (slot == 1) 1 else 0)
    val parts = if (text.length <= 160) listOf(text) else manager.divideMessage(text)
    val app = context.applicationContext
    val results = arrayOfNulls<String>(parts.size)
    val latch = CountDownLatch(parts.size)
    val receivers = ArrayList<BroadcastReceiver>(parts.size)
    try {
      val sentIntents = ArrayList<PendingIntent>(parts.size)
      for (index in parts.indices) {
        val action = "expo.modules.uniqpaysms.SMS_SENT.${requests.incrementAndGet()}"
        val receiver = object : BroadcastReceiver() {
          override fun onReceive(ctx: Context, intent: Intent) {
            results[index] = reason(resultCode)
            latch.countDown()
          }
        }
        if (Build.VERSION.SDK_INT >= 33) {
          app.registerReceiver(receiver, IntentFilter(action), null, delivery, Context.RECEIVER_EXPORTED)
        } else if (Build.VERSION.SDK_INT >= 26) {
          app.registerReceiver(receiver, IntentFilter(action), null, delivery)
        } else {
          app.registerReceiver(receiver, IntentFilter(action))
        }
        receivers += receiver
        val call = Intent(action).setPackage(app.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        sentIntents += PendingIntent.getBroadcast(app, requests.get(), call, flags)
      }
      try {
        if (parts.size == 1) {
          manager.sendTextMessage(number, null, parts[0], sentIntents[0], null)
        } else {
          manager.sendMultipartTextMessage(number, null, ArrayList(parts), sentIntents, null)
        }
      } catch (error: Exception) {
        for (index in parts.indices) {
          if (results[index] == null) results[index] = error.message ?: "Could not send the SMS"
          latch.countDown()
        }
      }
      if (!latch.await(15, TimeUnit.SECONDS)) throw IllegalStateException("The SIM did not accept the SMS")
    } finally {
      receivers.forEach { receiver ->
        try {
          app.unregisterReceiver(receiver)
        } catch (_: Exception) {
          // The receiver was already removed after a failed registration.
        }
      }
    }
    val problem = results.firstOrNull { !it.isNullOrBlank() }
    if (problem != null) throw IllegalStateException(problem)
  }

  private fun reason(code: Int): String? {
    return when (code) {
      Activity.RESULT_OK -> null
      SmsManager.RESULT_ERROR_NO_SERVICE -> "No mobile network"
      SmsManager.RESULT_ERROR_RADIO_OFF -> "The phone radio is off"
      else -> "The SIM did not send the SMS"
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
      return fallback
    }
    val subscriptions = context.getSystemService(SubscriptionManager::class.java) ?: return fallback
    val list = try {
      subscriptions.activeSubscriptionInfoList
    } catch (_: SecurityException) {
      null
    }
    if (list.isNullOrEmpty()) return fallback
    val match = list.firstOrNull { it.simSlotIndex == slot } ?: if (list.size == 1) list.first() else null
    if (match == null) throw IllegalStateException(if (slot == 1) "SIM 2 is not in this phone" else "SIM 1 is not in this phone")
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
