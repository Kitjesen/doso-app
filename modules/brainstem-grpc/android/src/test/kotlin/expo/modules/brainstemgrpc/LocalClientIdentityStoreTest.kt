package expo.modules.brainstemgrpc

import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.security.KeyStore
import java.util.concurrent.CountDownLatch

internal class FixtureIdentityKeys(private val material: LocalIdentityKey) : LocalIdentityKeys {
  val values = mutableMapOf<String, LocalIdentityKey>()
  var creates = 0
  var entered: CountDownLatch? = null
  var release: CountDownLatch? = null
  override fun load(alias: String): LocalIdentityKey? {
    entered?.countDown(); release?.await()
    return values[alias]
  }
  override fun create(alias: String): LocalIdentityKey { creates++; values[alias] = material; return material }
}

private fun fails(body: () -> Unit) {
  var rejected = false
  try { body() } catch (_: Exception) { rejected = true }
  check(rejected) { "invalid identity accepted" }
}

fun main(args: Array<String>) {
  val phase = args[0]; val root = File(args[2]); val noBackup = File(root, "no_backup")
  val keyStore = KeyStore.getInstance("PKCS12").apply { FileInputStream(args[1]).use { load(it, "fixture-password".toCharArray()) } }
  val material = LocalIdentityKey(keyStore.getKey("fixture", "fixture-password".toCharArray()) as java.security.PrivateKey,
    keyStore.getCertificate("fixture").publicKey, "software")
  val keys = FixtureIdentityKeys(material)
  val host = "robot.example.test"; val port = 13145; val robot = "THUNDER-TEST"; val requestId = "request-one"
  val alias = "doso.brainstem." + LocalIdentityCrypto.sha256("$host|$port|$robot".toByteArray())
  val store = LocalClientIdentityStore(noBackup, keys)
  if (phase == "prepare") {
    val prepared = store.prepare(host, port, robot, requestId)
    check(keys.creates == 1 && prepared["status"] == "pending")
    val repeated = LocalClientIdentityStore(noBackup, keys).prepare(host, port, robot, "ignored-new-request")
    check(repeated == prepared && keys.creates == 1)
    val requestFile = File(root, prepared.getValue("requestFile") as String)
    check(requestFile.isFile); check(requestFile.delete())
    check(store.prepare(host, port, robot, "ignored-again") == prepared && requestFile.isFile)
    File(root, "client.csr.pem").writeText(prepared.getValue("csrPem") as String)
    File(root, "request.json").writeText(JSONObject(prepared).toString())
    check(!JSONObject(prepared).toString().contains("PRIVATE KEY"))
    println("PASS: one-key idempotent request, restart metadata and public export recovery")
    return
  }
  keys.values[alias] = material
  val pending = store.get(host, port, robot)!!
  check(pending["requestId"] == requestId && keys.creates == 0)
  val recordFile = File(noBackup, "brainstem-identities/${alias.removePrefix("doso.brainstem.")}.json")
  val before = recordFile.readBytes()
  fun base(client: String = "client.cert.pem", ca: String = "ca.cert.pem") = JSONObject()
    .put("version", 1).put("requestId", requestId).put("host", host).put("port", port).put("robotId", robot)
    .put("publicKeySha256", pending.getValue("publicKeySha256")).put("principal", "doso-test@robot")
    .put("clientSan", "URI:urn:doso:client:test").put("approvedCaSha256", LocalIdentityCrypto.sha256(LocalIdentityCrypto.certificate(File(root, ca).readText()).encoded))
    .put("clientCertificatePem", File(root, client).readText()).put("caCertificatePem", File(root, ca).readText())
  fun stage(value: JSONObject) = store.acceptFactoryApproval(host, port, robot, requestId, value.toString())
  fun complete(digest: String) = store.complete(host, port, robot, requestId, digest) { it() }
  for (name in listOf("requestId", "host", "robotId", "publicKeySha256")) {
    fails { stage(base().put(name, "wrong")) }; check(recordFile.readBytes().contentEquals(before))
  }
  fails { stage(base().put("port", port + 1)) }
  check(!LocalIdentityCrypto.certificate(File(root, "constrained-ca.cert.pem").readText()).hasUnsupportedCriticalExtension())
  for (value in listOf(
    base("wrong-key.cert.pem"), base("wrong-san.cert.pem"), base("wrong-purpose.cert.pem"),
    base("expired.cert.pem"), base("critical.cert.pem"), base(ca = "other-ca.cert.pem"), base("constrained-client.cert.pem", "constrained-ca.cert.pem"),
    base().put("approvedCaSha256", "0".repeat(64)), base().put("principal", "not-a-principal"),
    base().put("clientCertificatePem", File(root, "client.cert.pem").readText() + File(root, "ca.cert.pem").readText()),
    base().put("caCertificatePem", File(root, "ca.cert.pem").readText() + "\n-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----"),
  )) {
    val digest = stage(value); fails { complete(digest) }
    check(recordFile.readBytes().contentEquals(before)) { "failed import changed identity record" }
  }
  val validDigest = stage(base())
  fails { store.complete(host, port, robot, requestId, validDigest) { throw IllegalStateException("cancelled generation") } }
  check(recordFile.readBytes().contentEquals(before))
  stage(base().put("principal", "another@robot")); fails { complete(validDigest) }
  check(recordFile.readBytes().contentEquals(before))
  fails { store.acceptFactoryApproval(host, port, robot, requestId, "x".repeat(LocalIdentityCrypto.MAX_BYTES + 1)) }
  val ready = complete(stage(base()))
  check(ready["status"] == "ready" && ready["requestId"] == requestId && keys.creates == 0)
  check(!JSONObject(ready).toString().contains("CERTIFICATE-----") && !JSONObject(ready).toString().contains("PRIVATE KEY"))
  check(LocalClientIdentityStore(noBackup, keys).get(host, port, robot) == ready)
  val identity = store.identity(host, port, ready.getValue("identityAlias") as String)
  check(identity.first === material.privateKey && identity.second.size == 2)
  fails { store.identity("other.test", port, ready.getValue("identityAlias") as String) }
  fails { store.identity(host, port + 1, ready.getValue("identityAlias") as String) }
  fails { store.identity(host, port, "local:" + "0".repeat(64)) }
  fails { LocalClientIdentityStore(noBackup, FixtureIdentityKeys(material)).get(host, port, robot) }
  check(store.prepare(host, port, robot, "never-regenerate") == ready && keys.creates == 0)
  val readyBytes = recordFile.readBytes()
  check(complete("0".repeat(64)) == ready) // Existing ready records never consume another approval.
  check(recordFile.readBytes().contentEquals(readyBytes))
  println("PASS: certificate/public-key/target/request/purpose/SAN/validity/CA/critical/mixed-PEM rejection")
  println("PASS: cancelled commit and changed-stage digest preserve pending identity")
  println("PASS: ready restart, scoped alias, missing-key failure and no key regeneration")
}
