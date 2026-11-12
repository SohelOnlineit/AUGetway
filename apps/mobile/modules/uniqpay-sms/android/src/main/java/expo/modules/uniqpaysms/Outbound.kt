package expo.modules.uniqpaysms

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object Outbound {
  private const val SENT = "uniqpay_sent_jobs"

  fun deliver(context: Context): Int {
    val prefs = context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE)
    if (prefs.getBoolean("userStop", false)) return 0
    val base = prefs.getString("base", null) ?: return 0
    val token = prefs.getString("token", null) ?: return 0
    val uid = prefs.getString("uid", null) ?: return 0
    if (!base.startsWith("https://") || token.length < 20 || uid.length < 4) return 0
    val listed = get("${base.trimEnd('/')}/handset/jobs?uid=${url(uid)}", token)
    if (listed.code == 401) return 401
    if (listed.code !in 200..299) return 0
    val jobs = try {
      JSONObject(listed.body).optJSONArray("jobs")
    } catch (_: Exception) {
      null
    } ?: return 0
    for (index in 0 until jobs.length()) {
      val job = jobs.optJSONObject(index) ?: continue
      val id = job.optString("id")
      if (id.length < 4) continue
      val error = if (alreadySent(context, id)) {
        null
      } else {
        try {
          SmsSend.send(context, job.optString("to"), job.optString("body"), job.optInt("simSlot"))
          rememberSent(context, id)
          null
        } catch (cause: Exception) {
          cause.message ?: "Could not send the SMS"
        }
      }
      val payload = JSONObject().put("uid", uid).put("ok", error == null)
      if (error != null) payload.put("error", error.take(180))
      val saved = post("${base.trimEnd('/')}/handset/jobs/$id", token, payload.toString())
      if (saved == 401) return 401
    }
    return 200
  }

  private fun alreadySent(context: Context, id: String): Boolean {
    val saved = context.getSharedPreferences(SENT, Context.MODE_PRIVATE).getStringSet("ids", emptySet()) ?: emptySet()
    return saved.contains(id)
  }

  private fun rememberSent(context: Context, id: String) {
    val prefs = context.getSharedPreferences(SENT, Context.MODE_PRIVATE)
    val next = (prefs.getStringSet("ids", emptySet()) ?: emptySet()).toMutableSet()
    next.add(id)
    while (next.size > 100) {
      val oldest = next.firstOrNull() ?: break
      next.remove(oldest)
    }
    prefs.edit().putStringSet("ids", next).apply()
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
      connectTimeout = 5000
      readTimeout = 5000
      setRequestProperty("Authorization", "Bearer $token")
      if (method == "POST") doOutput = true
    }
  }

  private data class Response(val code: Int, val body: String)
}
