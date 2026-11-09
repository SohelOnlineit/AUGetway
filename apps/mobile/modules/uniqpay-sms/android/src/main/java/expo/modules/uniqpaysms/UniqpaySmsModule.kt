package expo.modules.uniqpaysms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
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
      readPaymentSms(limit.coerceIn(1, 20))
    }

    AsyncFunction("sendSms") Coroutine { to: String, message: String ->
      if (!granted(Manifest.permission.SEND_SMS)) {
        throw CodedException("SMS permission is not granted")
      }
      val number = normalizeBd(to) ?: throw CodedException("Use a Bangladesh mobile number, like 01XXXXXXXXX")
      val text = message.trim()
      if (text.length !in 1..320) throw CodedException("Message must be 1 to 320 characters")
      val manager = smsManager()
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

  private fun smsManager(): SmsManager {
    val manager = if (Build.VERSION.SDK_INT >= 31) {
      context.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    }
    return manager ?: throw CodedException("This phone cannot send SMS")
  }

  private fun readPaymentSms(limit: Int): List<Map<String, Any>> {
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
      while (it.moveToNext() && rows.size < limit && scanned < 80) {
        scanned += 1
        val address = if (addressIdx >= 0) it.getString(addressIdx).orEmpty() else ""
        val body = if (bodyIdx >= 0) it.getString(bodyIdx).orEmpty() else ""
        if (!isPayment(address, body)) continue
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

  private fun isPayment(address: String, body: String): Boolean {
    val text = "$address $body".lowercase()
    val wallet = listOf("bkash", "nagad", "rocket", "upay", "16216", "16316")
    val aboutMoney = text.contains("trx") || text.contains("txn") || text.contains("received") || text.contains("cash in")
    return wallet.any { text.contains(it) } && aboutMoney
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
