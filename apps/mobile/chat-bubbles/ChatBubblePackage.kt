package com.amarpin.app

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class ChatBubblePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    if (name == ChatBubbleModule.NAME) return ChatBubbleModule(reactContext)
    return null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        ChatBubbleModule.NAME to
          ReactModuleInfo(
            ChatBubbleModule.NAME,
            ChatBubbleModule.NAME,
            false,
            false,
            false,
            false,
          ),
      )
    }
  }
}
