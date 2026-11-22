package expo.modules.uniqpaysms

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL

object Heartbeat {
  fun send(context: Context): Int {
    val prefs = context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE)
    if (prefs.getBoolean("userStop", false)) return 0
    val base = prefs.getString("base", null) ?: return 0
    val token = prefs.getString("token", null) ?: return 0
    val uid = prefs.getString("uid", null) ?: return 0
    val label = prefs.getString("label", null) ?: "AU-Getway phone"
    if (!base.startsWith("https://") || token.length < 20 || uid.length < 4) return 0
    val percent = batteryPercent(context)
    val charge = if (percent == null) "" else ""","battery":$percent"""
    val body = """{"uid":${json(uid)},"label":${json(label)},"model":"Android"$charge}"""
    val connection = (URL("${base.trimEnd('/')}/handset/pulse").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      instanceFollowRedirects = false
      connectTimeout = 5000
      readTimeout = 5000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer $token")
    }
    return try {
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      connection.responseCode
    } catch (_: Exception) {
      0
    } finally {
      connection.disconnect()
    }
  }

  private fun json(value: String): String {
    val escaped = value.take(80).replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
    return "\"$escaped\""
  }
}
