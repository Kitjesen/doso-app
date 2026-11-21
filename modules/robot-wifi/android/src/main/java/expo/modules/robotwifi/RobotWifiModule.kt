package expo.modules.robotwifi

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

/**
 * SSID discovery for a known robot hotspot. Results expose network names only;
 * radio measurements never cross into JavaScript.
 * Joining a network happens only from joinKnownSsid, after an explicit user action.
 */
class RobotWifiModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var destroyed = false
  private var scanReceiver: BroadcastReceiver? = null
  private var scanTimeout: Runnable? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null
  private var joinGeneration = 0
  private var bound = false

  override fun definition() = ModuleDefinition {
    Name("RobotWifi")

    AsyncFunction("scanSsids") { promise: Promise ->
      scan(promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("currentSsid") {
      currentSsid()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("joinKnownSsid") { ssid: String, promise: Promise ->
      join(ssid, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("releaseJoinedNetwork") {
      release()
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      destroyed = true
      release()
      clearScan()
    }
  }

  private fun contextOrNull(): Context? = appContext.reactContext

  private fun granted(context: Context, permission: String): Boolean {
    return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun canReadSsid(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= 33) granted(context, Manifest.permission.NEARBY_WIFI_DEVICES)
    else granted(context, Manifest.permission.ACCESS_FINE_LOCATION)
  }

  private fun locationEnabled(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      manager.isLocationEnabled
    } else {
      Settings.Secure.getInt(context.contentResolver, Settings.Secure.LOCATION_MODE, Settings.Secure.LOCATION_MODE_OFF) != Settings.Secure.LOCATION_MODE_OFF
    }
  }

  @Suppress("DEPRECATION")
  private fun wifiEnabled(context: Context): Boolean {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    return wifi.isWifiEnabled
  }

  private fun scanProblem(context: Context): String? {
    if (!wifiEnabled(context)) return "wifi_off"
    if (Build.VERSION.SDK_INT >= 33) {
      if (!granted(context, Manifest.permission.NEARBY_WIFI_DEVICES)) return "permission_denied"
    } else if (!granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) {
      return "permission_denied"
    } else if (!locationEnabled(context)) {
      return "location_off"
    }
    return null
  }

  private fun normalizeSsid(raw: String?): String? {
    if (raw == null) return null
    var value = raw.trim()
    if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
      value = value.substring(1, value.length - 1).trim()
    }
    if (value.isEmpty()) return null
    if (value.equals("<unknown ssid>", ignoreCase = true) || value.equals("unknown ssid", ignoreCase = true) || value == "0x") return null
    return value
  }

  private fun ssidOf(result: android.net.wifi.ScanResult): String? {
    val raw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) result.wifiSsid?.toString()
    else {
      @Suppress("DEPRECATION")
      result.SSID
    }
    return normalizeSsid(raw)
  }

  private fun currentSsid(): String? {
    val context = contextOrNull() ?: return null
    if (!canReadSsid(context)) return null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val network = connectivity.activeNetwork ?: return null
      val caps = connectivity.getNetworkCapabilities(network) ?: return null
      if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return null
      val info = caps.transportInfo as? android.net.wifi.WifiInfo ?: return null
      return normalizeSsid(info.ssid)
    }
    @Suppress("DEPRECATION")
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    return normalizeSsid(wifi.connectionInfo?.ssid)
  }

  private fun clearScan() {
    scanTimeout?.let { main.removeCallbacks(it) }
    scanTimeout = null
    val context = contextOrNull()
    val receiver = scanReceiver
    scanReceiver = null
    if (context != null && receiver != null) {
      try { context.unregisterReceiver(receiver) } catch (_: RuntimeException) {}
    }
  }

  private fun scan(promise: Promise) {
    val context = contextOrNull() ?: run {
      promise.reject("scan_failed", "scan_failed", null)
      return
    }
    val problem = scanProblem(context)
    if (problem != null) {
      promise.reject(problem, problem, null)
      return
    }
    clearScan()
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val settled = AtomicBoolean(false)
    fun deliver(throttled: Boolean) {
      if (destroyed || !settled.compareAndSet(false, true)) return
      clearScan()
      val names = LinkedHashSet<String>()
      try {
        for (result in wifi.scanResults) {
          val ssid = ssidOf(result) ?: continue
          names.add(ssid)
        }
      } catch (_: SecurityException) {
        promise.reject("permission_denied", "permission_denied", null)
        return
      }
      promise.resolve(mapOf("ssids" to names.toList(), "throttled" to throttled))
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        deliver(false)
      }
    }
    scanReceiver = receiver
    val filter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
    if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    else context.registerReceiver(receiver, filter)
    val started = try {
      @Suppress("DEPRECATION")
      wifi.startScan()
    } catch (_: SecurityException) {
      clearScan()
      promise.reject("permission_denied", "permission_denied", null)
      return
    }
    if (!started) {
      deliver(true)
      return
    }
    val timeout = Runnable { deliver(true) }
    scanTimeout = timeout
    main.postDelayed(timeout, 8_000)
  }

  private fun release() {
    if (networkCallback == null && !bound) return
    joinGeneration += 1
    val context = contextOrNull()
    val callback = networkCallback
    networkCallback = null
    if (context != null) {
      val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      if (callback != null) {
        try { connectivity.unregisterNetworkCallback(callback) } catch (_: RuntimeException) {}
      }
      if (bound) connectivity.bindProcessToNetwork(null)
    }
    bound = false
  }

  private fun join(ssid: String, promise: Promise) {
    val clean = normalizeSsid(ssid)
    if (clean == null || clean.length > 32) {
      promise.reject("join_failed", "join_failed", null)
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("unsupported", "unsupported", null)
      return
    }
    val context = contextOrNull() ?: run {
      promise.reject("join_failed", "join_failed", null)
      return
    }
    if (currentSsid() == clean) {
      promise.resolve("already")
      return
    }
    release()
    val generation = joinGeneration
    val specifier = WifiNetworkSpecifier.Builder().setSsid(clean).build()
    val request = NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
      .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
      .setNetworkSpecifier(specifier)
      .build()
    val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val settled = AtomicBoolean(false)
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        if (!settled.compareAndSet(false, true)) return
        if (destroyed || generation != joinGeneration) {
          promise.resolve("cancelled")
          return
        }
        connectivity.bindProcessToNetwork(network)
        bound = true
        promise.resolve("joined")
      }

      override fun onUnavailable() {
        if (!settled.compareAndSet(false, true)) return
        main.post { if (generation == joinGeneration) release() }
        promise.resolve("cancelled")
      }

      override fun onLost(network: Network) {
        main.post { if (generation == joinGeneration) release() }
      }
    }
    networkCallback = callback
    try {
      connectivity.requestNetwork(request, callback, 30_000)
    } catch (_: SecurityException) {
      release()
      promise.reject("permission_denied", "permission_denied", null)
    } catch (_: RuntimeException) {
      release()
      promise.reject("join_failed", "join_failed", null)
    }
  }
}
