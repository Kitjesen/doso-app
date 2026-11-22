package android.net

import javax.net.SocketFactory

class Network {
  val socketFactory: SocketFactory = SocketFactory.getDefault()
}
class NetworkCapabilities {
  var wifi = true
  var transportInfo: Any? = android.net.wifi.WifiInfo()
  fun hasTransport(kind: Int) = wifi && kind == TRANSPORT_WIFI
  companion object { const val TRANSPORT_WIFI = 1 }
}
class ConnectivityManager {
  var activeNetwork: Network? = Network()
  val allNetworks: Array<Network> get() = activeNetwork?.let { arrayOf(it) } ?: emptyArray()
  val capabilities = NetworkCapabilities()
  fun getNetworkCapabilities(network: Network): NetworkCapabilities? = capabilities
}
