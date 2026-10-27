package expo.modules.brainstemgrpc

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.io.ByteArrayOutputStream
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.cert.X509Certificate
import java.security.spec.ECGenParameterSpec

internal data class LocalIdentityKey(val privateKey: PrivateKey, val publicKey: PublicKey, val securityLevel: String)
internal interface LocalIdentityKeys {
  fun load(alias: String): LocalIdentityKey?
  fun create(alias: String): LocalIdentityKey
}

private class AndroidLocalIdentityKeys : LocalIdentityKeys {
  private fun store() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  override fun load(alias: String): LocalIdentityKey? {
    val store = store()
    if (!store.containsAlias(alias)) return null
    val key = store.getKey(alias, null) as? PrivateKey ?: throw IllegalStateException("identity key unavailable")
    val publicKey = store.getCertificate(alias)?.publicKey ?: throw IllegalStateException("identity public key unavailable")
    val level = runCatching {
      val info = KeyFactory.getInstance(key.algorithm, "AndroidKeyStore").getKeySpec(key, KeyInfo::class.java)
      if (info.isInsideSecureHardware) "hardware" else "software"
    }.getOrDefault("unknown")
    return LocalIdentityKey(key, publicKey, level)
  }
  override fun create(alias: String): LocalIdentityKey {
    load(alias)?.let { return it }
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
      initialize(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256).setUserAuthenticationRequired(false).build())
    }.generateKeyPair()
    return load(alias) ?: throw IllegalStateException("identity generation failed")
  }
}

/** A QA USB factory handoff reads only fixed app-private paths; no network-supplied trust. */
internal class LocalClientIdentityStore internal constructor(
  private val noBackup: File, private val keys: LocalIdentityKeys
) {
  constructor(context: Context) : this(context.noBackupFilesDir.canonicalFile, AndroidLocalIdentityKeys())

  private fun token(host: String, port: Int, robotId: String): String {
    require(robotId.matches(Regex("[A-Za-z0-9][A-Za-z0-9_-]{0,63}")))
    return LocalIdentityCrypto.sha256("$host|$port|$robotId".toByteArray(Charsets.UTF_8))
  }
  private fun privateFile(relative: String): File {
    val file = File(noBackup.canonicalFile, relative)
    for (candidate in listOf(file, File(file.path + ".bak"), File(file.path + ".new"))) require(candidate.canonicalPath == candidate.absolutePath)
    return file
  }
  private fun recordFile(token: String) = privateFile("brainstem-identities/$token.json")
  private fun read(file: File): JSONObject {
    val bytes = AtomicFile(file).openRead().use { it.readBytesLimited() }
    return JSONObject(bytes.toString(Charsets.UTF_8))
  }
  private fun java.io.InputStream.readBytesLimited(): ByteArray {
    val out = ByteArrayOutputStream(); val buffer = ByteArray(4096)
    while (true) {
      val count = read(buffer); if (count < 0) break
      require(out.size() + count <= LocalIdentityCrypto.MAX_BYTES)
      out.write(buffer, 0, count)
    }
    return out.toByteArray()
  }
  private fun write(file: File, value: JSONObject) {
    require(file.parentFile?.let { it.mkdirs() || it.isDirectory } == true)
    val bytes = value.toString().toByteArray(Charsets.UTF_8)
    require(bytes.size <= LocalIdentityCrypto.MAX_BYTES)
    val atomic = AtomicFile(file); val output = atomic.startWrite()
    try { output.write(bytes); atomic.finishWrite(output) }
    catch (error: Exception) { atomic.failWrite(output); throw error }
  }
  private fun matches(record: JSONObject, host: String, port: Int, robotId: String, token: String) {
    require(this.token(host, port, robotId) == token)
    require(record.getInt("version") == 1 && record.getString("host") == host && record.getInt("port") == port
      && record.getString("robotId") == robotId && record.getString("identityAlias") == "local:$token"
      && record.getString("requestId").matches(Regex("[A-Za-z0-9_-]{1,80}")))
    val requestId = record.getString("requestId")
    require(record.getString("requestFile") == "no_backup/brainstem-pairing/requests/$requestId.json"
      && record.getString("approvalFile") == "no_backup/brainstem-pairing/approved/$requestId.json")
    val key = keys.load("doso.brainstem.$token") ?: throw IllegalStateException("identity key unavailable")
    require(LocalIdentityCrypto.sha256(key.publicKey.encoded) == record.getString("publicKeySha256"))
  }
  private fun publicRecord(record: JSONObject): Map<String, Any> = buildMap {
    for (name in listOf("version", "status", "requestId", "host", "port", "robotId", "identityAlias", "csrPem", "publicKeySha256", "securityLevel", "requestFile", "approvalFile")) put(name, record.get(name))
    if (record.getString("status") == "ready") for (name in listOf("principal", "clientCertificateSha256", "caCertificateSha256")) put(name, record.getString(name))
  }
  private fun verifiedChain(record: JSONObject, token: String): Array<X509Certificate> {
    require(record.getString("status") == "ready")
    val key = keys.load("doso.brainstem.$token") ?: throw IllegalStateException("identity key unavailable")
    return LocalIdentityCrypto.approvedChain(record.getString("clientCertificatePem"), record.getString("caCertificatePem"),
      key.publicKey, record.getString("caCertificateSha256"), record.getString("clientSan")).also {
      require(LocalIdentityCrypto.sha256(it[0].encoded) == record.getString("clientCertificateSha256"))
    }
  }
  @Synchronized fun get(host: String, port: Int, robotId: String): Map<String, Any>? {
    val token = token(host, port, robotId); val file = recordFile(token)
    if (!file.exists() && !File(file.path + ".bak").exists()) return null
    val record = read(file); matches(record, host, port, robotId, token)
    require(record.getString("status") in listOf("pending", "ready"))
    if (record.getString("status") == "ready") verifiedChain(record, token)
    return publicRecord(record)
  }
  @Synchronized fun prepare(host: String, port: Int, robotId: String, requestId: String): Map<String, Any> {
    require(requestId.matches(Regex("[A-Za-z0-9_-]{1,80}")))
    get(host, port, robotId)?.let {
      write(privateFile("brainstem-pairing/requests/${it.getValue("requestId")}.json"), JSONObject(it))
      return it
    }
    val token = token(host, port, robotId); val key = keys.load("doso.brainstem.$token") ?: keys.create("doso.brainstem.$token")
    val record = JSONObject().put("version", 1).put("status", "pending").put("requestId", requestId).put("host", host)
      .put("port", port).put("robotId", robotId).put("identityAlias", "local:$token")
      .put("csrPem", LocalIdentityCrypto.csr(key.publicKey, key.privateKey))
      .put("publicKeySha256", LocalIdentityCrypto.sha256(key.publicKey.encoded)).put("securityLevel", key.securityLevel)
      .put("requestFile", "no_backup/brainstem-pairing/requests/$requestId.json")
      .put("approvalFile", "no_backup/brainstem-pairing/approved/$requestId.json")
    val request = privateFile("brainstem-pairing/requests/$requestId.json")
    if (request.exists()) require(read(request).toString() == record.toString())
    write(recordFile(token), record)
    write(request, record)
    return publicRecord(record)
  }
  @Synchronized fun acceptFactoryApproval(host: String, port: Int, robotId: String, requestId: String, publicJson: String): String {
    require(requestId.matches(Regex("[A-Za-z0-9_-]{1,80}")) && publicJson.toByteArray(Charsets.UTF_8).size <= LocalIdentityCrypto.MAX_BYTES)
    val token = token(host, port, robotId); val record = read(recordFile(token)); matches(record, host, port, robotId, token)
    require(record.getString("status") == "pending" && record.getString("requestId") == requestId)
    val approved = JSONObject(publicJson)
    for (name in listOf("requestId", "host", "robotId", "publicKeySha256")) require(approved.getString(name) == record.getString(name))
    require(approved.getInt("version") == 1 && approved.getInt("port") == port)
    write(privateFile("brainstem-pairing/approved/$requestId.json"), approved)
    return LocalIdentityCrypto.sha256(approved.toString().toByteArray(Charsets.UTF_8))
  }
  @Synchronized fun complete(host: String, port: Int, robotId: String, requestId: String, approvalSha256: String, commit: (() -> Unit) -> Unit): Map<String, Any> {
    require(requestId.matches(Regex("[A-Za-z0-9_-]{1,80}")))
    val token = token(host, port, robotId); val record = read(recordFile(token))
    matches(record, host, port, robotId, token); require(record.getString("requestId") == requestId)
    if (record.getString("status") == "ready") { verifiedChain(record, token); return publicRecord(record) }
    require(record.getString("status") == "pending")
    val approved = read(privateFile("brainstem-pairing/approved/$requestId.json"))
    require(LocalIdentityCrypto.sha256(approved.toString().toByteArray(Charsets.UTF_8)) == approvalSha256)
    require(approved.getInt("version") == 1)
    for (name in listOf("requestId", "host", "robotId", "publicKeySha256")) require(approved.getString(name) == record.getString(name))
    require(approved.getInt("port") == port && approved.getString("principal").matches(Regex("[a-z][a-z0-9-]{0,63}@[a-z][a-z0-9-]{0,63}")))
    val fingerprint = approved.getString("approvedCaSha256"); require(fingerprint.matches(Regex("[a-f0-9]{64}")))
    val key = keys.load("doso.brainstem.$token") ?: throw IllegalStateException("identity key unavailable")
    val chain = LocalIdentityCrypto.approvedChain(approved.getString("clientCertificatePem"), approved.getString("caCertificatePem"),
      key.publicKey, fingerprint, approved.getString("clientSan"))
    val ready = JSONObject(record.toString()).put("status", "ready").put("principal", approved.getString("principal"))
      .put("clientSan", approved.getString("clientSan")).put("clientCertificatePem", approved.getString("clientCertificatePem"))
      .put("caCertificatePem", approved.getString("caCertificatePem")).put("caCertificateSha256", fingerprint)
      .put("clientCertificateSha256", LocalIdentityCrypto.sha256(chain[0].encoded))
    commit { write(recordFile(token), ready) }
    return publicRecord(ready)
  }
  @Synchronized fun identity(host: String, port: Int, alias: String): Pair<PrivateKey, Array<X509Certificate>> {
    require(alias.matches(Regex("local:[a-f0-9]{64}")))
    val token = alias.removePrefix("local:"); val record = read(recordFile(token))
    matches(record, host, port, record.getString("robotId"), token)
    val key = keys.load("doso.brainstem.$token") ?: throw IllegalStateException("identity key unavailable")
    return Pair(key.privateKey, verifiedChain(record, token))
  }
}
