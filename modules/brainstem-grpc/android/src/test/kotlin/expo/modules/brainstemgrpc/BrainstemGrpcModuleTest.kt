package expo.modules.brainstemgrpc

import android.security.KeyChain
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Definition
import io.grpc.CallOptions
import io.grpc.ClientCall
import io.grpc.ManagedChannel
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.grpc.Status
import java.io.FileInputStream
import java.security.KeyStore
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.net.InetAddress
import java.net.Socket
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import android.content.Intent
import android.os.Build
import android.util.Base64
import android.view.WindowInsets
import android.view.WindowInsetsController
import org.json.JSONObject

private const val HOST = "robot.example.test"
private const val PORT = 13145
private const val ALIAS = "fixture"
private lateinit var localMaterial: LocalIdentityKey

private class Result : Promise {
  val done = CountDownLatch(1)
  var value: Any? = null
  var error: String? = null
  var settlements = 0
  override fun resolve(value: Any?) { this.value = value; settlements++; done.countDown() }
  override fun reject(code: String, message: String, cause: Throwable?) { error = code; settlements++; done.countDown() }
  fun await(timeout: Long = 1500): Result { check(done.await(timeout, TimeUnit.MILLISECONDS)) { "bridge promise did not settle" }; return this }
  fun success() { await(); check(error == null) { "expected success, got $error" }; check(settlements == 1) }
  fun rejected(code: String) { await(); check(error == code) { "expected $code, got $error" }; check(settlements == 1) }
}

object ModuleTestTransport {
  val methods = CopyOnWriteArrayList<String>()
  val channels = CopyOnWriteArrayList<ModuleTestChannel>()
  var requestClientCertificate = true
  fun channel(host: String, port: Int, factory: SSLSocketFactory?): ManagedChannel {
    check((host == HOST || host == "192.168.42.64") && port == PORT) { "fixture forbids other network targets" }
    return ModuleTestChannel(factory).also { channels.add(it) }
  }
  fun authenticate(factory: SSLSocketFactory) {
    val managers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(KeyChain.store, "fixture-password".toCharArray()) }
    val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(KeyChain.store) }
    val serverContext = SSLContext.getInstance("TLS").apply { init(managers.keyManagers, trust.trustManagers, null) }
    val server = serverContext.serverSocketFactory.createServerSocket(0, 1, InetAddress.getLoopbackAddress()) as SSLServerSocket
    server.needClientAuth = requestClientCertificate
    val done = CountDownLatch(1)
    var failure: Throwable? = null
    val thread = Thread {
      try { (server.accept() as SSLSocket).use { it.soTimeout = 2000; it.startHandshake() } }
      catch (error: Throwable) { failure = error }
      finally { done.countDown() }
    }
    thread.start()
    try {
      (factory.createSocket(Socket(InetAddress.getLoopbackAddress(), server.localPort), HOST, server.localPort, true) as SSLSocket).use {
        it.soTimeout = 2000; it.startHandshake()
      }
      check(done.await(3, TimeUnit.SECONDS)) { "local TLS server timeout" }
      failure?.let { throw it }
    } finally { server.close(); thread.join(3000) }
  }
}

class ModuleTestChannel(private val factory: SSLSocketFactory? = null) : ManagedChannel() {
  @Volatile private var stopped = false
  override fun authority() = "fake-local-only"
  override fun shutdown(): ManagedChannel { stopped = true; return this }
  override fun shutdownNow() = shutdown()
  override fun isShutdown() = stopped
  override fun isTerminated() = stopped
  override fun awaitTermination(timeout: Long, unit: TimeUnit) = stopped
  override fun <ReqT : Any?, RespT : Any?> newCall(method: MethodDescriptor<ReqT, RespT>, options: CallOptions): ClientCall<ReqT, RespT> {
    val name = method.bareMethodName!!
    return object : ClientCall<ReqT, RespT>() {
      lateinit var listener: Listener<RespT>
      override fun start(value: Listener<RespT>, headers: Metadata) { listener = value }
      override fun request(count: Int) {}
      override fun sendMessage(value: ReqT) {}
      override fun cancel(message: String?, cause: Throwable?) {}
      @Suppress("UNCHECKED_CAST")
      override fun halfClose() {
        factory?.let { ModuleTestTransport.authenticate(it) }
        ModuleTestTransport.methods.add(name)
        // Protobuf defaults are legitimate grounded/disabled/no-owner observations.
        listener.onMessage(byteArrayOf() as RespT)
        listener.onClose(Status.OK, Metadata())
      }
    }
  }
}

private class Bridge {
  val module = BrainstemGrpcModule()
  val definition = module.definition()
  val controlChannel = ModuleTestChannel()
  val session = ControlSession(controlChannel, "doso-g20@robot") { it() }
  init {
    @Suppress("UNCHECKED_CAST")
    val approved = field("approvedIdentities").get(module) as MutableMap<String, String>
    approved["$HOST|$PORT"] = ALIAS
    field("control").set(module, session)
    // Install the committed peer when available; the original bridge has no such field.
    runCatching { field("controlPeer") }.getOrNull()?.let { peer ->
      val choice = BrainstemGrpcModule::class.java.declaredClasses.single { it.simpleName == "IdentityChoice" }
      val constructor = choice.declaredConstructors.single { it.parameterCount == 4 }.apply { isAccessible = true }
      peer.set(module, constructor.newInstance(HOST, PORT, ALIAS, false))
    }
  }
  fun field(name: String) = BrainstemGrpcModule::class.java.getDeclaredField(name).apply { isAccessible = true }
  @Suppress("UNCHECKED_CAST")
  fun read(name: String, host: String = HOST, port: Int = PORT, alias: String? = ALIAS): Result {
    val result = Result()
    (definition.functions.getValue(name) as (String, Int, String?, String, Promise) -> Unit)(host, port, alias, "fixture-${System.nanoTime()}", result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun controlRead(): Result {
    val result = Result()
    (definition.functions.getValue("readControlStatus") as (String, Promise) -> Unit)(session.id, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun open(): Result {
    val result = Result()
    (definition.functions.getValue("openControl") as (String, Int, String, String, String, Promise) -> Unit)(HOST, PORT, ALIAS, "doso-g20@robot", "fixture-open", result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun close() { (definition.functions.getValue("closeControl") as (String) -> Unit)(session.id) }
  fun destroy() = definition.destroy()
}

@Suppress("UNCHECKED_CAST")
private fun controlNavigationStableInsetsAndLifecycle() {
  val module = BrainstemGrpcModule()
  val definition = module.definition()
  val activity = module.appContext.currentActivity!!
  val controller = activity.window.insetsController!!
  val methodsBefore = ModuleTestTransport.methods.toList()
  val channelsBefore = ModuleTestTransport.channels.toList()
  val sdkBefore = Build.VERSION.SDK_INT
  val navigationBars = WindowInsets.Type.navigationBars()
  var destroyed = false
  fun hidden(value: Boolean) = (definition.functions.getValue("setControlNavigationHidden") as (Boolean) -> Double)(value)
  try {
    controller.systemBarsBehavior = 7
    activity.window.decorView.rootWindowInsets!!.stableBottom = 72
    activity.resources.displayMetrics.density = 3.0f
    check(hidden(true) == 24.0 && controller.navigationHidden)
    check(controller.systemBarsBehavior == WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)
    check(hidden(true) == 24.0) { "hidden navigation must still report its stable bottom inset" }
    check(hidden(false) == 24.0 && !controller.navigationHidden && controller.systemBarsBehavior == 7)

    hidden(true)
    definition.background()
    check(!controller.navigationHidden && controller.systemBarsBehavior == 7)
    definition.foreground()
    check(controller.navigationHidden && activity.uiDispatches == 2)
    hidden(false)
    definition.background(); definition.foreground()
    check(!controller.navigationHidden && controller.systemBarsBehavior == 7)
    check(controller.changes.all { it.second == navigationBars }) { "navigation UI must not hide other system bars" }

    val previousChanges = controller.changes.toList()
    Build.VERSION.SDK_INT = 29
    check(hidden(true) == 0.0)
    definition.background(); definition.foreground()
    check(controller.changes == previousChanges) { "old Android must keep its navigation visible" }
    Build.VERSION.SDK_INT = sdkBefore

    hidden(true)
    definition.destroy(); destroyed = true
    check(!controller.navigationHidden && controller.systemBarsBehavior == 7)
    check(ModuleTestTransport.methods.toList() == methodsBefore && ModuleTestTransport.channels.toList() == channelsBefore) {
      "navigation changes must not open a control channel or send an RPC"
    }
  } finally {
    Build.VERSION.SDK_INT = sdkBefore
    if (!destroyed) definition.destroy()
  }
}

@Suppress("UNCHECKED_CAST")
private fun lanEntryGuardsAndPeer() {
  val bridge = Bridge()
  val target = "192.168.42.64"
  fun read(host: String): Result {
    val result = Result()
    (bridge.definition.functions.getValue("readLanStatus") as (String, Int, String, Promise) -> Unit)(host, PORT, "lan-read", result)
    return result
  }
  fun open(host: String): Result {
    val result = Result()
    (bridge.definition.functions.getValue("openLanControl") as (String, Int, String, Promise) -> Unit)(host, PORT, "lan-open", result)
    return result
  }
  try {
    for (host in listOf("8.8.8.8", "127.0.0.1", "172.15.0.1", "172.32.0.1", "robot.test", "::1", "::ffff:192.168.42.64", "192.168.066.64")) {
      read(host).rejected("config"); open(host).rejected("config")
    }
    read(target).rejected("busy") // Same host/alias is insufficient: a TLS session cannot admit a LAN read.
    bridge.session.close()
    bridge.field("control").set(bridge.module, null); bridge.field("controlPeer").set(bridge.module, null)
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.qa.other"
    read(target).rejected("config"); open(target).rejected("config")
    bridge.module.appContext.reactContext.packageName = "com.doso.robot"
    read(target).rejected("config"); open(target).rejected("config")
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.qa"
    val result = open(target); result.success()
    val value = result.value as Map<*, *>
    check(value["transport"] == "grpc-lan" && value["mutualTlsVerified"] == false && value["clientIdentitySelected"] == false)
    val principal = value["sessionPrincipal"] as String
    check(principal.matches(Regex("lan-[0-9a-f]{32}@dev")))
    check(value["principalVerified"] == false && value["leaseOwnerMatched"] == false)
    read(target).success()
    bridge.read("readStatus", target, PORT, null).rejected("busy")
    bridge.definition.background(); read(target).rejected("background")
    check(ModuleTestTransport.methods.none { it == "AcquireControl" || it == "Enable" || it == "WalkChecked" })
  } finally { bridge.destroy() }
}

private fun samePeerReads() {
  val bridge = Bridge()
  try {
    for (name in listOf("readStatus", "readProfile", "readVoltage", "readMotorStatus")) bridge.read(name).success()
    check(ModuleTestTransport.methods.containsAll(listOf("GetControlStatus", "GetProfile", "GetVoltage", "GetMotorStatus")))
    for ((host, port, alias) in listOf(Triple("other.test", PORT, ALIAS), Triple(HOST, PORT + 1, ALIAS),
      Triple(HOST, PORT, "other"), Triple(HOST, PORT, null))) bridge.read("readStatus", host, port, alias).rejected("busy")
    bridge.field("picker").set(bridge.module, Result())
    bridge.read("readStatus").rejected("busy")
    bridge.field("picker").set(bridge.module, null)
    bridge.field("controlOpening").set(bridge.module, Result())
    bridge.read("readStatus").rejected("busy")
    bridge.field("controlOpening").set(bridge.module, null)
    @Suppress("UNCHECKED_CAST")
    val approved = bridge.field("approvedIdentities").get(bridge.module) as MutableMap<String, String>
    approved.clear(); bridge.read("readStatus").rejected("identity_unavailable")
  } finally { bridge.destroy() }
}

private fun slowReadDoesNotBlockControl() {
  val bridge = Bridge()
  KeyChain.entered = CountDownLatch(1); KeyChain.release = CountDownLatch(1)
  try {
    val read = bridge.read("readVoltage")
    check(KeyChain.entered!!.await(1, TimeUnit.SECONDS)) { "telemetry never reached the fake KeyChain lookup; rejection=${read.error}" }
    bridge.read("readStatus").rejected("busy")
    val control = bridge.controlRead()
    check(control.done.await(300, TimeUnit.MILLISECONDS)) { "slow read blocked the control executor" }
    control.success()
    check(read.done.count == 1L) { "fixture must still hold the read while control completes" }
    KeyChain.release!!.countDown(); read.success()
  } finally { KeyChain.release?.countDown(); KeyChain.entered = null; KeyChain.release = null; bridge.destroy() }
}

private fun lifecycleCancelsReadAndPeer() {
  for (kind in listOf("close", "background", "destroy")) {
    val bridge = Bridge()
    KeyChain.entered = CountDownLatch(1); KeyChain.release = CountDownLatch(1)
    try {
      val read = bridge.read("readVoltage")
      check(KeyChain.entered!!.await(1, TimeUnit.SECONDS))
      when (kind) {
        "close" -> bridge.close()
        "background" -> bridge.definition.background()
        else -> bridge.destroy()
      }
      read.rejected(if (kind == "background") "background" else "cancelled")
      check(bridge.field("control").get(bridge.module) == null)
      check(bridge.field("controlPeer").get(bridge.module) == null)
      if (kind == "destroy") check((bridge.field("readWorker").get(bridge.module) as java.util.concurrent.ExecutorService).isShutdown)
      KeyChain.release!!.countDown()
      bridge.controlRead().rejected(if (kind == "close") "cancelled" else "background")
    } finally {
      KeyChain.release?.countDown(); KeyChain.entered = null; KeyChain.release = null
      if (kind != "destroy") bridge.destroy()
    }
  }
}

private fun failedOpenDoesNotLeavePeer() {
  val bridge = Bridge()
  try {
    bridge.close()
    ModuleTestTransport.requestClientCertificate = false
    bridge.open().rejected("unauthorized")
    check(bridge.field("controlPeer").get(bridge.module) == null)
    check(bridge.field("control").get(bridge.module) == null)
    bridge.read("readVoltage").rejected("unauthorized")
    ModuleTestTransport.requestClientCertificate = true
    val recovered = bridge.read("readVoltage"); recovered.success()
    val value = recovered.value as Map<*, *>
    check(value["mutualTlsVerified"] == true && (value["clientCertificateSha256"] as String).length == 64)
  } finally { ModuleTestTransport.requestClientCertificate = true; bridge.destroy() }
}

@Suppress("UNCHECKED_CAST")
private fun factoryPermissionAndLifecycle() {
  val bridge = Bridge(); bridge.close()
  val context = bridge.module.appContext.reactContext
  val keys = FixtureIdentityKeys(localMaterial)
  bridge.field("localIdentityStore").set(bridge.module, LocalClientIdentityStore(context.noBackupFilesDir, keys))
  fun prepare(): Result {
    val result = Result()
    (bridge.definition.functions.getValue("prepareLocalClientIdentity") as (String, Int, String, String, Promise) -> Unit)(HOST, PORT, "THUNDER-TEST", "factory-request", result)
    return result
  }
  fun complete(): Result {
    val result = Result()
    (bridge.definition.functions.getValue("completeLocalClientIdentity") as (String, Int, String, String, Promise) -> Unit)(HOST, PORT, "THUNDER-TEST", "factory-request", result)
    return result
  }
  fun send(operation: String, requestId: String? = null, approval: String? = null): JSONObject {
    val receiver = context.receiver ?: error("factory receiver missing")
    val intent = Intent(context.packageName + ".BRAINSTEM_FACTORY").apply { `package` = context.packageName; putExtra("operation", operation) }
    requestId?.let { intent.putExtra("requestId", it) }
    approval?.let { intent.putExtra("approvalBase64", Base64.encodeToString(it.toByteArray(), Base64.NO_WRAP)) }
    receiver.onReceive(context, intent)
    val pending = receiver.result ?: error("ordered result missing")
    check(pending.done.await(2, TimeUnit.SECONDS))
    val encoded = pending.resultData!!.removePrefix("BRAINSTEM_FACTORY_V1:")
    return JSONObject(Base64.decode(encoded, Base64.NO_WRAP).toString(Charsets.UTF_8)).also {
      check(pending.resultCode == if (it.getBoolean("ok")) -1 else 0)
    }
  }
  try {
    complete().rejected("unauthorized")
    val prepared = prepare(); prepared.success()
    check(context.senderPermission == "android.permission.MANAGE_DEBUGGING")
    val receiver = context.receiver!!
    receiver.onReceive(context, Intent(context.packageName + ".BRAINSTEM_FACTORY").apply { putExtra("operation", "export") })
    check(receiver.result == null) { "factory accepted a broadcast without an explicit target package" }
    check(!send("export", "other-request").getBoolean("ok"))
    val exported = send("export").getJSONObject("request")
    check(exported.getString("requestId") == "factory-request" && exported.getString("csrPem").contains("BEGIN CERTIFICATE REQUEST"))
    val approved = JSONObject().put("version", 1).put("requestId", "factory-request").put("host", HOST).put("port", PORT)
      .put("robotId", "THUNDER-TEST").put("publicKeySha256", exported.getString("publicKeySha256"))
      .put("principal", "doso-test@robot").put("clientSan", "URI:urn:doso:client:test").put("approvedCaSha256", "0".repeat(64))
      .put("clientCertificatePem", "not-a-certificate").put("caCertificatePem", "not-a-certificate")
    check(!send("approve", approval = approved.toString()).getBoolean("ok"))
    check(send("approve", "factory-request", approved.toString()).getBoolean("ok"))
    (bridge.definition.functions.getValue("cancelLocalClientIdentity") as () -> Unit)()
    check(context.receiver == null)
    prepare().success()
    complete().rejected("unauthorized") // A stale private approved file is not a new factory approval.
    check(send("approve", "factory-request", approved.toString()).getBoolean("ok"))
    complete().rejected("identity_unavailable")
    check(bridge.field("approvedIdentities").get(bridge.module).let { it as Map<*, *> }.values.none { it.toString().startsWith("local:") })
    prepare().success()
    bridge.definition.background()
    check(context.receiver == null)
    complete().rejected("background")
    bridge.definition.foreground()
    prepare().success()
    check(keys.creates == 1)
  } finally {
    bridge.destroy()
    check(context.noBackupFilesDir.canonicalFile.parentFile == java.io.File(System.getProperty("java.io.tmpdir")).canonicalFile && context.noBackupFilesDir.name.startsWith("doso-context-"))
    context.noBackupFilesDir.deleteRecursively()
  }
}

fun main(args: Array<String>) {
  val mapper = BrainstemGrpcModule::class.java.getDeclaredMethod("safeGrpcCode", Status::class.java).apply { isAccessible = true }
  val mappingModule = BrainstemGrpcModule()
  check(mapper.invoke(mappingModule, Status.UNIMPLEMENTED.withDescription("private server details")) == "unimplemented")
  check(mapper.invoke(mappingModule, Status.UNAVAILABLE) == "unavailable")
  KeyChain.store = KeyStore.getInstance("PKCS12").apply { FileInputStream(args[0]).use { load(it, "fixture-password".toCharArray()) } }
  val local = KeyStore.getInstance("PKCS12").apply { FileInputStream(args[1]).use { load(it, "fixture-password".toCharArray()) } }
  localMaterial = LocalIdentityKey(local.getKey("fixture", "fixture-password".toCharArray()) as java.security.PrivateKey, local.getCertificate("fixture").publicKey, "software")
  val cases = listOf("control-navigation-stable-inset-and-lifecycle-only" to ::controlNavigationStableInsetsAndLifecycle,
    "same-peer-four-reads-and-rejections" to ::samePeerReads,
    "lan-private-ipv4-qa-and-transport-peer-guards" to ::lanEntryGuardsAndPeer,
    "slow-read-independent-control-executor" to ::slowReadDoesNotBlockControl,
    "close-background-destroy-cancellation" to ::lifecycleCancelsReadAndPeer,
    "failed-open-clears-peer-without-bypassing-mtls" to ::failedOpenDoesNotLeavePeer,
    "factory-permission-target-generation-and-cancellation" to ::factoryPermissionAndLifecycle)
  var failures = 0
  for ((name, run) in cases) try { run(); println("PASS: $name") }
    catch (error: Throwable) { failures++; System.err.println("FAIL: $name: ${error.message}") }
  check(failures == 0) { "$failures bridge behavior cases failed" }
}
