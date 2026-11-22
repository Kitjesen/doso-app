package expo.modules.robotwifi

import android.Manifest
import android.net.Network
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.ScanResult
import android.net.wifi.WifiInfo
import android.net.wifi.WifiSsid
import android.os.Build
import android.os.Looper
import expo.modules.kotlin.Promise
import java.net.InetAddress

private class RecordingPromise : Promise {
  var resolved: Boolean = false
  var value: Any? = null
  var rejected: Boolean = false
  var errorCode: String? = null
  var settleCount: Int = 0

  override fun resolve(value: Any?) {
    settleCount += 1
    resolved = true
    this.value = value
  }

  override fun reject(code: String, message: String, cause: Throwable?) {
    settleCount += 1
    rejected = true
    errorCode = code
  }
}

private fun assertEq(actual: Any?, expected: Any?, label: String) {
  if (actual != expected) {
    error("Assertion failed [$label]: expected=<$expected>, actual=<$actual>")
  }
}

private fun assertTrue(condition: Boolean, label: String) {
  if (!condition) error("Assertion failed [$label]")
}

@Suppress("UNCHECKED_CAST")
private fun invokeCurrentSsid(module: RobotWifiModule): String? {
  val def = module.definition()
  val fn = def.functions["currentSsid"] as () -> String?
  return fn()
}

@Suppress("UNCHECKED_CAST")
private fun invokeScanSsids(module: RobotWifiModule): RecordingPromise {
  val def = module.definition()
  val fn = def.functions["scanSsids"] as (Promise) -> Unit
  return RecordingPromise().also { fn(it) }
}

@Suppress("UNCHECKED_CAST")
private fun invokeJoin(module: RobotWifiModule, ssid: String): RecordingPromise {
  val def = module.definition()
  val fn = def.functions["joinKnownSsid"] as (String, Promise) -> Unit
  return RecordingPromise().also { fn(ssid, it) }
}

@Suppress("UNCHECKED_CAST")
private fun invokeRelease(module: RobotWifiModule) {
  val def = module.definition()
  val fn = def.functions["releaseJoinedNetwork"] as () -> Unit
  fn()
}

@Suppress("UNCHECKED_CAST")
private fun invokeDiscoverLan(module: RobotWifiModule, timeoutMs: Int?): RecordingPromise {
  val def = module.definition()
  val fn = def.functions["discoverLanRobots"] as (Int?, Promise) -> Unit
  return RecordingPromise().also { fn(timeoutMs, it) }
}

@Suppress("UNCHECKED_CAST")
private fun invokeStopLan(module: RobotWifiModule) {
  val def = module.definition()
  val fn = def.functions["stopLanDiscovery"] as () -> Unit
  fn()
}

private fun resolvedService(
  name: String,
  host: String?,
  port: Int,
  attrs: Map<String, String> = emptyMap(),
  rawAttrs: Map<String, ByteArray?> = emptyMap(),
  hostAddresses: List<String>? = null,
): NsdServiceInfo {
  return NsdServiceInfo().apply {
    serviceName = name
    serviceType = "_doso-robot._tcp."
    this.port = port
    if (host != null) this.host = InetAddress.getByName(host)
    if (hostAddresses != null) {
      this.hostAddresses = hostAddresses.map { InetAddress.getByName(it) }
    } else if (host != null) {
      this.hostAddresses = listOf(InetAddress.getByName(host))
    }
    for ((k, v) in attrs) setAttribute(k, v)
    for ((k, v) in rawAttrs) setRawAttribute(k, v)
  }
}

private fun testCurrentSsidCellularWithWifiAllNetworks() {
  Looper.main.reset()
  Build.VERSION.SDK_INT = 33
  val module = RobotWifiModule()
  val ctx = module.appContext.reactContext!!
  val cellular = Network("cell-5g")
  val wifiNet = Network("wifi-hotspot")
  ctx.connectivity.activeNetwork = cellular
  ctx.connectivity.allNetworks = arrayOf(cellular, wifiNet)
  ctx.connectivity.capabilitiesByNetwork[cellular] = NetworkCapabilities(setOf(NetworkCapabilities.TRANSPORT_CELLULAR))
  ctx.connectivity.capabilitiesByNetwork[wifiNet] = NetworkCapabilities(
    transports = setOf(NetworkCapabilities.TRANSPORT_WIFI),
    transportInfo = WifiInfo("\"DOSOrobotics\""),
  )
  assertEq(invokeCurrentSsid(module), "DOSOrobotics", "cellular active + wifi in allNetworks")

  // Fallback to wifi.connectionInfo?.ssid when transportInfo is null on Android Q+
  ctx.connectivity.capabilitiesByNetwork[wifiNet] = NetworkCapabilities(
    transports = setOf(NetworkCapabilities.TRANSPORT_WIFI),
    transportInfo = null,
  )
  ctx.wifi.connectionInfo = WifiInfo("\"DOSO-AB12CD\"")
  assertEq(invokeCurrentSsid(module), "DOSO-AB12CD", "null transportInfo falls back to wifi.connectionInfo")

  // Active network null (internetless hotspot without SIM) still resolves via allNetworks
  ctx.connectivity.activeNetwork = null
  ctx.connectivity.allNetworks = arrayOf(wifiNet)
  assertEq(invokeCurrentSsid(module), "DOSO-AB12CD", "null activeNetwork resolves via allNetworks")

  // Cellular only (no Wi-Fi transport anywhere) must return null even if connectionInfo has stale string
  ctx.connectivity.activeNetwork = cellular
  ctx.connectivity.allNetworks = arrayOf(cellular)
  assertEq(invokeCurrentSsid(module), null, "cellular only returns null")

  // Android < Q uses legacy connectionInfo
  Build.VERSION.SDK_INT = 28
  ctx.wifi.connectionInfo = WifiInfo("\"DOSO-LEGACY\"")
  assertEq(invokeCurrentSsid(module), "DOSO-LEGACY", "pre-Q connectionInfo")

  // API 33+ requires ACCESS_FINE_LOCATION + locationEnabled (NEARBY_WIFI_DEVICES alone is insufficient)
  Build.VERSION.SDK_INT = 33
  ctx.connectivity.allNetworks = arrayOf(wifiNet)
  ctx.grantedPermissions.clear()
  ctx.grantedPermissions.add(Manifest.permission.NEARBY_WIFI_DEVICES)
  ctx.location.isLocationEnabled = true
  assertEq(invokeCurrentSsid(module), null, "API 33 with NEARBY_WIFI_DEVICES only returns null")

  // API 33+ with ACCESS_FINE_LOCATION but location off returns null
  ctx.grantedPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
  ctx.location.isLocationEnabled = false
  assertEq(invokeCurrentSsid(module), null, "API 33 with location off returns null")

  // API 33+ with ACCESS_FINE_LOCATION + location on succeeds even without NEARBY_WIFI_DEVICES
  ctx.grantedPermissions.clear()
  ctx.grantedPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
  ctx.location.isLocationEnabled = true
  assertEq(invokeCurrentSsid(module), "DOSO-LEGACY", "API 33 with fine location + location on returns SSID")
  println("PASS: currentSsid-multi-network-and-fallback")
}

@Suppress("UNCHECKED_CAST")
private fun testBackwardsCompatibilityScanAndJoin() {
  Looper.main.reset()
  Build.VERSION.SDK_INT = 33
  val module = RobotWifiModule()
  val ctx = module.appContext.reactContext!!
  ctx.wifi.scanResults = listOf(
    ScanResult(wifiSsid = WifiSsid("\"DOSOrobotics\"")),
    ScanResult(wifiSsid = WifiSsid("\"DOSO-001\"")),
    ScanResult(wifiSsid = WifiSsid("<unknown ssid>")),
  )
  ctx.wifi.startScanResult = false // immediate throttled delivery
  val scanPromise = invokeScanSsids(module)
  assertTrue(scanPromise.resolved, "scanSsids resolved")
  val scanMap = scanPromise.value as Map<String, Any?>
  assertEq(scanMap["ssids"], listOf("DOSOrobotics", "DOSO-001"), "scanSsids names")
  assertEq(scanMap["throttled"], true, "scanSsids throttled")

  // joinKnownSsid returns "already" when currentSsid matches even while 5G is activeNetwork
  val cellular = Network("cell-5g")
  val wifiNet = Network("wifi-ap")
  ctx.connectivity.activeNetwork = cellular
  ctx.connectivity.allNetworks = arrayOf(cellular, wifiNet)
  ctx.connectivity.capabilitiesByNetwork[cellular] = NetworkCapabilities(setOf(NetworkCapabilities.TRANSPORT_CELLULAR))
  ctx.connectivity.capabilitiesByNetwork[wifiNet] = NetworkCapabilities(
    setOf(NetworkCapabilities.TRANSPORT_WIFI),
    WifiInfo("\"DOSOrobotics\""),
  )
  val alreadyPromise = invokeJoin(module, "DOSOrobotics")
  assertEq(alreadyPromise.value, "already", "join already over 5G+wifi")

  // join a new SSID and release it
  val joinPromise = invokeJoin(module, "DOSO-NEW01")
  val joinedNet = Network("joined-ap")
  ctx.connectivity.lastCallback!!.onAvailable(joinedNet)
  assertEq(joinPromise.value, "joined", "join succeeded")
  assertEq(ctx.connectivity.boundNetwork, joinedNet, "process bound to joined network")
  invokeRelease(module)
  assertEq(ctx.connectivity.boundNetwork, null, "process unbound on release")
  assertEq(ctx.connectivity.unregisteredCallbacks, 1, "callback unregistered on release")
  // API 33+ scanSsids gates on ACCESS_FINE_LOCATION + locationEnabled while discoverLanRobots stays location-free
  ctx.grantedPermissions.clear()
  ctx.grantedPermissions.add(Manifest.permission.NEARBY_WIFI_DEVICES)
  ctx.location.isLocationEnabled = true
  val deniedScan = invokeScanSsids(module)
  assertTrue(deniedScan.rejected && deniedScan.errorCode == "permission_denied", "API 33 scanSsids requires ACCESS_FINE_LOCATION")

  ctx.grantedPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
  ctx.location.isLocationEnabled = false
  val locOffScan = invokeScanSsids(module)
  assertTrue(locOffScan.rejected && locOffScan.errorCode == "location_off", "API 33 scanSsids requires locationEnabled")

  // LAN discovery MUST still succeed on API 33+ without ACCESS_FINE_LOCATION and with location off
  ctx.grantedPermissions.clear()
  ctx.location.isLocationEnabled = false
  val lanPromise = invokeDiscoverLan(module, 2000)
  assertEq(ctx.wifi.createdMulticastLocks.single().isHeld, true, "discoverLanRobots runs location-free on API 33")
  invokeStopLan(module)
  assertTrue(lanPromise.resolved, "discoverLanRobots resolves location-free on API 33")

  ctx.grantedPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
  ctx.location.isLocationEnabled = true
  println("PASS: existing-wifi-functions-backwards-compatible")
}

@Suppress("UNCHECKED_CAST")
private fun testLanDiscoverySerializedResolveValidationTxtAndDedup() {
  Looper.main.reset()
  Build.VERSION.SDK_INT = 33
  val module = RobotWifiModule()
  val ctx = module.appContext.reactContext!!
  val nsd = ctx.nsd!!

  // Test timeout clamping: null -> 3000ms
  val promise = invokeDiscoverLan(module, null)
  assertEq(nsd.lastServiceType, "_doso-robot._tcp.", "service type matches contract")
  assertEq(nsd.lastProtocol, NsdManager.PROTOCOL_DNS_SD, "protocol is DNS_SD")
  assertEq(Looper.main.recordedDelays.last(), 3000L, "default timeout 3000ms")

  val lock = ctx.wifi.createdMulticastLocks.single()
  assertEq(lock.refCountedFlag, false, "MulticastLock setReferenceCounted(false)")
  assertEq(lock.isHeld, true, "MulticastLock held during discovery")

  val listener = nsd.activeDiscoveryListener!!
  // Burst 6 services simultaneously while first resolve is still in flight
  val foundNames = listOf(
    "DOSO-THUNDER-001",
    "DOSO-THUNDER-001-DUP",
    "DOSO-PUBLIC-BAD",
    "DOSO-LOOPBACK-BAD",
    "DOSO-172-EDGE-OK",
    "DOSO-10-TXT-BOUND",
  )
  for (name in foundNames) {
    listener.onServiceFound(NsdServiceInfo().apply {
      serviceName = name
      serviceType = "_doso-robot._tcp" // without trailing dot!
    })
  }
  // Unrelated service type must be ignored
  listener.onServiceFound(NsdServiceInfo().apply {
    serviceName = "printer"
    serviceType = "_ipp._tcp."
  })

  // Only 1 resolve must be active right now!
  assertEq(nsd.currentConcurrentResolves, 1, "exactly one resolve in flight")
  assertEq(nsd.activeResolveCall?.info?.serviceName, "DOSO-THUNDER-001", "first service resolving")

  // 1. First resolve: minimal metadata for 192.168.66.64:13145
  nsd.completeActiveResolve(resolvedService(
    name = "DOSO-THUNDER-001",
    host = "192.168.66.64",
    port = 13145,
    attrs = mapOf("v" to "1"),
  ))
  assertEq(nsd.activeResolveCall?.info?.serviceName, "DOSO-THUNDER-001-DUP", "second service queued next")

  // 2. Duplicate host:port with full TXT records should win over sparser entry (and dedupe!)
  nsd.completeActiveResolve(resolvedService(
    name = "DOSO-THUNDER-001",
    host = "192.168.66.64",
    port = 13145,
    attrs = mapOf(
      "v" to "1",
      "id" to "  THUNDER-DEV-001\r\n",
      "name" to "DOSO-THUNDER-001\u0000",
      "ap" to "DOSOrobotics",
      "vport" to "5050",
      "transport" to "lan-dev",
    ),
  ))

  // 3. Public IP 8.8.8.8 must be rejected
  nsd.completeActiveResolve(resolvedService(
    name = "DOSO-PUBLIC-BAD",
    host = "8.8.8.8",
    port = 13145,
    attrs = mapOf("id" to "BAD-PUBLIC"),
  ))

  // 4. Loopback 127.0.0.1, boundary non-RFC1918, and invalid ports must be rejected
  nsd.completeActiveResolve(resolvedService(
    name = "DOSO-LOOPBACK-BAD",
    host = "127.0.0.1",
    port = 13145,
    attrs = mapOf("id" to "BAD-LOOP"),
  ))
  for (bad in listOf(
    resolvedService("BAD-172-LOW", "172.15.255.255", 13145),
    resolvedService("BAD-172-HIGH", "172.32.0.0", 13145),
    resolvedService("BAD-PORT-ZERO", "192.168.50.1", 0),
    resolvedService("BAD-PORT-HIGH", "192.168.50.1", 65536),
  )) {
    listener.onServiceFound(NsdServiceInfo().apply {
      serviceName = bad.serviceName
      serviceType = "_doso-robot._tcp."
    })
  }

  // 5. Simulate FAILURE_ALREADY_ACTIVE once on 5th service, then succeed after retry delay
  assertEq(nsd.activeResolveCall?.info?.serviceName, "DOSO-172-EDGE-OK", "5th service resolving")
  nsd.failActiveResolve(NsdManager.FAILURE_ALREADY_ACTIVE)
  assertEq(nsd.activeResolveCall, null, "waiting for retry delay")
  // Pop retry runnable (2nd delayed task after session timeout)
  val retryTask = Looper.main.delayedTasks.removeAt(1)
  assertEq(retryTask.delayMs, 150L, "retry delay 150ms")
  retryTask.runnable.run()
  assertEq(nsd.activeResolveCall?.info?.serviceName, "DOSO-172-EDGE-OK", "5th service retried")
  nsd.completeActiveResolve(resolvedService(
    name = "DOSO-172-EDGE-OK",
    host = "172.16.0.9",
    port = 13145,
    attrs = mapOf("id" to "EDGE-172", "vport" to "70000"), // invalid vport -> null
  ))

  // 6. 10.x RFC1918 + >64 char TXT truncation + invalid UTF-8 bytes
  val longName = "A".repeat(90)
  val invalidUtf8 = byteArrayOf(0x44, 0x4F, 0xFF.toByte(), 0xFE.toByte(), 0x53, 0x4F) // "DO" + invalid + "SO"
  nsd.completeActiveResolve(resolvedService(
    name = "DOSO-10-TXT-BOUND",
    host = "10.0.0.5",
    port = 13145,
    attrs = mapOf("name" to "  $longName  ", "vport" to "5050"),
    rawAttrs = mapOf("id" to invalidUtf8),
  ))

  // Complete the 4 boundary invalid services (172.15, 172.32, port 0, port 65536) and ensure all rejected
  for (bad in listOf(
    resolvedService("BAD-172-LOW", "172.15.255.255", 13145),
    resolvedService("BAD-172-HIGH", "172.32.0.0", 13145),
    resolvedService("BAD-PORT-ZERO", "192.168.50.1", 0),
    resolvedService("BAD-PORT-HIGH", "192.168.50.1", 65536),
  )) {
    assertEq(nsd.activeResolveCall?.info?.serviceName, bad.serviceName, "boundary resolve ${bad.serviceName}")
    nsd.completeActiveResolve(bad)
  }

  assertEq(nsd.maxConcurrentResolves, 1, "NEVER ran concurrent resolveService on API < 34")
  assertEq(nsd.alreadyActiveFailures, 0, "stub never saw concurrent FAILURE_ALREADY_ACTIVE")

  // Fire discovery timeout
  assertTrue(Looper.main.runNextDelayed(), "timeout runnable fired")
  assertEq(lock.isHeld, false, "MulticastLock released on timeout")
  assertEq(nsd.stopDiscoveryCalls, 1, "stopServiceDiscovery called once")
  assertTrue(promise.resolved && promise.settleCount == 1, "promise resolved exactly once")

  val result = promise.value as Map<String, Any?>
  assertEq(result["timedOut"], true, "timedOut is true on timeout")
  val robots = result["robots"] as List<Map<String, Any?>>
  assertEq(robots.size, 3, "deduped & RFC1918-filtered robots count")

  val r0 = robots[0]
  assertEq(r0["host"], "192.168.66.64", "r0 host")
  assertEq(r0["port"], 13145, "r0 port")
  assertEq(r0["serviceName"], "DOSO-THUNDER-001", "r0 serviceName")
  assertEq(r0["robotId"], "THUNDER-DEV-001", "r0 robotId sanitized")
  assertEq(r0["displayName"], "DOSO-THUNDER-001", "r0 displayName sanitized")
  assertEq(r0["apSsid"], "DOSOrobotics", "r0 apSsid")
  assertEq(r0["videoPort"], 5050, "r0 videoPort")
  assertEq(r0["transport"], "lan-dev", "r0 transport")

  val r1 = robots[1]
  assertEq(r1["host"], "172.16.0.9", "r1 host")
  assertEq(r1["videoPort"], null, "r1 out-of-range vport becomes null")

  val r2 = robots[2]
  assertEq(r2["host"], "10.0.0.5", "r2 host")
  assertEq((r2["displayName"] as String).length, 64, "r2 displayName bounded to 64 chars")
  assertEq(r2["robotId"], "DOSO", "r2 invalid UTF-8 stripped cleanly")

  println("PASS: lan-discovery-serialized-resolve-rfc1918-txt-dedup")
}

@Suppress("UNCHECKED_CAST")
private fun testLanDiscoveryApi34AndIpv6MixedAndClamping() {
  Looper.main.reset()
  Build.VERSION.SDK_INT = 34
  val module = RobotWifiModule()
  val ctx = module.appContext.reactContext!!
  val nsd = ctx.nsd!!

  // Clamping: 200ms -> 1500ms
  val pLow = invokeDiscoverLan(module, 200)
  assertEq(Looper.main.recordedDelays.last(), 1500L, "min clamp 1500ms")

  val listener = nsd.activeDiscoveryListener!!
  listener.onServiceFound(NsdServiceInfo().apply {
    serviceName = "DOSO-API34"
    serviceType = "_doso-robot._tcp."
  })
  assertEq(nsd.resolveCallsTotal, 0, "API 34+ does not call deprecated resolveService")
  assertEq(nsd.registeredInfoCallbacks.size, 1, "API 34+ registers ServiceInfoCallback")

  val cb = nsd.registeredInfoCallbacks.single().callback
  // First update has IPv6 link-local + non-RFC1918 IPv4 -> must ignore
  cb.onServiceUpdated(resolvedService(
    name = "DOSO-API34",
    host = "fe80::1",
    port = 13145,
    hostAddresses = listOf("fe80::1", "169.254.10.2", "172.32.0.1"),
  ))
  // Second update has IPv6 + valid RFC1918 IPv4 -> picks RFC1918 IPv4!
  cb.onServiceUpdated(resolvedService(
    name = "DOSO-API34",
    host = "fe80::1",
    port = 13145,
    hostAddresses = listOf("fe80::1", "192.168.66.64"),
    attrs = mapOf("v" to "1", "id" to "THUNDER-DEV-001", "name" to "DOSO-THUNDER-001", "ap" to "DOSOrobotics", "vport" to "5050", "transport" to "lan-dev"),
  ))

  // Stop early via stopLanDiscovery
  invokeStopLan(module)
  assertEq(ctx.wifi.createdMulticastLocks.single().isHeld, false, "lock released on stopLanDiscovery")
  assertEq(nsd.unregisteredInfoCallbacks.size, 1, "API 34+ callback unregistered on stop")
  assertEq(Looper.main.delayedTasks.size, 0, "timeout cancelled on stop")
  assertTrue(pLow.resolved, "pLow resolved on stop")
  val res = pLow.value as Map<String, Any?>
  assertEq(res["timedOut"], false, "timedOut false on stopLanDiscovery")
  val robots = res["robots"] as List<Map<String, Any?>>
  assertEq(robots.size, 1, "one valid robot from mixed IPv6/IPv4 hostAddresses")
  assertEq(robots[0]["host"], "192.168.66.64", "picked IPv4 from hostAddresses")

  // Late callback after stop must not crash or mutate
  cb.onServiceUpdated(resolvedService(name = "LATE", host = "192.168.66.99", port = 13145))

  // Clamping: 99999ms -> 6000ms
  val pHigh = invokeDiscoverLan(module, 99999)
  assertEq(Looper.main.recordedDelays.last(), 6000L, "max clamp 6000ms")
  invokeStopLan(module)
  assertTrue(pHigh.resolved, "pHigh resolved cleanly")
  // Calling stopLanDiscovery when idle is a clean no-op
  invokeStopLan(module)
  println("PASS: lan-discovery-api34-mixed-ipv6-clamping-stop")
}

private fun testLanDiscoveryErrorPathsAndOnDestroyLockRelease() {
  // 1. Wi-Fi off
  Looper.main.reset()
  Build.VERSION.SDK_INT = 33
  run {
    val module = RobotWifiModule()
    val ctx = module.appContext.reactContext!!
    ctx.wifi.isWifiEnabled = false
    val p = invokeDiscoverLan(module, 3000)
    assertTrue(p.rejected && p.errorCode == "wifi_off", "wifi_off rejected")
    assertEq(ctx.wifi.createdMulticastLocks.size, 0, "no MulticastLock acquired when wifi_off")
  }

  // 2. NsdManager unavailable (null)
  run {
    val module = RobotWifiModule()
    val ctx = module.appContext.reactContext!!
    ctx.nsd = null
    val p = invokeDiscoverLan(module, 3000)
    assertTrue(p.rejected && p.errorCode == "discovery_failed", "null NsdManager -> discovery_failed")
    assertEq(ctx.wifi.createdMulticastLocks.size, 0, "no MulticastLock acquired when NsdManager null")
  }

  // 3. MulticastLock acquire SecurityException
  run {
    val module = RobotWifiModule()
    val ctx = module.appContext.reactContext!!
    ctx.wifi.throwOnMulticastAcquire = SecurityException("no CHANGE_WIFI_MULTICAST_STATE")
    val p = invokeDiscoverLan(module, 3000)
    assertTrue(p.rejected && p.errorCode == "permission_denied", "SecurityException -> permission_denied")
    assertEq(ctx.wifi.createdMulticastLocks.single().isHeld, false, "lock not held on acquire failure")
  }

  // 4. discoverServices throws synchronously -> MulticastLock MUST be released
  run {
    val module = RobotWifiModule()
    val ctx = module.appContext.reactContext!!
    ctx.nsd!!.discoverError = IllegalStateException("nsd daemon down")
    val p = invokeDiscoverLan(module, 3000)
    assertTrue(p.rejected && p.errorCode == "discovery_failed", "discoverServices error -> discovery_failed")
    assertEq(ctx.wifi.createdMulticastLocks.single().isHeld, false, "lock released on sync discoverServices error")
  }

  // 5. onStartDiscoveryFailed asynchronously -> MulticastLock MUST be released
  run {
    val module = RobotWifiModule()
    val ctx = module.appContext.reactContext!!
    val p = invokeDiscoverLan(module, 3000)
    val lock = ctx.wifi.createdMulticastLocks.single()
    assertEq(lock.isHeld, true, "lock held before async failure")
    ctx.nsd!!.activeDiscoveryListener!!.onStartDiscoveryFailed("_doso-robot._tcp.", NsdManager.FAILURE_INTERNAL_ERROR)
    assertTrue(p.rejected && p.errorCode == "discovery_failed", "async start failure -> discovery_failed")
    assertEq(lock.isHeld, false, "lock released on async start failure")
    assertEq(Looper.main.delayedTasks.size, 0, "timeout cancelled on async start failure")
  }

  // 6. OnDestroy while discovery is active (API 34) -> releases MulticastLock, unregisters callbacks, stops discovery
  run {
    Looper.main.reset()
    Build.VERSION.SDK_INT = 34
    val module = RobotWifiModule()
    val ctx = module.appContext.reactContext!!
    val nsd = ctx.nsd!!
    val def = module.definition()
    @Suppress("UNCHECKED_CAST")
    val discoverFn = def.functions["discoverLanRobots"] as (Int?, Promise) -> Unit
    val p = RecordingPromise()
    discoverFn(3000, p)
    nsd.activeDiscoveryListener!!.onServiceFound(NsdServiceInfo().apply {
      serviceName = "DOSO-DESTROY"
      serviceType = "_doso-robot._tcp."
    })
    val lock = ctx.wifi.createdMulticastLocks.single()
    assertEq(lock.isHeld, true, "lock held before OnDestroy")
    def.destroy!!.invoke()
    assertEq(lock.isHeld, false, "lock released in OnDestroy")
    assertEq(nsd.stopDiscoveryCalls, 1, "stopServiceDiscovery called in OnDestroy")
    assertEq(nsd.unregisteredInfoCallbacks.size, 1, "callbacks unregistered in OnDestroy")
    assertEq(Looper.main.delayedTasks.size, 0, "timeout cancelled in OnDestroy")
    assertEq(p.settleCount, 0, "does not deliver promise to destroyed ReactContext")
  }

  // 7. Overlapping discoverLanRobots stops previous session and releases first lock cleanly
  run {
    Looper.main.reset()
    Build.VERSION.SDK_INT = 33
    val module = RobotWifiModule()
    val ctx = module.appContext.reactContext!!
    val p1 = invokeDiscoverLan(module, 3000)
    val lock1 = ctx.wifi.createdMulticastLocks[0]
    assertEq(lock1.isHeld, true, "lock1 held")
    val p2 = invokeDiscoverLan(module, 2000)
    val lock2 = ctx.wifi.createdMulticastLocks[1]
    assertEq(lock1.isHeld, false, "lock1 released when superseded")
    assertTrue(p1.resolved, "p1 resolved cleanly when superseded")
    assertEq(lock2.isHeld, true, "lock2 held")
    invokeStopLan(module)
    assertEq(lock2.isHeld, false, "lock2 released")
    assertTrue(p2.resolved, "p2 resolved")
  }

  println("PASS: lan-discovery-errors-and-ondestroy-lock-release")
}

fun main() {
  testCurrentSsidCellularWithWifiAllNetworks()
  testBackwardsCompatibilityScanAndJoin()
  testLanDiscoverySerializedResolveValidationTxtAndDedup()
  testLanDiscoveryApi34AndIpv6MixedAndClamping()
  testLanDiscoveryErrorPathsAndOnDestroyLockRelease()
  println("PASS: all RobotWifiModule native tests")
}
