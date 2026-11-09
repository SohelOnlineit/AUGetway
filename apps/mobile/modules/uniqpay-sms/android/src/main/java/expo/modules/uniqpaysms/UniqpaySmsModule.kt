package expo.modules.uniqpaysms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UniqpaySmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UniqpaySms")

    AsyncFunction("listPaymentSms") Coroutine { limit: Int ->
      if (!granted(Manifest.permission.READ_SMS)) {
        throw CodedException("SMS permission is not granted")
      }
      readPaymentSms(limit.coerceIn(1, 40))
    }

    AsyncFunction("listRecentSms") Coroutine { limit: Int ->
      if (!granted(Manifest.permission.READ_SMS)) {
        throw CodedException("SMS permission is not granted")
      }
      readRecentSms(limit.coerceIn(1, 60))
    }

    Function("batteryIgnored") {
      val power = context.getSystemService(PowerManager::class.java)
      power?.isIgnoringBatteryOptimizations(context.packageName) == true
    }

    Function("batteryLevel") {
      batteryPercent(context) ?: -1
    }

    Function("askBattery") {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
      intent.data = Uri.parse("package:${context.packageName}")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("startKeepAlive") { base: String, token: String, uid: String, label: String ->
      try {
        KeepAliveService.start(context.applicationContext, base, token, uid, label)
      } catch (_: Exception) {
        // Android blocked a start from the background. An already running watch keeps the last sign-in.
      }
    }

    Function("stopKeepAlive") {
      KeepAliveService.stop(context.applicationContext)
    }

    Function("setSmsSync") { spec: String ->
      SmsSync.configure(context.applicationContext, spec)
    }

    Function("syncedKeys") {
      SmsSync.keys(context.applicationContext)
    }

    Function("rememberSynced") { keys: List<String> ->
      SmsSync.remember(context.applicationContext, keys)
    }

    Function("clearSynced") {
      SmsSync.clear(context.applicationContext)
    }

    AsyncFunction("sendSms") Coroutine { to: String, message: String, slot: Int ->
      if (!granted(Manifest.permission.SEND_SMS)) {
        throw CodedException("SMS permission is not granted")
      }
      val number = normalizeBd(to) ?: throw CodedException("Use a Bangladesh mobile number, like 01XXXXXXXXX")
      val text = message.trim()
      if (text.length !in 1..320) throw CodedException("Message must be 1 to 320 characters")
      val manager = smsManager(if (slot == 1) 1 else 0)
      if (text.length <= 160) {
        manager.sendTextMessage(number, null, text, null, null)
      } else {
        manager.sendMultipartTextMessage(number, null, manager.divideMessage(text), null, null)
      }
    }
  }

  private fun granted(permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun smsManager(slot: Int): SmsManager {
    val fallback = if (Build.VERSION.SDK_INT >= 31) {
      context.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    } ?: throw CodedException("This phone cannot send SMS")
    if (!granted(Manifest.permission.READ_PHONE_STATE)) {
      throw CodedException("Allow phone permission so the desk can choose SIM 1 or SIM 2")
    }
    val subscriptions = context.getSystemService(SubscriptionManager::class.java)
      ?: return fallback
    val match = subscriptions.activeSubscriptionInfoList
      ?.firstOrNull { it.simSlotIndex == slot }
      ?: throw CodedException(if (slot == 1) "SIM 2 is not in this phone" else "SIM 1 is not in this phone")
    return if (Build.VERSION.SDK_INT >= 31) {
      fallback.createForSubscriptionId(match.subscriptionId)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getSmsManagerForSubscriptionId(match.subscriptionId)
    }
  }

  private fun readRecentSms(limit: Int): List<Map<String, Any>> {
    return readInbox(limit, paymentOnly = false)
  }

  private fun readPaymentSms(limit: Int): List<Map<String, Any>> {
    return readInbox(limit, paymentOnly = true)
  }

  private fun readInbox(limit: Int, paymentOnly: Boolean): List<Map<String, Any>> {
    val rows = ArrayList<Map<String, Any>>()
    val cursor = context.contentResolver.query(
      Telephony.Sms.Inbox.CONTENT_URI,
      arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
      null,
      null,
      "${Telephony.Sms.DATE} DESC",
    ) ?: return rows
    cursor.use {
      val addressIdx = it.getColumnIndex(Telephony.Sms.ADDRESS)
      val bodyIdx = it.getColumnIndex(Telephony.Sms.BODY)
      val dateIdx = it.getColumnIndex(Telephony.Sms.DATE)
      var scanned = 0
      while (it.moveToNext() && rows.size < limit && scanned < 200) {
        scanned += 1
        val address = if (addressIdx >= 0) it.getString(addressIdx).orEmpty() else ""
        val body = if (bodyIdx >= 0) it.getString(bodyIdx).orEmpty() else ""
        if (isPersonalNumber(address) || (paymentOnly && !isPayment(address, body))) continue
        rows.add(
          mapOf(
            "address" to address,
            "body" to body.take(500),
            "trxId" to parseTrx(body),
            "amount" to parseAmount(body),
            "receivedAt" to if (dateIdx >= 0) it.getLong(dateIdx) else 0L,
          ),
        )
      }
    }
    return rows
  }

  private fun isPersonalNumber(address: String): Boolean {
    val digits = address.filter { it.isDigit() }
    val local = if (digits.startsWith("880")) digits.drop(3) else digits
    return Regex("^01[3-9]\\d{8}$").matches(local)
  }

  private fun isPayment(address: String, body: String): Boolean {
    if (Regex("(?i)\\botp\\b").containsMatchIn(body) || Regex("(?i)\\bverification\\s*code\\b").containsMatchIn(body)) return false
    val from = address.trim().lowercase()
    val names = listOf("16216", "16269", "16316", "ab bank", "ab bank plc", "bank asia", "bkash", "brac bank", "cellfin", "city bank", "nagad", "rocket", "upay")
    return names.any { name ->
      if (name.all { it.isDigit() }) {
        val digits = from.filter { it.isDigit() }
        (if (digits.startsWith("880")) digits.drop(3) else digits) == name
      } else from == name || Regex("(^|[^a-z0-9])${Regex.escape(name)}([^a-z0-9]|$)").containsMatchIn(from)
    }
  }

  private fun parseTrx(body: String): String {
    val match = Regex("(?i)(?:trx\\s*id|trxid|txn\\s*id|transaction\\s*id)[:\\s]*([A-Z0-9]{6,})").find(body)
    return match?.groupValues?.getOrNull(1)?.uppercase().orEmpty()
  }

  private fun parseAmount(body: String): String {
    val labeled = Regex("(?i)(?:tk|bdt|৳)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)").find(body)
    val plain = Regex("([0-9][0-9,]*\\.[0-9]{2})").find(body)
    return (labeled ?: plain)?.groupValues?.getOrNull(1).orEmpty()
  }

  private fun normalizeBd(raw: String): String? {
    val digits = raw.filter { it.isDigit() }
    return when {
      Regex("^01[3-9]\\d{8}$").matches(digits) -> digits
      Regex("^8801[3-9]\\d{8}$").matches(digits) -> "0${digits.drop(3)}"
      else -> null
    }
  }
}
