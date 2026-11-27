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
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
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
import java.io.IOException
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.Socket
import java.util.ArrayDeque
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Wi-Fi hotspot SSID and same-LAN robot discovery.
 * Hotspot scan results expose network names only; radio measurements never cross into JavaScript.
 * Joining a network happens only from joinKnownSsid, after an explicit user action.
 * LAN robot discovery uses bounded NsdManager DNS-SD with scoped MulticastLock lifecycle.
 */
class RobotWifiModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private val lanLock = Any()
  private var destroyed = false
  private var scanReceiver: BroadcastReceiver? = null
  private var scanTimeout: Runnable? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null
  private var joinGeneration = 0
  private var bound = false
  private var activeLanSession: LanDiscoverySession? = null

  private data class PendingResolve(
    val serviceInfo: NsdServiceInfo,
    val retries: Int = 0,
  )

  private class LanDiscoverySession(
    val nsd: NsdManager,
    val multicastLock: WifiManager.MulticastLock,
    val promise: Promise,
  ) {
    var discoveryListener: NsdManager.DiscoveryListener? = null
    var discoveryRegistered = false
    var timeoutRunnable: Runnable? = null
    var resolveRetryRunnable: Runnable? = null
    var probeExecutor: ExecutorService? = null
    var resolveInFlight = false
    var finished = false
    val queuedServiceNames = LinkedHashSet<String>()
    val pendingResolves = ArrayDeque<PendingResolve>()
    val serviceInfoCallbacks = LinkedHashSet<Any>()
    val robotsByKey = LinkedHashMap<String, Map<String, Any?>>()

    fun snapshotRobots(): List<Map<String, Any?>> = robotsByKey.values.toList()
  }

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

    AsyncFunction("discoverLanRobots") { timeoutMs: Int?, promise: Promise ->
      discoverLanRobots(timeoutMs, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopLanDiscovery") {
      stopLanDiscovery(deliverResult = true)
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      destroyed = true
      release()
      clearScan()
      stopLanDiscovery(deliverResult = false)
    }
  }

  private fun contextOrNull(): Context? = appContext.reactContext

  private fun granted(context: Context, permission: String): Boolean {
    return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun canReadSsid(context: Context): Boolean {
    return granted(context, Manifest.permission.ACCESS_FINE_LOCATION) && locationEnabled(context)
  }

  private fun locationEnabled(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
      manager?.isLocationEnabled == true
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
    if (!granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) return "permission_denied"
    if (!locationEnabled(context)) return "location_off"
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

  private fun wifiNetworksOf(connectivity: ConnectivityManager): List<Network> {
    val found = ArrayList<Network>()
    val active = connectivity.activeNetwork
    if (active != null && connectivity.getNetworkCapabilities(active)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
      found.add(active)
    }
    @Suppress("DEPRECATION")
    for (candidate in connectivity.allNetworks) {
      if (candidate == active) continue
      if (connectivity.getNetworkCapabilities(candidate)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
        found.add(candidate)
      }
    }
    return found
  }

  private fun currentSsid(): String? {
    val context = contextOrNull() ?: return null
    if (!canReadSsid(context)) return null
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (connectivity != null) {
          val wifiNetworks = wifiNetworksOf(connectivity)
          if (wifiNetworks.isEmpty()) return null
          for (network in wifiNetworks) {
            val caps = connectivity.getNetworkCapabilities(network) ?: continue
            val info = caps.transportInfo as? android.net.wifi.WifiInfo ?: continue
            val ssid = normalizeSsid(info.ssid)
            if (ssid != null) return ssid
          }
        }
      }
      @Suppress("DEPRECATION")
      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      normalizeSsid(wifi?.connectionInfo?.ssid)
    } catch (_: SecurityException) {
      null
    } catch (_: RuntimeException) {
      null
    }
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

  private fun discoverLanRobots(timeoutMs: Int?, promise: Promise) {
    val context = contextOrNull()
    if (destroyed || context == null) {
      promise.reject("discovery_failed", "discovery_failed", null)
      return
    }
    val wifi = try {
      context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    } catch (_: SecurityException) {
      promise.reject("permission_denied", "permission_denied", null)
      return
    } catch (_: RuntimeException) {
      null
    }
    if (wifi == null) {
      promise.reject("discovery_failed", "discovery_failed", null)
      return
    }
    val wifiOn = try {
      @Suppress("DEPRECATION")
      wifi.isWifiEnabled
    } catch (_: SecurityException) {
      promise.reject("permission_denied", "permission_denied", null)
      return
    } catch (_: RuntimeException) {
      promise.reject("discovery_failed", "discovery_failed", null)
      return
    }
    if (!wifiOn) {
      promise.reject("wifi_off", "wifi_off", null)
      return
    }
    val nsd = try {
      context.applicationContext.getSystemService(Context.NSD_SERVICE) as? NsdManager
    } catch (_: SecurityException) {
      promise.reject("permission_denied", "permission_denied", null)
      return
    } catch (_: RuntimeException) {
      null
    }
    if (nsd == null) {
      promise.reject("discovery_failed", "discovery_failed", null)
      return
    }

    stopLanDiscovery(deliverResult = true)

    val windowMs = (timeoutMs ?: DEFAULT_LAN_TIMEOUT_MS)
      .coerceIn(MIN_LAN_TIMEOUT_MS, MAX_LAN_TIMEOUT_MS)
      .toLong()

    var createdLock: WifiManager.MulticastLock? = null
    val multicastLock = try {
      wifi.createMulticastLock(MULTICAST_LOCK_TAG).also {
        createdLock = it
        it.setReferenceCounted(false)
        it.acquire()
      }
    } catch (_: SecurityException) {
      releaseMulticastLock(createdLock)
      promise.reject("permission_denied", "permission_denied", null)
      return
    } catch (_: RuntimeException) {
      releaseMulticastLock(createdLock)
      promise.reject("discovery_failed", "discovery_failed", null)
      return
    }

    val session = LanDiscoverySession(nsd, multicastLock, promise)
    val listener = object : NsdManager.DiscoveryListener {
      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        synchronized(lanLock) { session.discoveryRegistered = false }
        finishLanSession(session, errorCode = "discovery_failed", timedOut = false, deliver = true)
      }

      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
        synchronized(lanLock) { session.discoveryRegistered = false }
      }

      override fun onDiscoveryStarted(regType: String) {
        // Active discovery tracked via discoveryRegistered until stop or failure.
      }

      override fun onDiscoveryStopped(serviceType: String) {
        synchronized(lanLock) { session.discoveryRegistered = false }
      }

      override fun onServiceFound(serviceInfo: NsdServiceInfo) {
        handleServiceFound(session, serviceInfo)
      }

      override fun onServiceLost(serviceInfo: NsdServiceInfo) {
        // Keep discovered snapshot stable for the bounded window.
      }
    }

    val timeout = Runnable {
      finishLanSession(session, errorCode = null, timedOut = true, deliver = true)
    }

    val activeStarted = synchronized(lanLock) {
      if (destroyed) {
        session.finished = true
        false
      } else {
        session.discoveryListener = listener
        session.timeoutRunnable = timeout
        activeLanSession = session
        true
      }
    }
    if (!activeStarted) {
      releaseMulticastLock(multicastLock)
      return
    }

    main.postDelayed(timeout, windowMs)

    try {
      synchronized(lanLock) { session.discoveryRegistered = true }
      nsd.discoverServices(LAN_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (_: SecurityException) {
      synchronized(lanLock) { session.discoveryRegistered = false }
      finishLanSession(session, errorCode = "permission_denied", timedOut = false, deliver = true)
      return
    } catch (_: RuntimeException) {
      synchronized(lanLock) { session.discoveryRegistered = false }
      finishLanSession(session, errorCode = "discovery_failed", timedOut = false, deliver = true)
      return
    }

    startLanSubnetProbe(context, session)
  }

  private fun stopLanDiscovery(deliverResult: Boolean) {
    val current = synchronized(lanLock) { activeLanSession } ?: return
    finishLanSession(current, errorCode = null, timedOut = false, deliver = deliverResult)
  }

  private fun finishLanSession(
    session: LanDiscoverySession,
    errorCode: String?,
    timedOut: Boolean,
    deliver: Boolean,
  ) {
    val listenerToStop: NsdManager.DiscoveryListener?
    val timeoutToCancel: Runnable?
    val retryToCancel: Runnable?
    val probeToStop: ExecutorService?
    val callbacksToUnregister: List<Any>
    val robots: List<Map<String, Any?>>

    synchronized(lanLock) {
      if (session.finished) return
      session.finished = true
      if (activeLanSession === session) {
        activeLanSession = null
      }
      listenerToStop = if (session.discoveryRegistered) {
        session.discoveryRegistered = false
        session.discoveryListener
      } else {
        null
      }
      session.discoveryListener = null
      timeoutToCancel = session.timeoutRunnable
      session.timeoutRunnable = null
      retryToCancel = session.resolveRetryRunnable
      session.resolveRetryRunnable = null
      probeToStop = session.probeExecutor
      session.probeExecutor = null
      session.pendingResolves.clear()
      session.resolveInFlight = false
      callbacksToUnregister = session.serviceInfoCallbacks.toList()
      session.serviceInfoCallbacks.clear()
      robots = session.snapshotRobots()
    }

    if (timeoutToCancel != null) main.removeCallbacks(timeoutToCancel)
    if (retryToCancel != null) main.removeCallbacks(retryToCancel)
    if (probeToStop != null) {
      try { probeToStop.shutdownNow() } catch (_: RuntimeException) {}
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      unregisterServiceInfoCallbacks(session.nsd, callbacksToUnregister)
    }

    if (listenerToStop != null) {
      try {
        session.nsd.stopServiceDiscovery(listenerToStop)
      } catch (_: IllegalArgumentException) {
      } catch (_: RuntimeException) {
      }
    }

    releaseMulticastLock(session.multicastLock)

    if (!deliver || destroyed) return
    if (errorCode != null) {
      session.promise.reject(errorCode, errorCode, null)
    } else {
      session.promise.resolve(mapOf("robots" to robots, "timedOut" to timedOut))
    }
  }

  private fun releaseMulticastLock(lock: WifiManager.MulticastLock?) {
    if (lock == null) return
    try {
      if (lock.isHeld) lock.release()
    } catch (_: RuntimeException) {
    }
  }

  private fun handleServiceFound(session: LanDiscoverySession, serviceInfo: NsdServiceInfo) {
    if (!matchesRobotServiceType(serviceInfo.serviceType)) return
    val serviceKey = serviceInfo.serviceName?.trim()
    if (serviceKey.isNullOrEmpty()) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val accepted = synchronized(lanLock) {
        if (session.finished || session.queuedServiceNames.size >= MAX_DISCOVERED_SERVICES) return
        session.queuedServiceNames.add(serviceKey)
      }
      if (accepted) {
        registerApi34ServiceCallback(session, serviceInfo)
      }
      return
    }

    val shouldPump = synchronized(lanLock) {
      if (session.finished || session.queuedServiceNames.size >= MAX_DISCOVERED_SERVICES) return
      if (!session.queuedServiceNames.add(serviceKey)) return
      session.pendingResolves.addLast(PendingResolve(serviceInfo))
      !session.resolveInFlight
    }
    if (shouldPump) {
      pumpNextResolve(session)
    }
  }

  private fun registerApi34ServiceCallback(session: LanDiscoverySession, serviceInfo: NsdServiceInfo) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
    val callback = object : NsdManager.ServiceInfoCallback {
      override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) {
        synchronized(lanLock) { session.serviceInfoCallbacks.remove(this) }
      }

      override fun onServiceUpdated(updated: NsdServiceInfo) {
        recordLanRobot(session, updated)
      }

      override fun onServiceLost() {
        synchronized(lanLock) { session.serviceInfoCallbacks.remove(this) }
      }

      override fun onServiceInfoCallbackUnregistered() {
        synchronized(lanLock) { session.serviceInfoCallbacks.remove(this) }
      }
    }

    val shouldRegister = synchronized(lanLock) {
      if (session.finished) false
      else {
        session.serviceInfoCallbacks.add(callback)
        true
      }
    }
    if (!shouldRegister) return

    val executor = Executor { command -> main.post(command) }
    try {
      session.nsd.registerServiceInfoCallback(serviceInfo, executor, callback)
    } catch (_: SecurityException) {
      synchronized(lanLock) { session.serviceInfoCallbacks.remove(callback) }
    } catch (_: RuntimeException) {
      synchronized(lanLock) { session.serviceInfoCallbacks.remove(callback) }
    }
  }

  private fun unregisterServiceInfoCallbacks(nsd: NsdManager, callbacks: List<Any>) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
    for (item in callbacks) {
      val callback = item as? NsdManager.ServiceInfoCallback ?: continue
      try {
        nsd.unregisterServiceInfoCallback(callback)
      } catch (_: IllegalArgumentException) {
      } catch (_: RuntimeException) {
      }
    }
  }

  private fun pumpNextResolve(session: LanDiscoverySession) {
    while (true) {
      val next = synchronized(lanLock) {
        if (session.finished || session.resolveInFlight) return
        val item = session.pendingResolves.pollFirst() ?: return
        session.resolveInFlight = true
        item
      }

      val callerThread = Thread.currentThread()
      val inDirectCall = AtomicBoolean(true)
      val callbackSeen = AtomicBoolean(false)
      val pumpAgain = AtomicBoolean(false)

      try {
        @Suppress("DEPRECATION")
        session.nsd.resolveService(next.serviceInfo, object : NsdManager.ResolveListener {
          override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
            if (!callbackSeen.compareAndSet(false, true)) return
            val scheduledRetry = handleLegacyResolveFailure(session, next, errorCode)
            if (scheduledRetry) return
            if (Thread.currentThread() === callerThread && inDirectCall.get()) {
              pumpAgain.set(true)
            } else {
              pumpNextResolve(session)
            }
          }

          override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
            if (!callbackSeen.compareAndSet(false, true)) return
            recordLanRobot(session, serviceInfo)
            synchronized(lanLock) { session.resolveInFlight = false }
            if (Thread.currentThread() === callerThread && inDirectCall.get()) {
              pumpAgain.set(true)
            } else {
              pumpNextResolve(session)
            }
          }
        })
      } catch (_: RuntimeException) {
        if (callbackSeen.compareAndSet(false, true)) {
          synchronized(lanLock) { session.resolveInFlight = false }
          pumpAgain.set(true)
        }
      } finally {
        inDirectCall.set(false)
      }

      if (!pumpAgain.get()) return
    }
  }

  private fun handleLegacyResolveFailure(
    session: LanDiscoverySession,
    item: PendingResolve,
    errorCode: Int,
  ): Boolean {
    val retryRunnable: Runnable? = synchronized(lanLock) {
      if (session.finished) {
        session.resolveInFlight = false
        return false
      }
      if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE && item.retries < MAX_ALREADY_ACTIVE_RETRIES) {
        session.pendingResolves.addFirst(PendingResolve(item.serviceInfo, item.retries + 1))
        val task = Runnable {
          val shouldPump = synchronized(lanLock) {
            session.resolveRetryRunnable = null
            session.resolveInFlight = false
            !session.finished
          }
          if (shouldPump) pumpNextResolve(session)
        }
        session.resolveRetryRunnable = task
        task
      } else {
        session.resolveInFlight = false
        null
      }
    }
    if (retryRunnable != null) {
      main.postDelayed(retryRunnable, RESOLVE_RETRY_DELAY_MS)
      return true
    }
    return false
  }

  private fun activeWifiIpv4(context: Context): String? {
    val connectivity = try {
      context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    } catch (_: RuntimeException) {
      null
    } ?: return null
    val networks = try {
      wifiNetworksOf(connectivity)
    } catch (_: RuntimeException) {
      emptyList()
    }
    for (network in networks) {
      val props = try {
        connectivity.getLinkProperties(network)
      } catch (_: RuntimeException) {
        null
      } ?: continue
      for (linkAddress in props.linkAddresses) {
        val address = linkAddress.address
        if (address is Inet4Address) {
          val host = address.hostAddress
          if (isRfc1918Ipv4(host)) return host
        }
      }
    }
    return null
  }

  private fun startLanSubnetProbe(context: Context, session: LanDiscoverySession) {
    val selfIp = activeWifiIpv4(context) ?: return
    val parts = selfIp.split('.')
    if (parts.size != 4) return
    val selfLast = parts[3].toIntOrNull() ?: return
    val prefix = "${parts[0]}.${parts[1]}.${parts[2]}"
    val priority = intArrayOf(64, 13, 1, 50, 100)
    val targets = ArrayList<String>(254)
    val seen = HashSet<Int>(256)
    seen.add(selfLast)
    for (octet in priority) {
      if (octet in 1..254 && seen.add(octet)) {
        targets.add("$prefix.$octet")
      }
    }
    for (octet in 1..254) {
      if (seen.add(octet)) {
        targets.add("$prefix.$octet")
      }
    }

    val pool = Executors.newFixedThreadPool(LAN_PROBE_CONCURRENCY) { runnable ->
      Thread(runnable, "doso-lan-probe").apply { isDaemon = true }
    }
    val attached = synchronized(lanLock) {
      if (session.finished || destroyed) {
        false
      } else {
        session.probeExecutor = pool
        true
      }
    }
    if (!attached) {
      pool.shutdownNow()
      return
    }

    for (candidateHost in targets) {
      try {
        pool.execute {
          if (destroyed || synchronized(lanLock) { session.finished }) return@execute
          val reachable = try {
            Socket().use { socket ->
              socket.connect(InetSocketAddress(candidateHost, LAN_PROBE_PORT), LAN_PROBE_TIMEOUT_MS)
              true
            }
          } catch (_: IOException) {
            false
          } catch (_: RuntimeException) {
            false
          }
          if (reachable) {
            recordProbedLanRobot(session, candidateHost, LAN_PROBE_PORT)
          }
        }
      } catch (_: RuntimeException) {
        break
      }
    }
    try {
      pool.shutdown()
    } catch (_: RuntimeException) {
    }
  }

  private fun recordProbedLanRobot(session: LanDiscoverySession, host: String, port: Int) {
    if (!isRfc1918Ipv4(host) || port !in 1..65535) return
    val key = "$host:$port"
    val record = mapOf<String, Any?>(
      "host" to host,
      "port" to port,
      "serviceName" to "",
      "robotId" to null,
      "displayName" to null,
      "apSsid" to null,
      "videoPort" to null,
      "transport" to null,
      "version" to null,
    )
    synchronized(lanLock) {
      if (session.finished || session.robotsByKey.size >= MAX_DISCOVERED_SERVICES) return
      if (!session.robotsByKey.containsKey(key)) {
        session.robotsByKey[key] = record
      }
    }
  }

  private fun recordLanRobot(session: LanDiscoverySession, info: NsdServiceInfo) {
    val built = buildLanRobot(info) ?: return
    val (key, record) = built
    synchronized(lanLock) {
      if (session.finished) return
      val existing = session.robotsByKey[key]
      if (existing == null || metadataScore(record) > metadataScore(existing)) {
        session.robotsByKey[key] = record
      }
    }
  }

  private fun buildLanRobot(info: NsdServiceInfo): Pair<String, Map<String, Any?>>? {
    val host = extractRfc1918Host(info) ?: return null
    val port = info.port
    if (port !in 1..65535) return null
    val serviceName = sanitizeText(info.serviceName) ?: ""
    val attrs = try {
      info.attributes
    } catch (_: RuntimeException) {
      null
    }
    val version = txtAttr(attrs, "v")
    val robotId = txtAttr(attrs, "id")
    val displayName = txtAttr(attrs, "name")
    val apSsid = txtAttr(attrs, "ap")
    val videoPort = txtAttr(attrs, "vport")?.toIntOrNull()?.takeIf { it in 1..65535 }
    val transport = txtAttr(attrs, "transport")
    val key = "$host:$port"
    val record = mapOf(
      "host" to host,
      "port" to port,
      "serviceName" to serviceName,
      "robotId" to robotId,
      "displayName" to displayName,
      "apSsid" to apSsid,
      "videoPort" to videoPort,
      "transport" to transport,
      "version" to version,
    )
    return key to record
  }

  private fun extractRfc1918Host(info: NsdServiceInfo): String? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val addresses = try {
        info.hostAddresses
      } catch (_: RuntimeException) {
        emptyList()
      }
      for (address in addresses) {
        if (address is Inet4Address) {
          val host = address.hostAddress
          if (isRfc1918Ipv4(host)) return host
        }
      }
    }
    @Suppress("DEPRECATION")
    val legacyHost = info.host
    if (legacyHost is Inet4Address) {
      val host = legacyHost.hostAddress
      if (isRfc1918Ipv4(host)) return host
    }
    return null
  }

  private fun metadataScore(record: Map<String, Any?>): Int {
    var score = 0
    if (record["robotId"] != null) score += 2
    if (record["displayName"] != null) score += 2
    if (record["apSsid"] != null) score += 1
    if (record["videoPort"] != null) score += 1
    if (record["transport"] != null) score += 1
    if (record["version"] != null) score += 1
    if ((record["serviceName"] as? String)?.isNotEmpty() == true) score += 1
    return score
  }

  private fun matchesRobotServiceType(serviceType: String?): Boolean {
    val normalized = serviceType?.trim()?.trim('.') ?: return false
    return normalized.equals(LAN_SERVICE_TYPE_NORMALIZED, ignoreCase = true) ||
      normalized.equals("$LAN_SERVICE_TYPE_NORMALIZED.local", ignoreCase = true)
  }

  private fun txtAttr(attrs: Map<String, ByteArray?>?, key: String): String? {
    if (attrs.isNullOrEmpty()) return null
    val direct = attrs[key]
    if (direct != null) return sanitizeTxtBytes(direct)
    for ((entryKey, value) in attrs) {
      if (entryKey.equals(key, ignoreCase = true)) {
        return sanitizeTxtBytes(value)
      }
    }
    return null
  }

  private fun sanitizeTxtBytes(raw: ByteArray?): String? {
    if (raw == null || raw.isEmpty()) return null
    val bounded = minOf(raw.size, MAX_TXT_RAW_BYTES)
    val decoded = String(raw, 0, bounded, Charsets.UTF_8)
    return sanitizeText(decoded)
  }

  private fun sanitizeText(raw: String?): String? {
    if (raw == null) return null
    val sb = StringBuilder(minOf(raw.length, MAX_TXT_CHARS))
    for (ch in raw) {
      if (ch == '\uFFFD' || ch.code < 0x20 || ch.code == 0x7F) continue
      if (sb.isEmpty() && ch.isWhitespace()) continue
      sb.append(ch)
      if (sb.length >= MAX_TXT_CHARS) break
    }
    val trimmed = sb.toString().trimEnd()
    return trimmed.ifEmpty { null }
  }

  private fun isRfc1918Ipv4(host: String?): Boolean {
    if (host == null) return false
    val parts = host.split('.')
    if (parts.size != 4) return false
    val octets = IntArray(4)
    for (i in 0..3) {
      val part = parts[i]
      if (part.isEmpty() || part.length > 3) return false
      if (part.length > 1 && part[0] == '0') return false
      var value = 0
      for (ch in part) {
        if (ch !in '0'..'9') return false
        value = value * 10 + (ch - '0')
      }
      if (value !in 0..255) return false
      octets[i] = value
    }
    val a = octets[0]
    val b = octets[1]
    return a == 10 || (a == 172 && b in 16..31) || (a == 192 && b == 168)
  }

  companion object {
    private const val LAN_SERVICE_TYPE = "_doso-robot._tcp."
    private const val LAN_SERVICE_TYPE_NORMALIZED = "_doso-robot._tcp"
    private const val MULTICAST_LOCK_TAG = "DOSO:robot-lan-discovery"
    private const val DEFAULT_LAN_TIMEOUT_MS = 3_000
    private const val MIN_LAN_TIMEOUT_MS = 1_500
    private const val MAX_LAN_TIMEOUT_MS = 6_000
    private const val MAX_TXT_CHARS = 64
    private const val MAX_TXT_RAW_BYTES = 256
    private const val MAX_DISCOVERED_SERVICES = 32
    private const val MAX_ALREADY_ACTIVE_RETRIES = 2
    private const val RESOLVE_RETRY_DELAY_MS = 150L
    private const val LAN_PROBE_PORT = 13145
    private const val LAN_PROBE_TIMEOUT_MS = 280
    private const val LAN_PROBE_CONCURRENCY = 32
  }
}
