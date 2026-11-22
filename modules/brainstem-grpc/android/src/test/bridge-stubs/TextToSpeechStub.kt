package android.speech.tts

import android.content.Context
import android.os.Bundle
import java.util.Locale

class TextToSpeech(context: Context, listener: OnInitListener?) {
  fun interface OnInitListener {
    fun onInit(status: Int)
  }
  object Engine {
    const val KEY_PARAM_VOLUME = "volume"
  }
  companion object {
    const val SUCCESS = 0
    const val QUEUE_FLUSH = 0
  }
  init {
    listener?.onInit(SUCCESS)
  }
  fun setLanguage(loc: Locale): Int = 0
  fun speak(text: CharSequence, queueMode: Int, params: Bundle?, utteranceId: String?): Int = SUCCESS
  fun stop(): Int = SUCCESS
  fun shutdown() {}
}
