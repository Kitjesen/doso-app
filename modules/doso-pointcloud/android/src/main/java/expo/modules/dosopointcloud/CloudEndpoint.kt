package expo.modules.dosopointcloud

import java.net.URI

internal object CloudEndpoint {
  fun validate(endpoint: String, localBuild: Boolean, cleartextAllowed: (String) -> Boolean): String {
    val uri = URI(endpoint)
    val host = uri.host ?: throw IllegalArgumentException("SDK endpoint requires a host")
    require(uri.scheme == "https" || uri.scheme == "http") { "SDK endpoint must use HTTP or HTTPS" }
    require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
      (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") && uri.port in -1..65535 && uri.port != 0) {
      "SDK endpoint must be an origin"
    }
    if (uri.scheme == "http") {
      val parts = host.split('.')
      val octets = parts.mapNotNull { it.toIntOrNull()?.takeIf { octet -> octet in 0..255 } }
      val privateHost = parts.size == 4 && octets.size == 4 && (host == "127.0.0.1" || octets[0] == 10 ||
        octets[0] == 172 && octets[1] in 16..31 || octets[0] == 192 && octets[1] == 168)
      require(localBuild && privateHost && cleartextAllowed(host)) { "Cleartext SDK access is unavailable for this build or host" }
    }
    return uri.toASCIIString()
  }
}
