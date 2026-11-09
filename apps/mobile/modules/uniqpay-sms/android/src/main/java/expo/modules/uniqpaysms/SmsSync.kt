package expo.modules.uniqpaysms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object SmsSync {
  private const val RULES = "uniqpay_sms"
  private const val SEEN = "uniqpay_seen"

  fun configure(context: Context, spec: String) {
    val json = try {
      JSONObject(spec)
    } catch (_: Exception) {
      return
    }
    val senders = json.optJSONArray("senders") ?: JSONArray()
    val keywords = json.optJSONArray("keywords") ?: JSONArray()
    context.getSharedPreferences(RULES, Context.MODE_PRIVATE).edit()
      .putBoolean("enabled", json.optBoolean("enabled", true))
      .putInt("cleanDays", json.optInt("cleanDays", 0).coerceIn(0, 365))
      .putString("senders", senders.toString())
      .putString("keywords", keywords.toString())
      .apply()
  }

  fun keys(context: Context): List<String> {
    return seen(context).toList()
  }

  fun remember(context: Context, keys: Collection<String>) {
    if (keys.isEmpty()) return
    val next = seen(context).toMutableSet()
    keys.forEach { key ->
      val clean = key.trim().take(80)
      if (clean.length >= 4) next.add(clean)
    }
    while (next.size > 400) {
      val oldest = next.firstOrNull() ?: break
      next.remove(oldest)
    }
    context.getSharedPreferences(SEEN, Context.MODE_PRIVATE).edit().putStringSet("keys", next).apply()
  }

  fun clear(context: Context) {
    context.getSharedPreferences(SEEN, Context.MODE_PRIVATE).edit().clear().apply()
  }

  fun push(context: Context, base: String, token: String, uid: String): Int {
    if (!base.startsWith("https://") || token.length < 20 || uid.length < 4) return 0
    if (!enabled(context)) return 0
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) return 0
    val fresh = unread(context)
    if (fresh.isEmpty()) return 0
    val payload = JSONObject()
      .put("uid", uid.take(80))
      .put("messages", JSONArray().apply {
        fresh.forEach { row ->
          put(JSONObject().put("body", row.body).put("sender", row.sender).put("receivedKey", row.key))
        }
      })
    val connection = (URL("${base.trimEnd('/')}/handset/notices").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 8000
      readTimeout = 8000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer $token")
    }
    return try {
      connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      if (code == 401) return 401
      if (code == 404) return postOneByOne(base, token, uid, fresh, context)
      if (code !in 200..299) return 0
      val text = connection.inputStream.bufferedReader().use { it.readText() }
      val saved = JSONObject(text).optJSONArray("results") ?: JSONArray()
      val done = mutableListOf<String>()
      for (index in 0 until saved.length()) {
        val row = saved.optJSONObject(index) ?: continue
        if (row.optBoolean("ok")) done.add(row.optString("receivedKey"))
      }
      remember(context, done)
      200
    } catch (_: Exception) {
      0
    } finally {
      connection.disconnect()
    }
  }

  private fun postOneByOne(base: String, token: String, uid: String, rows: List<Row>, context: Context): Int {
    val done = mutableListOf<String>()
    for (row in rows) {
      val body = JSONObject().put("uid", uid.take(80)).put("body", row.body).put("sender", row.sender).put("receivedKey", row.key)
      val connection = (URL("${base.trimEnd('/')}/handset/notice").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 8000
        readTimeout = 8000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Authorization", "Bearer $token")
      }
      try {
        connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        if (connection.responseCode == 401) return 401
        if (connection.responseCode in 200..299) done.add(row.key)
      } catch (_: Exception) {
        // The next watch sends this message again.
      } finally {
        connection.disconnect()
      }
    }
    remember(context, done)
    return 200
  }

  private fun enabled(context: Context): Boolean {
    return context.getSharedPreferences(RULES, Context.MODE_PRIVATE).getBoolean("enabled", true)
  }

  private fun seen(context: Context): Set<String> {
    return context.getSharedPreferences(SEEN, Context.MODE_PRIVATE).getStringSet("keys", emptySet())?.toSet() ?: emptySet()
  }

  private data class Row(val key: String, val sender: String, val body: String)

  private fun unread(context: Context): List<Row> {
    val rules = context.getSharedPreferences(RULES, Context.MODE_PRIVATE)
    val cleanDays = rules.getInt("cleanDays", 0)
    val earliest = if (cleanDays > 0) System.currentTimeMillis() - cleanDays * 24L * 60L * 60L * 1000L else 0L
    val senders = names(rules.getString("senders", null))
    val keywords = names(rules.getString("keywords", null)).map { it.lowercase() }.filter { it.length >= 3 }
    val known = seen(context)
    val rows = mutableListOf<Row>()
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
      while (it.moveToNext() && rows.size < 20 && scanned < 80) {
        scanned += 1
        val address = if (addressIdx >= 0) it.getString(addressIdx).orEmpty() else ""
        val body = if (bodyIdx >= 0) it.getString(bodyIdx).orEmpty().take(500) else ""
        val receivedAt = if (dateIdx >= 0) it.getLong(dateIdx) else 0L
        if (earliest > 0 && receivedAt < earliest) break
        if (!uploadable(address, body, senders, keywords)) continue
        val key = "$receivedAt:${trx(body)}:$address".take(80)
        if (key.length < 4 || known.contains(key)) continue
        rows.add(Row(key, address.take(80), body))
      }
    }
    return rows
  }

  private fun names(raw: String?): List<String> {
    if (raw.isNullOrBlank()) return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).map { array.optString(it) }.filter { it.isNotBlank() }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun uploadable(address: String, body: String, senders: List<String>, keywords: List<String>): Boolean {
    if (body.length < 4 || personal(address) || otp(body)) return false
    val text = "$address $body".lowercase()
    if (keywords.any { text.contains(it) }) return false
    val allowed = if (senders.isEmpty()) defaultSenders else senders
    if (allowed.none { senderMatches(address, it) }) return false
    val lower = body.lowercase()
    if (listOf("transferred to", "transfer to", "sent to", "send money", "cash out", "payment to").any { lower.contains(it) }) return false
    return trx(body).isNotEmpty() || amount(body).isNotEmpty()
  }

  private val defaultSenders = listOf("16216", "16269", "16316", "AB BANK", "AB BANK PLC", "BANK ASIA", "bKash", "BRAC BANK", "Cellfin", "CITY BANK", "Nagad", "Rocket", "Upay")

  private fun personal(address: String): Boolean {
    val digits = address.filter { it.isDigit() }
    val local = if (digits.startsWith("880")) digits.drop(3) else digits
    return Regex("^01[3-9]\\d{8}$").matches(local)
  }

  private fun otp(body: String): Boolean {
    return Regex("(?i)\\botp\\b").containsMatchIn(body) || Regex("(?i)\\bverification\\s*code\\b").containsMatchIn(body)
  }

  private fun senderMatches(address: String, name: String): Boolean {
    val needle = name.trim().lowercase()
    val from = address.trim().lowercase()
    if (needle.length < 2 || from.isEmpty()) return false
    if (needle.all { it.isDigit() }) {
      val digits = from.filter { it.isDigit() }
      return (if (digits.startsWith("880")) digits.drop(3) else digits) == needle
    }
    if (from == needle) return true
    return Regex("(^|[^a-z0-9])${Regex.escape(needle)}([^a-z0-9]|$)").containsMatchIn(from)
  }

  private fun trx(body: String): String {
    val match = Regex("(?i)(?:trx\\s*id|trxid|txn\\s*id|transaction\\s*id)[:\\s]*([A-Z0-9]{6,})").find(body)
    return match?.groupValues?.getOrNull(1)?.uppercase().orEmpty()
  }

  private fun amount(body: String): String {
    val labeled = Regex("(?i)(?:tk|bdt|৳)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)").find(body)
    val plain = Regex("([0-9][0-9,]*\\.[0-9]{2})").find(body)
    return (labeled ?: plain)?.groupValues?.getOrNull(1).orEmpty()
  }
}
