package android.net.nsd

import java.net.InetAddress
import java.util.concurrent.Executor

class NsdServiceInfo {
  var serviceName: String? = null
  var serviceType: String? = null
  var host: InetAddress? = null
  var hostAddresses: List<InetAddress> = emptyList()
  var port: Int = 0
  val attributes: MutableMap<String, ByteArray?> = LinkedHashMap()

  fun setAttribute(key: String, value: String?) {
    attributes[key] = value?.toByteArray(Charsets.UTF_8)
  }

  fun setRawAttribute(key: String, value: ByteArray?) {
    attributes[key] = value
  }
}

class NsdManager {
  interface DiscoveryListener {
    fun onStartDiscoveryFailed(serviceType: String, errorCode: Int)
    fun onStopDiscoveryFailed(serviceType: String, errorCode: Int)
    fun onDiscoveryStarted(regType: String)
    fun onDiscoveryStopped(serviceType: String)
    fun onServiceFound(serviceInfo: NsdServiceInfo)
    fun onServiceLost(serviceInfo: NsdServiceInfo)
  }

  interface ResolveListener {
    fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int)
    fun onServiceResolved(serviceInfo: NsdServiceInfo)
  }

  interface ServiceInfoCallback {
    fun onServiceInfoCallbackRegistrationFailed(errorCode: Int)
    fun onServiceUpdated(serviceInfo: NsdServiceInfo)
    fun onServiceLost()
    fun onServiceInfoCallbackUnregistered()
  }

  data class PendingResolveCall(val info: NsdServiceInfo, val listener: ResolveListener)
  data class RegisteredInfoCallback(val info: NsdServiceInfo, val executor: Executor, val callback: ServiceInfoCallback)

  var discoverError: Throwable? = null
  var lastServiceType: String? = null
  var lastProtocol: Int? = null
  var activeDiscoveryListener: DiscoveryListener? = null
  var stopDiscoveryCalls: Int = 0
  var activeResolveCall: PendingResolveCall? = null
  var resolveCallsTotal: Int = 0
  var maxConcurrentResolves: Int = 0
  var currentConcurrentResolves: Int = 0
  var alreadyActiveFailures: Int = 0
  val registeredInfoCallbacks = mutableListOf<RegisteredInfoCallback>()
  val unregisteredInfoCallbacks = mutableListOf<ServiceInfoCallback>()

  fun discoverServices(serviceType: String, protocolType: Int, listener: DiscoveryListener) {
    discoverError?.let { throw it }
    lastServiceType = serviceType
    lastProtocol = protocolType
    activeDiscoveryListener = listener
  }

  fun stopServiceDiscovery(listener: DiscoveryListener) {
    stopDiscoveryCalls += 1
    if (activeDiscoveryListener !== listener) {
      throw IllegalArgumentException("listener not registered")
    }
    activeDiscoveryListener = null
    listener.onDiscoveryStopped(lastServiceType ?: "")
  }

  fun resolveService(serviceInfo: NsdServiceInfo, listener: ResolveListener) {
    resolveCallsTotal += 1
    if (activeResolveCall != null) {
      alreadyActiveFailures += 1
      listener.onResolveFailed(serviceInfo, FAILURE_ALREADY_ACTIVE)
      return
    }
    currentConcurrentResolves += 1
    if (currentConcurrentResolves > maxConcurrentResolves) {
      maxConcurrentResolves = currentConcurrentResolves
    }
    activeResolveCall = PendingResolveCall(serviceInfo, listener)
  }

  fun completeActiveResolve(resolved: NsdServiceInfo) {
    val call = activeResolveCall ?: error("No active resolve")
    activeResolveCall = null
    currentConcurrentResolves -= 1
    call.listener.onServiceResolved(resolved)
  }

  fun failActiveResolve(errorCode: Int) {
    val call = activeResolveCall ?: error("No active resolve")
    activeResolveCall = null
    currentConcurrentResolves -= 1
    call.listener.onResolveFailed(call.info, errorCode)
  }

  fun registerServiceInfoCallback(
    serviceInfo: NsdServiceInfo,
    executor: Executor,
    callback: ServiceInfoCallback,
  ) {
    registeredInfoCallbacks.add(RegisteredInfoCallback(serviceInfo, executor, callback))
  }

  fun unregisterServiceInfoCallback(callback: ServiceInfoCallback) {
    unregisteredInfoCallbacks.add(callback)
    registeredInfoCallbacks.removeAll { it.callback === callback }
    callback.onServiceInfoCallbackUnregistered()
  }

  companion object {
    const val PROTOCOL_DNS_SD = 1
    const val FAILURE_INTERNAL_ERROR = 0
    const val FAILURE_ALREADY_ACTIVE = 3
  }
}
