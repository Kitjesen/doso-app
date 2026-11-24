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
import android.view.WindowManager
import org.json.JSONObject

private const val HOST = "robot.example.test"
private const val PORT = 13145
private const val ALIAS = "fixture"
private lateinit var localMaterial: LocalIdentityKey

private class Result(private val onSettle: (() -> Unit)? = null) : Promise {
  val done = CountDownLatch(1)
  var value: Any? = null
  var error: String? = null
  var settlements = 0
  override fun resolve(value: Any?) { this.value = value; settlements++; onSettle?.invoke(); done.countDown() }
  override fun reject(code: String, message: String, cause: Throwable?) { error = code; settlements++; onSettle?.invoke(); done.countDown() }
  fun await(timeout: Long = 1500): Result { check(done.await(timeout, TimeUnit.MILLISECONDS)) { "bridge promise did not settle" }; return this }
  fun success() { await(); check(error == null) { "expected success, got $error" }; check(settlements == 1) }
  fun rejected(code: String) { await(); check(error == code) { "expected $code, got $error" }; check(settlements == 1) }
}

object ModuleTestTransport {
  val methods = CopyOnWriteArrayList<String>()
  val channels = CopyOnWriteArrayList<ModuleTestChannel>()
  var requestClientCertificate = true
  fun channel(host: String, port: Int, factory: SSLSocketFactory?): ManagedChannel {
    check((host == HOST || host == "192.168.66.64" || host == "127.0.0.1") && port == PORT) { "fixture forbids other network targets" }
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
  @Volatile var beforeReply: ((String) -> Unit)? = null
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
        val hook = beforeReply
        val reply = {
          hook?.invoke(name)
          // Protobuf defaults are legitimate grounded/disabled/no-owner observations.
          listener.onMessage(byteArrayOf() as RespT)
          listener.onClose(Status.OK, Metadata())
        }
        if (hook == null) reply() else Thread { reply() }.start()
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
  fun controlRead(result: Result = Result()): Result {
    (definition.functions.getValue("readControlStatus") as (String, Promise) -> Unit)(session.id, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun input(result: Result): Result {
    (definition.functions.getValue("sendControlInput") as (String, Double, Double, Double, Promise) -> Unit)(session.id, 0.0, 0.0, 0.0, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun interrupt(): Result {
    val result = Result()
    (definition.functions.getValue("interruptControl") as (String, Promise) -> Unit)(session.id, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun open(): Result {
    val result = Result()
    (definition.functions.getValue("openControl") as (String, Int, String, String, String, Promise) -> Unit)(HOST, PORT, ALIAS, "doso-g20@robot", "fixture-open", result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun controlAction(action: String, profileName: String? = null): Result {
    val result = Result()
    (definition.functions.getValue("controlAction") as (String, String, String?, Promise) -> Unit)(session.id, action, profileName, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun listGestures(): Result {
    val result = Result()
    (definition.functions.getValue("listGestures") as (String, Promise) -> Unit)(session.id, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun getSpeedMode(): Result {
    val result = Result()
    (definition.functions.getValue("getSpeedMode") as (String, Promise) -> Unit)(session.id, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun getBodyHeightStatus(): Result {
    val result = Result()
    (definition.functions.getValue("getBodyHeightStatus") as (String, Promise) -> Unit)(session.id, result)
    return result
  }
  @Suppress("UNCHECKED_CAST")
  fun setBodyHeight(heightM: Double): Result {
    val result = Result()
    (definition.functions.getValue("setBodyHeight") as (String, Double, Promise) -> Unit)(session.id, heightM, result)
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
private fun keepScreenOnFlagsAndLifecycle() {
  val module = BrainstemGrpcModule()
  val definition = module.definition()
  val activity = module.appContext.currentActivity!!
  val window = activity.window
  val flag = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
  val methodsBefore = ModuleTestTransport.methods.toList()
  val channelsBefore = ModuleTestTransport.channels.toList()
  var destroyed = false
  fun setKeep(enabled: Boolean) = (definition.functions.getValue("setKeepScreenOn") as (Boolean) -> Unit)(enabled)
  fun isKeepOn() = (window.flags and flag) != 0
  try {
    check(!isKeepOn()) { "keepScreenOn flag must start cleared" }
    setKeep(true)
    check(isKeepOn()) { "setKeepScreenOn(true) must add FLAG_KEEP_SCREEN_ON" }
    setKeep(false)
    check(!isKeepOn()) { "setKeepScreenOn(false) must clear FLAG_KEEP_SCREEN_ON" }

    setKeep(true)
    check(isKeepOn())
    definition.background()
    check(!isKeepOn()) { "backgrounding must clear FLAG_KEEP_SCREEN_ON" }
    setKeep(true)
    check(!isKeepOn()) { "setKeepScreenOn(true) while paused must not add FLAG_KEEP_SCREEN_ON" }
    definition.foreground()
    check(isKeepOn()) { "foregrounding must restore FLAG_KEEP_SCREEN_ON when enabled" }

    setKeep(false)
    check(!isKeepOn())
    definition.background()
    definition.foreground()
    check(!isKeepOn()) { "foregrounding must keep FLAG_KEEP_SCREEN_ON cleared when disabled" }

    setKeep(true)
    check(isKeepOn())
    module.appContext.currentActivity = null
    setKeep(true)
    setKeep(false)
    module.appContext.currentActivity = activity
    setKeep(true)
    check(isKeepOn())

    definition.destroy()
    destroyed = true
    check(!isKeepOn()) { "destroy must clear FLAG_KEEP_SCREEN_ON" }
    setKeep(true)
    check(!isKeepOn()) { "destroyed module must not re-add FLAG_KEEP_SCREEN_ON" }
    check(window.flagChanges.all { it.second == flag }) { "keepScreenOn must only toggle FLAG_KEEP_SCREEN_ON" }
    check(ModuleTestTransport.methods.toList() == methodsBefore && ModuleTestTransport.channels.toList() == channelsBefore) {
      "keepScreenOn changes must not open a control channel or send an RPC"
    }
  } finally {
    module.appContext.currentActivity = activity
    if (!destroyed) definition.destroy()
  }
}

@Suppress("UNCHECKED_CAST")
private fun lanEntryGuardsAndPeer() {
  val bridge = Bridge()
  val target = "192.168.66.64"
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
    for (host in listOf("8.8.8.8", "127.0.0.2", "127.1", "2130706433", "172.15.0.1", "172.32.0.1", "robot.test", "::1", "::ffff:192.168.66.64", "192.168.066.64")) {
      read(host).rejected("config"); open(host).rejected("config")
    }
    read(target).rejected("busy") // Same host/alias is insufficient: a TLS session cannot admit a LAN read.
    bridge.session.close()
    bridge.field("control").set(bridge.module, null); bridge.field("controlPeer").set(bridge.module, null)
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.qa.other"
    read(target).rejected("config"); open(target).rejected("config")
    read("127.0.0.1").rejected("config"); open("127.0.0.1").rejected("config")
    bridge.module.appContext.reactContext.packageName = "com.doso.robot"
    read(target).rejected("config"); open(target).rejected("config")
    read("127.0.0.1").rejected("config"); open("127.0.0.1").rejected("config")
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.dev"
    read(target).rejected("config"); open(target).rejected("config")
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.localtest"
    read(target).rejected("config"); open(target).rejected("config")
    bridge.module.appContext.reactContext.applicationInfo.flags = android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.localtest.other"
    read(target).rejected("config"); open(target).rejected("config")
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.localtest"
    val localTestOpen = open(target); localTestOpen.success()
    read(target).success()
    bridge.definition.background()
    bridge.definition.foreground()
    bridge.module.appContext.reactContext.packageName = "com.doso.robot.dev"
    bridge.module.appContext.reactContext.applicationInfo.flags = android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE
    val result = open(target); result.success()
    val value = result.value as Map<*, *>
    check(value["transport"] == "grpc-lan" && value["mutualTlsVerified"] == false && value["clientIdentitySelected"] == false)
    val principal = value["sessionPrincipal"] as String
    check(principal.matches(Regex("lan-[0-9a-f]{32}@dev")))
    check(value["principalVerified"] == false && value["leaseOwnerMatched"] == false)
    read(target).success()
    read("127.0.0.1").rejected("busy") // A different peer never reuses the LAN control channel.
    bridge.read("readStatus", target, PORT, null).rejected("busy")
    bridge.definition.background(); read(target).rejected("background")
    check(ModuleTestTransport.methods.none { it == "AcquireControl" || it == "Enable" || it == "WalkChecked" })
  } finally { bridge.destroy() }
  val local = Bridge()
  try {
    local.session.close()
    local.field("control").set(local.module, null); local.field("controlPeer").set(local.module, null)
    val result = Result()
    (local.definition.functions.getValue("openLanControl") as (String, Int, String, Promise) -> Unit)("127.0.0.1", PORT, "pc-fixture", result)
    result.success()
    check((result.value as Map<*, *>)["transport"] == "grpc-lan")
    check(ModuleTestTransport.methods.none { it == "AcquireControl" || it == "Enable" || it == "WalkChecked" })
  } finally { local.destroy() }
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

private fun settledControlReentryIsNotBusy() {
  val bridge = Bridge()
  try {
    for (fails in listOf(false, true)) {
      var next: Result? = null
      val first = Result { next = bridge.controlRead() }
      if (fails) bridge.input(first).rejected("not_armed") else bridge.controlRead(first).success()
      checkNotNull(next).success()
    }
  } finally { bridge.destroy() }
}

private fun queuedInterruptKeepsItsBusyOwnership() {
  val bridge = Bridge()
  val firstEntered = CountDownLatch(1)
  val firstRelease = CountDownLatch(1)
  val interruptEntered = CountDownLatch(1)
  val interruptRelease = CountDownLatch(1)
  var replies = 0
  bridge.controlChannel.beforeReply = {
    if (++replies == 1) {
      firstEntered.countDown()
      check(firstRelease.await(3, TimeUnit.SECONDS))
    } else if (replies == 2) {
      interruptEntered.countDown()
      check(interruptRelease.await(3, TimeUnit.SECONDS))
    }
  }
  try {
    val first = bridge.controlRead()
    check(firstEntered.await(1, TimeUnit.SECONDS))
    bridge.session.javaClass.getDeclaredField("token").apply { isAccessible = true }.set(bridge.session, "fixture-lease")
    val interrupt = bridge.interrupt()
    firstRelease.countDown()
    first.rejected("cancelled")
    check(interruptEntered.await(1, TimeUnit.SECONDS))
    bridge.controlRead().rejected("busy")
    interruptRelease.countDown()
    interrupt.success()
    bridge.controlRead().success()
  } finally {
    firstRelease.countDown(); interruptRelease.countDown()
    bridge.destroy()
  }
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

private fun wifiSignalOnlyFromActiveWifi() {
  val module = BrainstemGrpcModule()
  val bridge = module.definition()
  val context = module.appContext.reactContext
  @Suppress("UNCHECKED_CAST")
  val read = bridge.functions["readWifiRssi"] as () -> Int?
  try {
    bridge.foreground()
    check(read() == -70)
    context.connectivity.capabilities.wifi = false
    check(read() == null)
    context.connectivity.capabilities.wifi = true
    (context.connectivity.capabilities.transportInfo as android.net.wifi.WifiInfo).rssi = -127
    context.wifi.connectionInfo.rssi = -127
    check(read() == null)
    context.connectivity.capabilities.transportInfo = null
    context.wifi.connectionInfo.rssi = -65
    check(read() == -65)
    context.denyNetworkState = true
    check(read() == null)
    context.denyNetworkState = false
    bridge.background()
    check(read() == null)
  } finally { bridge.destroy() }
}

private fun controlWifiLockLifecycle() {
  val bridge = Bridge()
  val acquire = BrainstemGrpcModule::class.java.getDeclaredMethod("acquireControlWifiLock").apply { isAccessible = true }
  try {
    acquire.invoke(bridge.module)
    val held = bridge.module.appContext.reactContext.wifi.lastLock!!
    check(held.isHeld)
    acquire.invoke(bridge.module)
    check(bridge.module.appContext.reactContext.wifi.lastLock === held)
    bridge.definition.background()
    (bridge.field("worker").get(bridge.module) as java.util.concurrent.ExecutorService).submit {}.get(2, TimeUnit.SECONDS)
    check(!held.isHeld)
  } finally { bridge.destroy() }
}

private fun newControlAndDiagnosticFunctionsUseControlExecutor() {
  ModuleTestTransport.methods.clear()
  val bridge = Bridge()
  try {
    val gestures = bridge.listGestures()
    gestures.success()
    check((gestures.value as Map<*, *>)["gestures"] is List<*>)
    val speed = bridge.getSpeedMode()
    speed.success()
    check((speed.value as Map<*, *>)["speedMode"] == "normal")
    val heightStatus = bridge.getBodyHeightStatus()
    heightStatus.success()
    check((heightStatus.value as Map<*, *>)["bodyHeight"] is Map<*, *>)
    val setHeight = bridge.setBodyHeight(0.375)
    setHeight.success()
    check((setHeight.value as Map<*, *>)["bodyHeight"] is Map<*, *>)
    bridge.setBodyHeight(Double.NaN).rejected("config")
    bridge.controlAction("clear-motor-fault").success()
    bridge.controlAction("set-zero").rejected("precondition")
    check(ModuleTestTransport.methods.containsAll(listOf("ListGestures", "GetSpeedMode", "GetBodyHeightStatus", "SetBodyHeight", "ClearMotorFault", "GetControlStatus")))
    check(!ModuleTestTransport.methods.contains("SetZero"))
  } finally { bridge.destroy() }
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
    "keep-screen-on-flags-and-lifecycle" to ::keepScreenOnFlagsAndLifecycle,
    "wifi-signal-active-network-permission-and-sentinel" to ::wifiSignalOnlyFromActiveWifi,
    "foreground-control-wifi-lock-releases-on-background" to ::controlWifiLockLifecycle,
    "same-peer-four-reads-and-rejections" to ::samePeerReads,
    "lan-private-ipv4-qa-and-transport-peer-guards" to ::lanEntryGuardsAndPeer,
    "slow-read-independent-control-executor" to ::slowReadDoesNotBlockControl,
    "settled-control-success-and-failure-admit-reentry" to ::settledControlReentryIsNotBusy,
    "queued-interrupt-keeps-busy-owner" to ::queuedInterruptKeepsItsBusyOwnership,
    "close-background-destroy-cancellation" to ::lifecycleCancelsReadAndPeer,
    "failed-open-clears-peer-without-bypassing-mtls" to ::failedOpenDoesNotLeavePeer,
    "factory-permission-target-generation-and-cancellation" to ::factoryPermissionAndLifecycle,
    "new-control-and-diagnostic-functions-use-control-executor" to ::newControlAndDiagnosticFunctionsUseControlExecutor)
  var failures = 0
  for ((name, run) in cases) try { run(); println("PASS: $name") }
    catch (error: Throwable) { failures++; System.err.println("FAIL: $name: ${error.message}") }
  check(failures == 0) { "$failures bridge behavior cases failed" }
}
