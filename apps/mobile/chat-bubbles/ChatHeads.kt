package com.amarpin.app

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/** Messenger-style chat head drawn over other apps. */
object ChatHeads {
  private val main = Handler(Looper.getMainLooper())
  private var window: WindowManager? = null
  private var root: View? = null
  private var params: WindowManager.LayoutParams? = null
  private var preview: TextView? = null
  private var badge: TextView? = null
  private var count = 0
  private var latestUrl: String? = null
  private var hidePreview: Runnable? = null
  private var ringtone: Ringtone? = null
  private var beep: ToneGenerator? = null
  @Volatile var resumedActivities = 0

  fun canDraw(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(context) else true
  }

  fun askPermission(context: Context) {
    if (canDraw(context)) return
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }

  fun appIsOpen(): Boolean = resumedActivities > 0

  fun show(context: Context, title: String, body: String, url: String) {
    main.post { showOnMain(context.applicationContext, title, body, url) }
  }

  fun hide() {
    main.post { remove() }
  }

  private fun showOnMain(context: Context, title: String, body: String, url: String) {
    if (!canDraw(context)) return
    latestUrl = url
    count = (count + 1).coerceAtMost(99)
    val manager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    if (root == null) {
      val view = buildView(context)
      val layout = layoutParams()
      val metrics = context.resources.displayMetrics
      layout.x = metrics.widthPixels - dp(context, 84)
      layout.y = (metrics.heightPixels * 0.42f).toInt()
      try {
        manager.addView(view, layout)
      } catch (_: RuntimeException) {
        root = null
        return
      }
      window = manager
      root = view
      params = layout
    }
    badge?.text = if (count > 9) "9+" else count.toString()
    badge?.visibility = View.VISIBLE
    preview?.text = "$title\n$body"
    preview?.visibility = View.VISIBLE
    hidePreview?.let { main.removeCallbacks(it) }
    val hide = Runnable { preview?.visibility = View.GONE }
    hidePreview = hide
    main.postDelayed(hide, 4500)
  }

  private fun remove() {
    hidePreview?.let { main.removeCallbacks(it) }
    hidePreview = null
    val view = root
    val manager = window
    root = null
    window = null
    params = null
    preview = null
    badge = null
    count = 0
    latestUrl = null
    if (view != null && manager != null) {
      try {
        manager.removeView(view)
      } catch (_: RuntimeException) {
        // The window was already detached.
      }
    }
  }

  private fun buildView(context: Context): View {
    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val card = TextView(context).apply {
      textSize = 13f
      setTextColor(0xFFF8FAFC.toInt())
      maxLines = 3
      val pad = dp(context, 12)
      setPadding(pad, dp(context, 10), pad, dp(context, 10))
      background = GradientDrawable().apply {
        cornerRadius = dp(context, 16).toFloat()
        setColor(0xF0031A22.toInt())
      }
      visibility = View.GONE
    }
    preview = card

    val bubble = FrameLayout(context)
    val circle = View(context).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(0xFF26BFB0.toInt())
      }
    }
    val mark = TextView(context).apply {
      text = "A"
      textSize = 20f
      setTextColor(0xFF042F2E.toInt())
      gravity = Gravity.CENTER
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    }
    val countLabel = TextView(context).apply {
      textSize = 11f
      setTextColor(0xFFFFFFFF.toInt())
      gravity = Gravity.CENTER
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(0xFFE11D48.toInt())
      }
      visibility = View.GONE
    }
    badge = countLabel
    val size = dp(context, 58)
    bubble.addView(circle, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
    bubble.addView(mark, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
    val badgeSize = dp(context, 22)
    bubble.addView(
      countLabel,
      FrameLayout.LayoutParams(badgeSize, badgeSize, Gravity.END or Gravity.TOP),
    )
    row.addView(card, LinearLayout.LayoutParams(dp(context, 210), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
      marginEnd = dp(context, 8)
    })
    row.addView(bubble, LinearLayout.LayoutParams(dp(context, 64), dp(context, 64)))
    row.setOnTouchListener(dragListener(context))
    return row
  }

  private fun dragListener(context: Context): View.OnTouchListener {
    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var moved = false
    return View.OnTouchListener { _, event ->
      val layout = params ?: return@OnTouchListener false
      val manager = window ?: return@OnTouchListener false
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          startX = layout.x
          startY = layout.y
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - downX).toInt()
          val dy = (event.rawY - downY).toInt()
          if (abs(dx) > dp(context, 6) || abs(dy) > dp(context, 6)) moved = true
          layout.x = startX + dx
          layout.y = startY + dy
          try {
            manager.updateViewLayout(root, layout)
          } catch (_: RuntimeException) {
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) openLatest(context)
          true
        }
        else -> false
      }
    }
  }

  private fun openLatest(context: Context) {
    val url = latestUrl ?: return
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url), context, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    context.startActivity(intent)
    remove()
  }

  private fun layoutParams(): WindowManager.LayoutParams {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    return WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
    }
  }

  private fun dp(context: Context, value: Int): Int {
    return (value * context.resources.displayMetrics.density).toInt()
  }

  fun ping(context: Context) {
    val appContext = context.applicationContext
    main.post {
      if (!playRingtone(appContext)) playBeep()
    }
  }

  private fun playRingtone(context: Context): Boolean {
    return try {
      val tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) ?: return false
      val next = RingtoneManager.getRingtone(context, tone) ?: return false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        next.audioAttributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      }
      ringtone?.stop()
      ringtone = next
      next.play()
      true
    } catch (_: RuntimeException) {
      false
    }
  }

  private fun playBeep() {
    try {
      beep?.release()
      val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
      beep = tone
      tone.startTone(ToneGenerator.TONE_PROP_ACK, 180)
    } catch (_: RuntimeException) {
    }
  }
}
