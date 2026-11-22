package android.net

class Network
class NetworkCapabilities {
  var wifi = true
  var transportInfo: Any? = android.net.wifi.WifiInfo()
  fun hasTransport(kind: Int) = wifi && kind == TRANSPORT_WIFI
  companion object { const val TRANSPORT_WIFI = 1 }
}
class ConnectivityManager {
  var activeNetwork: Network? = Network()
  val capabilities = NetworkCapabilities()
  fun getNetworkCapabilities(network: Network): NetworkCapabilities? = capabilities
}
