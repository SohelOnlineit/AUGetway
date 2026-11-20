package expo.modules.uniqpaysms

import android.content.Context
import android.os.PowerManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

object Outbound {
  private const val SENT = "uniqpay_sent_jobs"
  private val inFlight = ConcurrentHashMap.newKeySet<String>()
  private val sender = Executors.newFixedThreadPool(4) { runnable ->
    Thread(runnable, "uniqpay-send").apply { isDaemon = true }
  }

  fun deliver(context: Context): Int {
    val prefs = context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE)
    if (prefs.getBoolean("userStop", false)) return 0
    val base = prefs.getString("base", null) ?: return 0
    val token = prefs.getString("token", null) ?: return 0
    val uid = prefs.getString("uid", null) ?: return 0
    if (!base.startsWith("https://") || token.length < 20 || uid.length < 4) return 0
    val listed = get("${base.trimEnd('/')}/handset/jobs?uid=${url(uid)}", token)
    if (listed.code == 401) return 401
    prefs.edit().putInt("pollCode", listed.code).apply()
    if (listed.code !in 200..299) return 0
    val jobs = try {
      JSONObject(listed.body).optJSONArray("jobs")
    } catch (_: Exception) {
      null
    } ?: return 0
    var started = 0
    for (index in 0 until jobs.length()) {
      val job = jobs.optJSONObject(index) ?: continue
      val id = job.optString("id")
      if (id.length < 4 || !inFlight.add(id)) continue
      started += 1
      val to = job.optString("to")
      val body = job.optString("body")
      val slot = job.optInt("simSlot")
      sender.execute {
        val power = context.getSystemService(PowerManager::class.java)
        val held = power?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "uniqpay:send")?.apply {
          setReferenceCounted(false)
        }
        val error = try {
          held?.acquire(25_000)
          if (!alreadySent(context, id)) {
            SmsSend.send(context, to, body, slot)
            rememberSent(context, id)
          }
          null
        } catch (cause: Exception) {
          cause.message ?: "Could not send the SMS"
        }
        try {
          val payload = JSONObject().put("uid", uid).put("ok", error == null)
          if (error != null) payload.put("error", error.take(180))
          post("${base.trimEnd('/')}/handset/jobs/$id", token, payload.toString())
        } finally {
          if (held?.isHeld == true) held.release()
          inFlight.remove(id)
        }
      }
    }
    return started
  }

  // Sent ids are kept in order so the oldest one is dropped first. A set could drop a recent id
  // and send the same SMS twice.
  private fun sentIds(context: Context): List<String> {
    val prefs = context.getSharedPreferences(SENT, Context.MODE_PRIVATE)
    val ordered = prefs.getString("order", null)
    if (ordered != null) return ordered.split(',').filter { it.isNotBlank() }
    return (prefs.getStringSet("ids", emptySet()) ?: emptySet()).toList()
  }

  private fun alreadySent(context: Context, id: String): Boolean {
    return sentIds(context).contains(id)
  }

  @Synchronized
  private fun rememberSent(context: Context, id: String) {
    val next = sentIds(context).toMutableList()
    if (!next.contains(id)) next.add(id)
    val kept = next.takeLast(200)
    context.getSharedPreferences(SENT, Context.MODE_PRIVATE).edit()
      .putString("order", kept.joinToString(","))
      .remove("ids")
      .apply()
  }

  private fun url(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())

  private fun get(address: String, token: String): Response {
    val connection = open(address, token, "GET")
    return try {
      val code = connection.responseCode
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      Response(code, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
    } catch (_: Exception) {
      Response(0, "")
    } finally {
      connection.disconnect()
    }
  }

  private fun post(address: String, token: String, body: String): Int {
    val connection = open(address, token, "POST")
    return try {
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      connection.responseCode
    } catch (_: Exception) {
      0
    } finally {
      connection.disconnect()
    }
  }

  private fun open(address: String, token: String, method: String): HttpURLConnection {
    return (URL(address).openConnection() as HttpURLConnection).apply {
      requestMethod = method
      instanceFollowRedirects = false
      connectTimeout = 15000
      readTimeout = 15000
      setRequestProperty("Authorization", "Bearer $token")
      if (method == "POST") doOutput = true
    }
  }

  private data class Response(val code: Int, val body: String)
}
