package android.content

import android.content.pm.PackageManager

class Intent(val action: String? = null)
class IntentFilter(val action: String)

abstract class BroadcastReceiver {
  abstract fun onReceive(context: Context, intent: Intent)
}

open class Context {
  val applicationContext: Context get() = this
  val contentResolver: Any = Any()
  val connectivity = android.net.ConnectivityManager()
  val wifi = android.net.wifi.WifiManager()
  val location = android.location.LocationManager()
  var nsd: android.net.nsd.NsdManager? = android.net.nsd.NsdManager()
  var throwOnWifiService: Throwable? = null
  var throwOnNsdService: Throwable? = null
  val grantedPermissions = mutableSetOf(
    android.Manifest.permission.NEARBY_WIFI_DEVICES,
    android.Manifest.permission.ACCESS_FINE_LOCATION,
  )
  var registeredReceiver: BroadcastReceiver? = null

  fun checkSelfPermission(permission: String): Int {
    return if (permission in grantedPermissions) PackageManager.PERMISSION_GRANTED
    else PackageManager.PERMISSION_DENIED
  }

  fun getSystemService(name: String): Any? {
    return when (name) {
      CONNECTIVITY_SERVICE -> connectivity
      WIFI_SERVICE -> {
        throwOnWifiService?.let { throw it }
        wifi
      }
      LOCATION_SERVICE -> location
      NSD_SERVICE -> {
        throwOnNsdService?.let { throw it }
        nsd
      }
      else -> null
    }
  }

  fun registerReceiver(receiver: BroadcastReceiver, filter: IntentFilter): Intent? {
    registeredReceiver = receiver
    return null
  }

  fun registerReceiver(receiver: BroadcastReceiver, filter: IntentFilter, flags: Int): Intent? {
    registeredReceiver = receiver
    return null
  }

  fun unregisterReceiver(receiver: BroadcastReceiver) {
    if (registeredReceiver === receiver) registeredReceiver = null
  }

  companion object {
    const val CONNECTIVITY_SERVICE = "connectivity"
    const val WIFI_SERVICE = "wifi"
    const val LOCATION_SERVICE = "location"
    const val NSD_SERVICE = "servicediscovery"
    const val RECEIVER_NOT_EXPORTED = 4
  }
}
