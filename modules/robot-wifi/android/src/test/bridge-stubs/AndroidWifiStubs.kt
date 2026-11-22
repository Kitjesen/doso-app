package android.net.wifi

class WifiSsid(private val value: String) {
  override fun toString(): String = value
}

class ScanResult(
  var SSID: String? = null,
  var wifiSsid: WifiSsid? = null,
)

class WifiInfo(var ssid: String? = null)

class WifiNetworkSpecifier(val ssid: String) {
  class Builder {
    private var ssid: String = ""
    fun setSsid(ssid: String): Builder {
      this.ssid = ssid
      return this
    }
    fun build(): WifiNetworkSpecifier = WifiNetworkSpecifier(ssid)
  }
}

class WifiManager {
  var isWifiEnabled: Boolean = true
  var connectionInfo: WifiInfo? = WifiInfo(null)
  var scanResults: List<ScanResult> = emptyList()
  var startScanResult: Boolean = true
  var throwOnIsWifiEnabled: Throwable? = null
  var throwOnMulticastAcquire: Throwable? = null
  val createdMulticastLocks = mutableListOf<MulticastLock>()

  fun startScan(): Boolean = startScanResult

  fun createMulticastLock(tag: String): MulticastLock {
    val lock = MulticastLock(tag, throwOnMulticastAcquire)
    createdMulticastLocks.add(lock)
    return lock
  }

  inner class MulticastLock(
    val tag: String,
    private val acquireError: Throwable?,
  ) {
    var refCountedFlag: Boolean = true
    var isHeld: Boolean = false
    var acquireCalls: Int = 0
    var releaseCalls: Int = 0

    fun setReferenceCounted(refCounted: Boolean) {
      refCountedFlag = refCounted
    }

    fun acquire() {
      acquireCalls += 1
      acquireError?.let { throw it }
      isHeld = true
    }

    fun release() {
      releaseCalls += 1
      isHeld = false
    }
  }

  companion object {
    const val SCAN_RESULTS_AVAILABLE_ACTION = "android.net.wifi.SCAN_RESULTS"
  }
}
