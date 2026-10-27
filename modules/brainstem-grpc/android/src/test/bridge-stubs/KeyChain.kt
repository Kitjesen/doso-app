package android.security

import java.security.KeyStore
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object KeyChain {
  lateinit var store: KeyStore
  var entered: CountDownLatch? = null
  var release: CountDownLatch? = null
  fun choosePrivateKeyAlias(activity: Any, callback: (String?) -> Unit, types: Array<String>, issuers: Any?, host: String, port: Int, alias: String?) { callback("fixture") }
  fun getPrivateKey(context: Any, alias: String): PrivateKey? {
    entered?.countDown()
    check(release?.await(2, TimeUnit.SECONDS) != false) { "fixture key lookup release timed out" }
    return store.getKey(alias, "fixture-password".toCharArray()) as? PrivateKey
  }
  fun getCertificateChain(context: Any, alias: String): Array<X509Certificate>? =
    store.getCertificateChain(alias)?.map { it as X509Certificate }?.toTypedArray()
}
