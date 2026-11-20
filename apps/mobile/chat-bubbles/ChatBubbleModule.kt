package com.amarpin.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class ChatBubbleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    promise.resolve(ChatHeads.canDraw(reactApplicationContext))
  }

  @ReactMethod
  fun askOverlayPermission() {
    ChatHeads.askPermission(reactApplicationContext)
  }

  @ReactMethod
  fun start(token: String, staff: Boolean, rooms: ReadableArray, origin: String, scheme: String) {
    val ids = ArrayList<String>(rooms.size())
    for (index in 0 until rooms.size()) {
      val id = rooms.getString(index)?.trim().orEmpty()
      if (id.isNotEmpty()) ids.add(id)
    }
    ChatBubbleService.start(reactApplicationContext, token, staff, ids, origin, scheme)
  }

  @ReactMethod
  fun stop() {
    ChatBubbleService.stop(reactApplicationContext)
  }

  companion object {
    const val NAME = "ChatBubbles"
  }
}
