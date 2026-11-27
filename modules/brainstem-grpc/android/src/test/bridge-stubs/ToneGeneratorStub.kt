package android.media

object AudioManager {
  const val STREAM_MUSIC = 3
}

class ToneGenerator(streamType: Int, volume: Int) {
  fun startTone(toneType: Int, durationMs: Int): Boolean = true
  fun release() {}
  companion object {
    const val TONE_PROP_BEEP = 24
  }
}
