package android.net

import java.net.InetAddress

class Network(val id: String = "net")

class LinkAddress(val address: InetAddress)

class LinkProperties(val linkAddresses: List<LinkAddress> = emptyList())

class NetworkCapabilities(
  private val transports: Set<Int> = emptySet(),
  var transportInfo: Any? = null,
) {
  fun hasTransport(transportType: Int): Boolean = transportType in transports

  companion object {
    const val TRANSPORT_CELLULAR = 0
    const val TRANSPORT_WIFI = 1
    const val NET_CAPABILITY_INTERNET = 12
  }
}

class NetworkRequest(val specifier: Any?) {
  class Builder {
    private var specifier: Any? = null
    fun addTransportType(transportType: Int): Builder = this
    fun removeCapability(capability: Int): Builder = this
    fun setNetworkSpecifier(specifier: Any): Builder {
      this.specifier = specifier
      return this
    }
    fun build(): NetworkRequest = NetworkRequest(specifier)
  }
}

class ConnectivityManager {
  open class NetworkCallback {
    open fun onAvailable(network: Network) {}
    open fun onUnavailable() {}
    open fun onLost(network: Network) {}
  }

  var activeNetwork: Network? = null
  var allNetworks: Array<Network> = emptyArray()
  val capabilitiesByNetwork = mutableMapOf<Network, NetworkCapabilities>()
  val linkPropertiesByNetwork = mutableMapOf<Network, LinkProperties>()
  var lastCallback: NetworkCallback? = null
  var boundNetwork: Network? = null
  var unregisteredCallbacks = 0

  fun getNetworkCapabilities(network: Network): NetworkCapabilities? = capabilitiesByNetwork[network]

  fun getLinkProperties(network: Network): LinkProperties? = linkPropertiesByNetwork[network]

  fun requestNetwork(request: NetworkRequest, callback: NetworkCallback, timeoutMs: Int) {
    lastCallback = callback
  }

  fun unregisterNetworkCallback(callback: NetworkCallback) {
    unregisteredCallbacks += 1
    if (lastCallback === callback) lastCallback = null
  }

  fun bindProcessToNetwork(network: Network?): Boolean {
    boundNetwork = network
    return true
  }
}
