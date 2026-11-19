package android.net.wifi

class WifiInfo(var rssi: Int = -70)
class WifiManager {
  val connectionInfo = WifiInfo()
  var lastLock: WifiLock? = null
  fun createWifiLock(mode: Int, tag: String) = WifiLock().also { lastLock = it }
  class WifiLock {
    var isHeld = false
    fun setReferenceCounted(value: Boolean) {}
    fun acquire() { check(!isHeld); isHeld = true }
    fun release() { check(isHeld); isHeld = false }
  }
  companion object { const val WIFI_MODE_FULL_LOW_LATENCY = 4; const val WIFI_MODE_FULL_HIGH_PERF = 3 }
}
