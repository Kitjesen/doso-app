package android.provider

object Settings {
  object Secure {
    const val LOCATION_MODE = "location_mode"
    const val LOCATION_MODE_OFF = 0
    var modeValue: Int = 3

    fun getInt(resolver: Any?, name: String, def: Int): Int = modeValue
  }
}
