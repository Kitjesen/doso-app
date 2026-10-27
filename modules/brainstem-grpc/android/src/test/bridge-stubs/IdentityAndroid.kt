package android.security.keystore

import java.security.spec.AlgorithmParameterSpec
import java.security.spec.KeySpec

class KeyGenParameterSpec : AlgorithmParameterSpec {
  class Builder(alias: String, purposes: Int) {
    fun setAlgorithmParameterSpec(spec: AlgorithmParameterSpec) = this
    fun setDigests(vararg digests: String) = this
    fun setUserAuthenticationRequired(value: Boolean) = this
    fun build() = KeyGenParameterSpec()
  }
}
class KeyInfo : KeySpec { val isInsideSecureHardware = false }
object KeyProperties {
  const val KEY_ALGORITHM_EC = "EC"
  const val PURPOSE_SIGN = 4
  const val PURPOSE_VERIFY = 8
  const val DIGEST_SHA256 = "SHA-256"
}
