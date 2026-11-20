package com.amarpin.app

import android.app.Activity
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Base64
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import org.json.JSONObject
import java.net.URI

/** Keeps the live-chat socket open while the app is in the background and raises a chat head. */
class ChatBubbleService : Service() {
  private var socket: Socket? = null
  private var userId: String? = null
  private var staff = false
  private var origin = "https://amarpin.com"
  private var scheme = "amarpin"
  private val rooms = linkedSetOf<String>()
  private val seen = ArrayDeque<String>()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    startInForeground()
    watchActivities()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopWatching()
      return START_NOT_STICKY
    }
    val token = intent?.getStringExtra(EXTRA_TOKEN)?.trim().orEmpty()
    if (token.isEmpty()) return START_STICKY
    staff = intent?.getBooleanExtra(EXTRA_STAFF, false) == true
    origin = intent?.getStringExtra(EXTRA_ORIGIN)?.trim().orEmpty().ifEmpty { origin }.trimEnd('/')
    scheme = intent?.getStringExtra(EXTRA_SCHEME)?.trim().orEmpty().ifEmpty { scheme }
    userId = userIdFromJwt(token)
    val incoming = intent?.getStringArrayListExtra(EXTRA_ROOMS).orEmpty()
    val fresh = incoming.filter { it.isNotBlank() }
    val added = fresh.filter { rooms.add(it) }
    if (socket == null) {
      connect(token)
    } else if (socket?.connected() == true) {
      added.forEach { join(it) }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    socket?.off()
    socket?.disconnect()
    socket = null
    ChatHeads.hide()
    super.onDestroy()
  }

  private fun connect(token: String) {
    try {
      val options = IO.Options().apply {
        auth = mapOf("token" to token)
        reconnection = true
        forceNew = true
        path = "/socket.io/"
        timeout = 20_000
      }
      val client = IO.socket(URI.create("$origin/chat"), options)
      client.on(Socket.EVENT_CONNECT, Emitter.Listener {
        rooms.forEach { roomId -> join(roomId) }
      })
      client.on("chat.message", Emitter.Listener { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@Listener
        onMessage(payload)
      })
      client.connect()
      socket = client
    } catch (error: Exception) {
      Log.w(TAG, "Live chat socket did not open", error)
    }
  }

  private fun join(roomId: String) {
    socket?.emit("chat.room.join", JSONObject().put("roomId", roomId))
  }

  private fun onMessage(payload: JSONObject) {
    val id = payload.optString("id")
    if (id.isNotEmpty()) {
      if (seen.contains(id)) return
      seen.addLast(id)
      while (seen.size > 80) seen.removeFirst()
    }
    val sender = payload.optString("senderUserId")
    if (sender.isNotEmpty() && sender == userId) return
    ChatHeads.ping(this)
    if (ChatHeads.appIsOpen()) return
    val roomId = payload.optString("roomId")
    val name = payload.optString("senderDisplayName").ifBlank {
      if (payload.optBoolean("senderIsStaff")) "Support" else "Customer"
    }
    val body = payload.optString("body").trim().ifBlank {
      if (payload.optString("imageUrl").isNotBlank()) "Sent a photo" else "New message"
    }
    val url = if (staff && roomId.isNotBlank()) {
      "$scheme://admin/chat?room=$roomId"
    } else {
      "$scheme://chat"
    }
    ChatHeads.show(this, name, body.take(140), url)
  }

  private fun stopWatching() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun startInForeground() {
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_chat)
      .setContentTitle("Live chat")
      .setContentText("Message bubbles are on")
      .setOngoing(true)
      .setContentIntent(open)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL, "Live chat", NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun watchActivities() {
    if (watching) return
    watching = true
    // The site loads this service while the app is already on screen.
    ChatHeads.resumedActivities = 1
    val application = application
    if (application !is Application) return
    application.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
      override fun onActivityResumed(activity: Activity) {
        ChatHeads.resumedActivities = 1
        ChatHeads.hide()
      }

      override fun onActivityPaused(activity: Activity) {
        ChatHeads.resumedActivities = 0
      }

      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
      override fun onActivityStarted(activity: Activity) {}
      override fun onActivityStopped(activity: Activity) {}
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {}
    })
  }

  companion object {
    private const val TAG = "ChatBubble"
    private const val CHANNEL = "amarpin.chat"
    private const val NOTIFICATION_ID = 7101
    private const val ACTION_STOP = "com.amarpin.app.chat.STOP"
    private const val EXTRA_TOKEN = "token"
    private const val EXTRA_STAFF = "staff"
    private const val EXTRA_ROOMS = "rooms"
    private const val EXTRA_ORIGIN = "origin"
    private const val EXTRA_SCHEME = "scheme"
    private var watching = false

    fun start(context: Context, token: String, staff: Boolean, rooms: ArrayList<String>, origin: String, scheme: String) {
      val intent = Intent(context, ChatBubbleService::class.java).apply {
        putExtra(EXTRA_TOKEN, token)
        putExtra(EXTRA_STAFF, staff)
        putStringArrayListExtra(EXTRA_ROOMS, rooms)
        putExtra(EXTRA_ORIGIN, origin)
        putExtra(EXTRA_SCHEME, scheme)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      val intent = Intent(context, ChatBubbleService::class.java).setAction(ACTION_STOP)
      context.startService(intent)
    }

    private fun userIdFromJwt(token: String): String? {
      val parts = token.split('.')
      if (parts.size < 2) return null
      return try {
        val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
        JSONObject(payload).optString("sub").ifBlank { null }
      } catch (_: IllegalArgumentException) {
        null
      }
    }
  }
}
