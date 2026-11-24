package expo.modules.brainstemgrpc

import android.security.KeyChain
import android.content.BroadcastReceiver
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.util.Base64
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import io.grpc.CallOptions
import io.grpc.ClientCall
import io.grpc.ManagedChannel
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.grpc.Status
import io.grpc.okhttp.OkHttpChannelBuilder
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.net.Inet6Address
import java.net.InetAddress
import java.net.Socket
import java.security.Principal
import java.security.PrivateKey
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject
import javax.net.SocketFactory
import javax.net.ssl.KeyManager
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.SSLEngine
import javax.net.ssl.X509ExtendedKeyManager

/** Android HTTP/2 gRPC with OS-selected identity and explicit foreground control sessions. */
class BrainstemGrpcModule : Module() {
  private val lock = Any()
  private val worker = Executors.newSingleThreadExecutor()
  // Read-only KeyChain/channel setup must not queue ahead of control input or stop work.
  private val readWorker = Executors.newSingleThreadExecutor()
  private val timer = Executors.newSingleThreadScheduledExecutor()
  private var destroyed = false
  private var paused = false
  private var hideControlNavigation = false
  private var keepScreenOn = false
  private var previousNavigationBehavior: Int? = null
  private var active: Read? = null
  private var picker: Promise? = null
  private data class IdentityChoice(val host: String, val port: Int, val alias: String?, val lanDev: Boolean = false)
  private var pickerResult: IdentityChoice? = null
  private var control: ControlSession? = null
  private var controlPeer: IdentityChoice? = null
  private var controlOpening: Promise? = null
  private var controlOperation: Any? = null
  private var controlGeneration = 0L
  private var controlWifiLock: WifiManager.WifiLock? = null
  // Session-only approval: JS cannot supply an arbitrary installed credential alias.
  private val approvedIdentities = mutableMapOf<String, String>()
  private var identityOperation: Promise? = null
  private var identityGeneration = 0L
  private var factoryBusy = false
  private data class FactoryTarget(val host: String, val port: Int, val robotId: String, val requestId: String)
  private data class FactoryApproval(val target: FactoryTarget, val generation: Long, val sha256: String)
  private var factoryTarget: FactoryTarget? = null
  private var factoryApproval: FactoryApproval? = null
  private var factoryReceiver: BroadcastReceiver? = null
  private var factoryExpiry: ScheduledFuture<*>? = null
  private var localIdentityStore: LocalClientIdentityStore? = null
  private var voiceSpeechPromise: Promise? = null
  private var voiceTts: TextToSpeech? = null
  private var voiceTtsReady = false
  private var pendingVoiceUtterance: Pair<String, Float>? = null
  private fun localStore(): LocalClientIdentityStore = synchronized(lock) {
    localIdentityStore ?: LocalClientIdentityStore(appContext.reactContext ?: throw ControlSession.Failure("identity_unavailable")).also { localIdentityStore = it }
  }

  private class Read(
    val id: String,
    val promise: Promise,
    val method: MethodDescriptor<ByteArray, ByteArray>,
    val parse: (ByteArray) -> Map<String, Any>
  ) {
    val finished = AtomicBoolean(false)
    val startedAt = SystemClock.elapsedRealtime()
    var timeout: ScheduledFuture<*>? = null
    var channel: ManagedChannel? = null
    var ownsChannel = true
    var call: ClientCall<ByteArray, ByteArray>? = null
  }

  override fun definition() = ModuleDefinition {
    Name("DosoBrainstemGrpc")
    Events("onBrainstemImu")
    Constants { mapOf("lanDevAvailable" to isLocalControlBuild()) }

    AsyncFunction("readWifiRssi") {
      runCatching {
        val context = appContext.reactContext ?: return@runCatching null
        if (paused || destroyed || !isForeground()) return@runCatching null
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = findWifiNetwork(manager) ?: return@runCatching null
        val capabilities = manager.getNetworkCapabilities(network) ?: return@runCatching null
        val info = if (Build.VERSION.SDK_INT >= 29) capabilities.transportInfo as? WifiInfo else null
        @Suppress("DEPRECATION")
        val rssi = (info ?: (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo).rssi
        rssi.takeIf { it in -126..-1 }
      }.getOrNull()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setControlNavigationHidden") { hidden: Boolean ->
      hideControlNavigation = hidden
      updateControlNavigation(hidden && !paused)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setKeepScreenOn") { enabled: Boolean ->
      keepScreenOn = enabled
      updateKeepScreenOn(enabled && !paused)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("isVoiceInputAvailable") {
      runCatching {
        val context = appContext.reactContext ?: return@runCatching false
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        context.packageManager.resolveActivity(intent, 0) != null
      }.getOrDefault(false)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("recognizeVoiceOnce") { promise: Promise ->
      val activity = appContext.currentActivity
      val context = appContext.reactContext
      if (synchronized(lock) { destroyed || paused || !isForeground() } || activity == null || context == null) {
        reject(promise, "background")
        return@AsyncFunction
      }
      synchronized(lock) {
        if (voiceSpeechPromise != null) {
          reject(promise, "busy")
          return@AsyncFunction
        }
        voiceSpeechPromise = promise
      }
      try {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        if (context.packageManager.resolveActivity(intent, 0) == null) {
          synchronized(lock) { voiceSpeechPromise = null }
          reject(promise, "unavailable")
          return@AsyncFunction
        }
        activity.startActivityForResult(intent, VOICE_SPEECH_REQUEST_CODE)
      } catch (_: Exception) {
        synchronized(lock) { voiceSpeechPromise = null }
        reject(promise, "unavailable")
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("speakVoiceText") { text: String, volume: Double ->
      val clean = text.trim().take(320)
      if (clean.isEmpty() || synchronized(lock) { destroyed || paused }) return@AsyncFunction false
      val context = appContext.reactContext ?: return@AsyncFunction false
      val clampedVolume = volume.toFloat().coerceIn(0f, 1f)
      if (clampedVolume <= 0f) return@AsyncFunction false
      val existing = voiceTts
      if (existing != null && voiceTtsReady) {
        val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, clampedVolume) }
        existing.speak(clean, TextToSpeech.QUEUE_FLUSH, params, "doso_voice_${SystemClock.elapsedRealtime()}")
        return@AsyncFunction true
      }
      pendingVoiceUtterance = clean to clampedVolume
      if (existing == null) {
        voiceTts = TextToSpeech(context.applicationContext) { status ->
          if (status == TextToSpeech.SUCCESS && !synchronized(lock) { destroyed }) {
            voiceTts?.setLanguage(Locale.SIMPLIFIED_CHINESE)
            voiceTtsReady = true
            pendingVoiceUtterance?.let { (utterance, vol) ->
              pendingVoiceUtterance = null
              val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, vol) }
              voiceTts?.speak(utterance, TextToSpeech.QUEUE_FLUSH, params, "doso_voice_init")
            }
          } else {
            pendingVoiceUtterance = null
          }
        }
      }
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopVoiceSpeech") {
      pendingVoiceUtterance = null
      runCatching { voiceTts?.stop() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getLocalClientIdentity") { host: String, port: Int, robotId: String, promise: Promise ->
      runIdentity(host, port, robotId, promise) { store, _ -> store.get(host, port, robotId) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("prepareLocalClientIdentity") { host: String, port: Int, robotId: String, requestId: String, promise: Promise ->
      runIdentity(host, port, robotId, promise, prepare = true) { store, _ -> store.prepare(host, port, robotId, requestId) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("completeLocalClientIdentity") { host: String, port: Int, robotId: String, requestId: String, promise: Promise ->
      if (synchronized(lock) { destroyed || paused || !isForeground() }) { reject(promise, "background"); return@AsyncFunction }
      val approval = synchronized(lock) { factoryApproval?.takeIf { it.target == FactoryTarget(host, port, robotId, requestId) && it.generation == identityGeneration } }
      if (approval == null) reject(promise, "unauthorized")
      else runIdentity(host, port, robotId, promise, approval = approval) { store, generation ->
        store.complete(host, port, robotId, requestId, approval.sha256) { commit -> synchronized(lock) {
          requireIdentityOperation(promise, generation)
          commit()
        } }
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("cancelLocalClientIdentity") {
      synchronized(lock) { retireIdentity("cancelled") }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("chooseClientIdentity") { host: String, port: Int, promise: Promise ->
      if (!validEndpoint(host, port)) {
        reject(promise, "config"); return@AsyncFunction
      }
      val activity = appContext.currentActivity
      synchronized(lock) {
        if (destroyed || paused || activity == null || !isForeground()) {
          reject(promise, "background"); return@synchronized
        }
        if (picker != null || active != null || control != null || controlOpening != null || identityOperation != null || factoryBusy) {
          reject(promise, "busy"); return@synchronized
        }
        picker = promise
        try {
          // No import/install intent and no suggested alias. Android presents existing identities.
          KeyChain.choosePrivateKeyAlias(activity, { alias ->
            synchronized(lock) {
              if (picker !== promise || destroyed) return@synchronized
              // KeyChain owns another Activity. Its callback may precede our Activity resume.
              pickerResult = IdentityChoice(host, port, alias)
              completePickerWhenForeground()
            }
          }, arrayOf("RSA", "EC"), null, host, port, null)
        } catch (_: Exception) {
          picker = null
          reject(promise, "identity_unavailable")
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("readStatus") { host: String, port: Int, alias: String?, requestId: String, promise: Promise ->
      beginRead(host, port, alias, requestId, promise, STATUS_METHOD) { bytes -> mapOf("status" to ControlStatusParser.parse(bytes)) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("readProfile") { host: String, port: Int, alias: String?, requestId: String, promise: Promise ->
      beginRead(host, port, alias, requestId, promise, PROFILE_METHOD) { bytes -> mapOf("profile" to ProfileInfoParser.parse(bytes)) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("readVoltage") { host: String, port: Int, alias: String?, requestId: String, promise: Promise ->
      beginRead(host, port, alias, requestId, promise, VOLTAGE_METHOD) { bytes -> mapOf("voltage" to VoltageParser.parse(bytes)) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("readMotorStatus") { host: String, port: Int, alias: String?, requestId: String, promise: Promise ->
      beginRead(host, port, alias, requestId, promise, MOTOR_STATUS_METHOD) { bytes -> MotorStatusParser.parse(bytes) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("readLanStatus") { host: String, port: Int, requestId: String, promise: Promise ->
      beginRead(host, port, null, requestId, promise, STATUS_METHOD, true) { bytes -> mapOf("status" to ControlStatusParser.parse(bytes)) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readLanProfile") { host: String, port: Int, requestId: String, promise: Promise ->
      beginRead(host, port, null, requestId, promise, PROFILE_METHOD, true) { bytes -> mapOf("profile" to ProfileInfoParser.parse(bytes)) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readLanVoltage") { host: String, port: Int, requestId: String, promise: Promise ->
      beginRead(host, port, null, requestId, promise, VOLTAGE_METHOD, true) { bytes -> mapOf("voltage" to VoltageParser.parse(bytes)) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readLanMotorStatus") { host: String, port: Int, requestId: String, promise: Promise ->
      beginRead(host, port, null, requestId, promise, MOTOR_STATUS_METHOD, true) { bytes -> MotorStatusParser.parse(bytes) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancelStatus") { requestId: String ->
      synchronized(lock) { active?.takeIf { it.id == requestId }?.let { finish(it, "cancelled") } }
    }

    AsyncFunction("openControl") { host: String, port: Int, alias: String, principal: String, requestId: String, promise: Promise ->
      openControl(host, port, alias, principal, requestId, promise)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("openLanControl") { host: String, port: Int, requestId: String, promise: Promise ->
      openControl(host, port, null, "lan-${UUID.randomUUID().toString().replace("-", "")}@dev", requestId, promise, true)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readControlStatus") { sessionId: String, promise: Promise ->
      runControl(sessionId, promise) { session, _ -> session.status() }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("controlAction") { sessionId: String, action: String, profileName: String?, promise: Promise ->
      runControl(sessionId, promise) { session, epoch -> session.action(action, profileName, epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("listGestures") { sessionId: String, promise: Promise ->
      runControl(sessionId, promise) { session, _ -> session.listGestures() }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("playGesture") { sessionId: String, gestureName: String, promise: Promise ->
      runControl(sessionId, promise) { session, epoch -> session.playGesture(gestureName, epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setZero") { sessionId: String, promise: Promise ->
      runControl(sessionId, promise) { session, epoch -> session.setZero(epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("clearMotorFault") { sessionId: String, jointIds: List<Int>?, promise: Promise ->
      runControl(sessionId, promise) { session, epoch -> session.clearMotorFault(jointIds, epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("getSpeedMode") { sessionId: String, promise: Promise ->
      runControl(sessionId, promise) { session, _ -> session.getSpeedMode() }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setSpeedMode") { sessionId: String, mode: String, promise: Promise ->
      runControl(sessionId, promise) { session, epoch -> session.setSpeedMode(mode, epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("getBodyHeightStatus") { sessionId: String, promise: Promise ->
      runControl(sessionId, promise) { session, _ -> session.getBodyHeightStatus() }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setBodyHeight") { sessionId: String, heightM: Double, promise: Promise ->
      runControl(sessionId, promise) { session, epoch -> session.setBodyHeight(heightM, epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("acquireControl") { sessionId: String, promise: Promise ->
      runControl(sessionId, promise) { session, epoch -> session.acquire(epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("sendControlInput") { sessionId: String, x: Double, y: Double, yaw: Double, promise: Promise ->
      val receivedAt = SystemClock.elapsedRealtime()
      runControl(sessionId, promise) { session, epoch -> session.input(x, y, yaw, receivedAt, epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("sendControlInputAt") { sessionId: String, x: Double, y: Double, yaw: Double, sampledAt: Long, promise: Promise ->
      // G20's original Android monotonic timestamp survives both bridge queues.
      runControl(sessionId, promise) { session, epoch -> session.input(x, y, yaw, sampledAt, epoch) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("interruptControl") { sessionId: String, promise: Promise ->
      val selected = synchronized(lock) { control?.takeIf { it.id == sessionId } }
      selected?.haltImmediately()
      // An interrupt is queued even when a normal RPC is in flight; authority is already retired.
      runControl(sessionId, promise, allowBusy = true) { session, _ -> session.interrupt() }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readRecoveryStatus") { sessionId: String, promise: Promise ->
      runControl(sessionId, promise) { session, _ -> session.recovery("status") }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("recoveryCommand") { sessionId: String, command: String, promise: Promise ->
      runControl(sessionId, promise) { session, _ -> session.recovery(command) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setRecoveryHeartbeat") { sessionId: String, enabled: Boolean ->
      synchronized(lock) { control?.takeIf { it.id == sessionId }?.setRecoveryHeartbeat(enabled) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("startListenImu") { sessionId: String, promise: Promise ->
      val selected = synchronized(lock) {
        control?.takeIf { it.id == sessionId && !destroyed && !paused && isForeground() }
      }
      if (selected == null) { reject(promise, "cancelled"); return@AsyncFunction }
      try {
        selected.startImu { sample ->
          if (synchronized(lock) { destroyed || control !== selected }) return@startImu
          imuEvent(sessionId, sample)?.let { sendEvent("onBrainstemImu", it) }
        }
        promise.resolve(null)
      } catch (error: Exception) {
        reject(promise, (error as? ControlSession.Failure)?.code ?: "unavailable")
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stopListenImu") { sessionId: String ->
      synchronized(lock) { control?.takeIf { it.id == sessionId }?.stopImu() }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("closeControl") { sessionId: String ->
      synchronized(lock) {
        control?.takeIf { it.id == sessionId }?.let {
          active?.let { read -> finish(read, "cancelled") }
          control = null; controlPeer = null; controlGeneration++; it.haltImmediately(); closeRetiredControl(it)
        }
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersForeground {
      synchronized(lock) {
        paused = false
        completePickerWhenForeground()
      }
      appContext.currentActivity?.runOnUiThread {
        updateControlNavigation(hideControlNavigation)
        updateKeepScreenOn(keepScreenOn)
      }
    }
    OnActivityResult { _, payload ->
      if (payload.requestCode == VOICE_SPEECH_REQUEST_CODE) {
        val pending = synchronized(lock) { voiceSpeechPromise.also { voiceSpeechPromise = null } }
        if (pending != null) {
          if (payload.resultCode == android.app.Activity.RESULT_OK) {
            val matches = payload.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            pending.resolve(matches?.firstOrNull()?.trim() ?: "")
          } else {
            pending.resolve("")
          }
        }
      }
    }
    OnActivityEntersBackground {
      synchronized(lock) {
        paused = true
        retireIdentity("background")
        active?.let { finish(it, "background") }
        retireControl("background")
      }
      pendingVoiceUtterance = null
      runCatching { voiceTts?.stop() }
      appContext.currentActivity?.runOnUiThread {
        updateControlNavigation(false)
        updateKeepScreenOn(false)
      }
    }
    OnDestroy {
      synchronized(lock) {
        destroyed = true
        retireIdentity("cancelled")
        active?.let { finish(it, "cancelled") }
        picker?.let { reject(it, "cancelled") }
        picker = null
        pickerResult = null
        voiceSpeechPromise?.let { reject(it, "cancelled") }
        voiceSpeechPromise = null
        approvedIdentities.clear()
        retireControl("cancelled")
        worker.shutdown()
        readWorker.shutdownNow()
        timer.shutdownNow()
      }
      pendingVoiceUtterance = null
      voiceTtsReady = false
      runCatching { voiceTts?.stop(); voiceTts?.shutdown() }
      voiceTts = null
      hideControlNavigation = false
      keepScreenOn = false
      appContext.currentActivity?.runOnUiThread {
        updateControlNavigation(false)
        updateKeepScreenOn(false)
      }
    }
  }

  private fun updateKeepScreenOn(enabled: Boolean) {
    runCatching {
      val window = appContext.currentActivity?.window ?: return
      if (enabled && !destroyed) {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      } else {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }

  private fun updateControlNavigation(hidden: Boolean): Double {
    // Older Android keeps visible navigation; the measured layout still reserves its insets.
    if (Build.VERSION.SDK_INT < 30) return 0.0
    val activity = appContext.currentActivity ?: return 0.0
    val window = activity.window
    val type = WindowInsets.Type.navigationBars()
    val stableBottom = window.decorView.rootWindowInsets?.getInsetsIgnoringVisibility(type)?.bottom ?: 0
    window.insetsController?.let { controller ->
      if (hidden) {
        if (previousNavigationBehavior == null) previousNavigationBehavior = controller.systemBarsBehavior
        controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(type)
      } else {
        controller.show(type)
        previousNavigationBehavior?.let { controller.systemBarsBehavior = it }
        previousNavigationBehavior = null
      }
    }
    return stableBottom.toDouble() / activity.resources.displayMetrics.density
  }

  private fun requireIdentityOperation(promise: Promise, generation: Long) {
    if (destroyed || paused || !isForeground()) throw ControlSession.Failure("background")
    if (identityOperation !== promise || identityGeneration != generation) throw ControlSession.Failure("cancelled")
  }

  private fun runIdentity(host: String, port: Int, robotId: String, promise: Promise, prepare: Boolean = false,
    approval: FactoryApproval? = null,
    action: (LocalClientIdentityStore, Long) -> Map<String, Any>?) {
    if (!validEndpoint(host, port) || !robotId.matches(Regex("[A-Za-z0-9][A-Za-z0-9_-]{0,63}"))) { reject(promise, "config"); return }
    synchronized(lock) {
      if (destroyed || paused || !isForeground()) { reject(promise, "background"); return }
      if (identityOperation != null || factoryBusy || picker != null || active != null || control != null || controlOpening != null) { reject(promise, "busy"); return }
      if (approval != null && (factoryApproval !== approval || factoryTarget != approval.target || identityGeneration != approval.generation)) { reject(promise, "unauthorized"); return }
      unregisterFactory()
      val generation = ++identityGeneration
      identityOperation = promise
      val timeout = timer.schedule({ synchronized(lock) {
        if (identityOperation === promise && identityGeneration == generation) retireIdentity("identity_timeout")
      } }, 10_000, TimeUnit.MILLISECONDS)
      readWorker.execute {
        try {
          synchronized(lock) { requireIdentityOperation(promise, generation) }
          val value = action(localStore(), generation)
          synchronized(lock) {
            requireIdentityOperation(promise, generation)
            if (value?.get("status") == "ready") approvedIdentities[endpointKey(host, port)] = value.getValue("identityAlias") as String
            if (prepare && value?.get("status") == "pending") registerFactory(FactoryTarget(host, port, robotId, value.getValue("requestId") as String), generation)
            identityOperation = null
            promise.resolve(value)
          }
        } catch (error: Exception) { synchronized(lock) {
          if (identityOperation === promise && identityGeneration == generation) {
            identityOperation = null
            reject(promise, (error as? ControlSession.Failure)?.code ?: "identity_unavailable")
          }
        } } finally { timeout.cancel(false) }
      }
    }
  }

  private fun unregisterFactory() {
    factoryExpiry?.cancel(false); factoryExpiry = null
    factoryReceiver?.let { receiver -> runCatching { appContext.reactContext?.unregisterReceiver(receiver) } }
    factoryReceiver = null; factoryTarget = null; factoryApproval = null
  }

  private fun retireIdentity(reason: String) {
    identityGeneration++
    identityOperation?.let { reject(it, reason) }; identityOperation = null
    unregisterFactory()
  }

  private fun factoryResult(value: JSONObject) = "BRAINSTEM_FACTORY_V1:" + Base64.encodeToString(value.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)

  private fun registerFactory(target: FactoryTarget, generation: Long) {
    val context = appContext.reactContext ?: throw ControlSession.Failure("identity_unavailable")
    val action = context.packageName + ".BRAINSTEM_FACTORY"
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(receivedContext: Context, intent: Intent) {
        if (!isOrderedBroadcast || intent.action != action || intent.`package` != context.packageName) return
        val pending = goAsync()
        synchronized(lock) {
          val providedRequestId = intent.getStringExtra("requestId")
          val requestMatches = providedRequestId == target.requestId || providedRequestId == null && intent.getStringExtra("operation") == "export"
          if (destroyed || paused || !isForeground() || factoryTarget != target || identityGeneration != generation
              || !requestMatches) {
            pending.resultCode = 0; pending.resultData = factoryResult(JSONObject().put("ok", false).put("code", "cancelled")); pending.finish(); return
          }
          if (factoryBusy || identityOperation != null || picker != null || active != null || control != null || controlOpening != null) {
            pending.resultCode = 0; pending.resultData = factoryResult(JSONObject().put("ok", false).put("code", "busy")); pending.finish(); return
          }
          factoryBusy = true
          readWorker.execute {
            try {
              val value = synchronized(lock) {
                if (destroyed || paused || !isForeground() || factoryTarget != target || identityGeneration != generation) throw ControlSession.Failure("cancelled")
                val store = localStore()
                val record = store.get(target.host, target.port, target.robotId) ?: throw ControlSession.Failure("identity_unavailable")
                if (record["status"] != "pending" || record["requestId"] != target.requestId) throw ControlSession.Failure("cancelled")
                when (intent.getStringExtra("operation")) {
                  "export" -> JSONObject().put("ok", true).put("request", JSONObject(record))
                  "approve" -> {
                    val encoded = intent.getStringExtra("approvalBase64") ?: throw ControlSession.Failure("config")
                    if (encoded.length > 87_384 || !encoded.matches(Regex("[A-Za-z0-9+/]+={0,2}"))) throw ControlSession.Failure("config")
                    val bytes = Base64.decode(encoded, Base64.NO_WRAP)
                    if (bytes.size > LocalIdentityCrypto.MAX_BYTES) throw ControlSession.Failure("config")
                    val digest = store.acceptFactoryApproval(target.host, target.port, target.robotId, target.requestId, bytes.toString(Charsets.UTF_8))
                    factoryApproval = FactoryApproval(target, generation, digest)
                    JSONObject().put("ok", true).put("requestId", target.requestId).put("stage", "approval_received")
                  }
                  else -> throw ControlSession.Failure("config")
                }
              }
              pending.resultCode = -1; pending.resultData = factoryResult(value)
            } catch (error: Exception) {
              pending.resultCode = 0
              pending.resultData = factoryResult(JSONObject().put("ok", false).put("code", (error as? ControlSession.Failure)?.code ?: "identity_unavailable"))
            } finally { synchronized(lock) { factoryBusy = false }; pending.finish() }
          }
        }
      }
    }
    // Signature/privileged sender permission keeps ordinary apps out of the USB factory channel.
    if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, IntentFilter(action), "android.permission.MANAGE_DEBUGGING", null, Context.RECEIVER_EXPORTED)
    else context.registerReceiver(receiver, IntentFilter(action), "android.permission.MANAGE_DEBUGGING", null)
    factoryReceiver = receiver; factoryTarget = target
    factoryExpiry = timer.schedule({ synchronized(lock) {
      if (factoryTarget == target && identityGeneration == generation) unregisterFactory()
    } }, 5, TimeUnit.MINUTES)
  }

  private fun beginRead(
    host: String,
    port: Int,
    alias: String?,
    requestId: String,
    promise: Promise,
    method: MethodDescriptor<ByteArray, ByteArray>,
    lanDev: Boolean = false,
    parse: (ByteArray) -> Map<String, Any>
  ) {
      if (!validEndpoint(host, port) || lanDev && (!validLanEndpoint(host, port) || alias != null) || !requestId.matches(Regex("[A-Za-z0-9_-]{1,80}"))) {
        reject(promise, "config"); return
      }
      synchronized(lock) {
        if (destroyed || paused || !isForeground()) {
          reject(promise, "background"); return@synchronized
        }
        if (active != null || picker != null || controlOpening != null || identityOperation != null || factoryBusy
            || control != null && controlPeer != IdentityChoice(host, port, alias, lanDev)) {
          reject(promise, "busy"); return@synchronized
        }
        if (alias != null && (alias.length !in 1..512 || approvedIdentities[endpointKey(host, port)] != alias)) {
          reject(promise, "identity_unavailable"); return@synchronized
        }
        val read = Read(requestId, promise, method, parse)
        active = read
        // Includes KeyChain lookup/channel setup, in addition to gRPC's own outbound deadline.
        read.timeout = timer.schedule({ finish(read, "timeout") }, DEADLINE_MS, TimeUnit.MILLISECONDS)
        readWorker.execute { performRead(read, host, port, alias, lanDev) }
      }
  }

  private fun isForeground(): Boolean =
    (appContext.currentActivity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true

  private fun findWifiNetwork(connectivity: ConnectivityManager): Network? {
    val active = connectivity.activeNetwork
    if (active != null && connectivity.getNetworkCapabilities(active)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
      return active
    }
    @Suppress("DEPRECATION")
    return connectivity.allNetworks.firstOrNull { candidate ->
      connectivity.getNetworkCapabilities(candidate)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    }
  }

  private fun isPrivateWifiTarget(host: String): Boolean {
    if (!host.matches(Regex("[0-9.]+"))) return false
    val bytes = host.split('.').mapNotNull { it.toIntOrNull() }
    if (bytes.size != 4 || bytes.any { it !in 0..255 }) return false
    return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] in 16..31) || (bytes[0] == 192 && bytes[1] == 168)
  }

  private class LowLatencySocketFactory(
    private val delegate: SocketFactory,
    private val trafficClassTos: Int = DSCP_EF_TOS,
  ) : SocketFactory() {
    private fun tune(socket: Socket): Socket {
      runCatching { socket.tcpNoDelay = true }
      runCatching { socket.trafficClass = trafficClassTos }
      return socket
    }
    override fun createSocket(): Socket = tune(delegate.createSocket())
    override fun createSocket(host: String?, port: Int): Socket = tune(delegate.createSocket(host, port))
    override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket =
      tune(delegate.createSocket(host, port, localHost, localPort))
    override fun createSocket(host: InetAddress?, port: Int): Socket = tune(delegate.createSocket(host, port))
    override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket =
      tune(delegate.createSocket(address, port, localAddress, localPort))
  }

  private fun lowLatencySocketFactory(host: String): SocketFactory {
    val base = runCatching {
      if (!isPrivateWifiTarget(host)) return@runCatching SocketFactory.getDefault()
      val context = appContext.reactContext ?: return@runCatching SocketFactory.getDefault()
      val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      findWifiNetwork(connectivity)?.socketFactory ?: SocketFactory.getDefault()
    }.getOrDefault(SocketFactory.getDefault())
    return LowLatencySocketFactory(base)
  }

  private fun acquireControlWifiLock() {
    if (controlWifiLock != null) return
    runCatching {
      val context = appContext.reactContext ?: return
      val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val hasWifiTransport = findWifiNetwork(connectivity) != null
      @Suppress("DEPRECATION")
      if (!hasWifiTransport && !wifi.isWifiEnabled) return
      @Suppress("DEPRECATION")
      val mode = if (Build.VERSION.SDK_INT >= 29) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF
      @Suppress("DEPRECATION")
      val held = wifi.createWifiLock(mode, "DOSO:foreground-control")
      held.setReferenceCounted(false)
      held.acquire()
      controlWifiLock = held
    }
  }

  private fun releaseControlWifiLock() {
    val held = controlWifiLock
    controlWifiLock = null
    runCatching { if (held?.isHeld == true) held.release() }
  }

  private fun closeRetiredControl(session: ControlSession) {
    // Keep the radio awake until the final stop/release attempt has completed.
    worker.execute {
      try { session.close() }
      finally { synchronized(lock) { if (control == null && controlOpening == null) releaseControlWifiLock() } }
    }
  }

  private fun openControl(host: String, port: Int, alias: String?, principal: String, requestId: String, promise: Promise, lanDev: Boolean = false) {
    if (!validEndpoint(host, port) || !principal.matches(Regex("[a-z][a-z0-9-]{0,63}@[a-z][a-z0-9-]{0,63}"))
        || lanDev && (!validLanEndpoint(host, port) || alias != null)
        || !requestId.matches(Regex("[A-Za-z0-9_-]{1,80}"))) { reject(promise, "config"); return }
    synchronized(lock) {
      if (destroyed || paused || !isForeground()) { reject(promise, "background"); return }
      if (control != null || controlOpening != null || active != null || picker != null || identityOperation != null || factoryBusy) { reject(promise, "busy"); return }
      if (!lanDev && (alias == null || approvedIdentities[endpointKey(host, port)] != alias)) { reject(promise, "identity_unavailable"); return }
      controlPeer = null
      controlOpening = promise
      acquireControlWifiLock()
      val generation = ++controlGeneration
      val timeout = timer.schedule({ synchronized(lock) {
        if (controlOpening === promise) { controlOpening = null; controlPeer = null; controlGeneration++; releaseControlWifiLock(); reject(promise, "timeout") }
      } }, DEADLINE_MS, TimeUnit.MILLISECONDS)
      worker.execute {
        var candidate: ControlSession? = null
        try {
          val tls = if (lanDev) null else selectedIdentityTls(host, port, alias!!)
          val builder = OkHttpChannelBuilder.forAddress(host, port)
            .socketFactory(lowLatencySocketFactory(host))
          if (lanDev) builder.usePlaintext() else builder.useTransportSecurity().sslSocketFactory(tls!!.context.socketFactory)
          val channel = builder.maxInboundMessageSize(ControlStatusParser.MAX_BYTES)
            .maxInboundMetadataSize(8192).disableRetry().build()
          candidate = ControlSession(channel, principal, lanDev) { cleanup -> if (!worker.isShutdown) worker.execute(cleanup) }
          val value = candidate.initialStatus()
          // A public status response from server-only TLS is not a mutually authenticated session.
          if (!lanDev && !tls!!.identity.requested.get()) throw ControlSession.Failure("unauthorized")
          synchronized(lock) {
            if (controlOpening !== promise || generation != controlGeneration || destroyed || paused || !isForeground()) {
              candidate.close(); return@synchronized
            }
            controlOpening = null; control = candidate; controlPeer = IdentityChoice(host, port, alias, lanDev)
            promise.resolve(value + mapOf("requestId" to requestId, "transport" to if (lanDev) "grpc-lan" else "grpc-mtls",
              "clientIdentitySelected" to !lanDev, "mutualTlsVerified" to !lanDev) +
              if (lanDev) mapOf("sessionPrincipal" to principal) else emptyMap())
          }
        } catch (error: Exception) {
          candidate?.close()
          synchronized(lock) { if (controlOpening === promise) {
            controlOpening = null; controlPeer = null; releaseControlWifiLock()
            reject(promise, (error as? ControlSession.Failure)?.code ?: "unavailable")
          } }
        } finally { timeout.cancel(false) }
      }
    }
  }

  private fun runControl(sessionId: String, promise: Promise, allowBusy: Boolean = false, operation: (ControlSession, Long) -> Map<String, Any>) {
    synchronized(lock) {
      val selected = control
      if (destroyed || paused || !isForeground()) { reject(promise, "background"); return }
      if (selected == null || selected.id != sessionId) { reject(promise, "cancelled"); return }
      if (controlOperation != null && !allowBusy) { reject(promise, "busy"); return }
      // Bind at the bridge boundary, before work is queued. Cancellation cannot
      // authorize an old queued action by letting it capture the new epoch later.
      val expectedEpoch = selected.captureEpoch()
      val owner = Any()
      controlOperation = owner
      worker.execute {
        var value: Map<String, Any>? = null
        var failure: String? = null
        try {
          synchronized(lock) { if (control !== selected || paused || destroyed) throw ControlSession.Failure("cancelled") }
          if (!allowBusy) selected.requireEpoch(expectedEpoch)
          value = operation(selected, expectedEpoch)
        } catch (error: Exception) {
          failure = (error as? ControlSession.Failure)?.code ?: "invalid_response"
        } finally {
          // Retire only this work before Promise continuations can submit the next request.
          synchronized(lock) { if (controlOperation === owner) controlOperation = null }
        }
        synchronized(lock) {
          if (failure != null) reject(promise, failure)
          else if (control === selected && !paused && !destroyed && isForeground()
              && (allowBusy || selected.captureEpoch() == expectedEpoch)) promise.resolve(value)
          else reject(promise, "cancelled")
        }
      }
    }
  }

  // Called under lock. Background never automatically restores the session on resume.
  private fun retireControl(reason: String) {
    controlGeneration++
    controlOpening?.let { reject(it, reason) }; controlOpening = null
    val selected = control
    selected?.haltImmediately()
    control = null
    controlPeer = null
    controlOperation = null
    if (selected != null) closeRetiredControl(selected) else releaseControlWifiLock()
  }

  /** Trust an explicitly selected complete private chain only in this channel, never globally. */
  private data class SelectedTls(val context: SSLContext, val identity: SelectedIdentity)

  private fun selectedIdentityTls(host: String, port: Int, alias: String): SelectedTls {
    val context = appContext.reactContext ?: throw ControlSession.Failure("identity_unavailable")
    val local = if (alias.startsWith("local:")) localStore().identity(host, port, alias) else null
    val key = local?.first ?: KeyChain.getPrivateKey(context, alias) ?: throw ControlSession.Failure("identity_unavailable")
    val chain = local?.second ?: KeyChain.getCertificateChain(context, alias)
    if (chain.isNullOrEmpty()) throw ControlSession.Failure("identity_unavailable")
    chain.forEach { it.checkValidity() }
    for (index in 0 until chain.size - 1) {
      if (chain[index].issuerX500Principal != chain[index + 1].subjectX500Principal || chain[index + 1].basicConstraints < 0) throw ControlSession.Failure("identity_unavailable")
      chain[index].verify(chain[index + 1].publicKey)
    }
    val root = chain.last()
    val managers = if (root.basicConstraints >= 0 && root.subjectX500Principal == root.issuerX500Principal) {
      root.verify(root.publicKey)
      if (root.keyUsage != null && (root.keyUsage.size <= 5 || !root.keyUsage[5])) throw ControlSession.Failure("identity_unavailable")
      val store = KeyStore.getInstance(KeyStore.getDefaultType()); store.load(null, null)
      store.setCertificateEntry("selected-brainstem-root", root)
      TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }.trustManagers
    } else null
    val identity = SelectedIdentity(alias, key, chain)
    return SelectedTls(SSLContext.getInstance("TLS").apply { init(arrayOf<KeyManager>(identity), managers, null) }, identity)
  }

  // Called under lock. Resuming never chooses an identity; it only delivers the explicit OS result.
  private fun completePickerWhenForeground() {
    if (destroyed || paused || !isForeground()) return
    val result = pickerResult ?: return
    val promise = picker ?: return
    pickerResult = null
    picker = null
    val alias = result.alias
    if (alias != null && alias.length in 1..512) {
      approvedIdentities[endpointKey(result.host, result.port)] = alias
      promise.resolve(alias)
    } else promise.resolve(null)
  }

  private fun performRead(read: Read, host: String, port: Int, alias: String?, lanDev: Boolean = false) {
    try {
      if (read.finished.get()) return
      val selectedTls = alias?.let { selectedIdentityTls(host, port, it) }
      val tls = if (lanDev) null else if (selectedTls == null) SSLContext.getInstance("TLS").apply {
        // No selected identity: platform server trust and no automatic client credential.
        init(emptyArray<KeyManager>(), null, null)
      } else selectedTls.context
      if (read.finished.get()) return
      val sharedChannel = if (lanDev) synchronized(lock) {
        control?.takeIf { !destroyed && !paused && controlPeer == IdentityChoice(host, port, alias, true) }?.channel
      } else null
      val channel = if (sharedChannel != null) {
        read.ownsChannel = false
        sharedChannel
      } else {
        val builder = OkHttpChannelBuilder.forAddress(host, port)
          .socketFactory(lowLatencySocketFactory(host))
        if (lanDev) builder.usePlaintext() else builder.useTransportSecurity().sslSocketFactory(tls!!.socketFactory)
        builder.maxInboundMessageSize(ControlStatusParser.MAX_BYTES)
          .maxInboundMetadataSize(8192)
          .disableRetry()
          .build()
      }
      synchronized(lock) {
        if (read.finished.get() || active !== read || destroyed || paused) {
          if (read.ownsChannel) channel.shutdownNow(); return
        }
        read.channel = channel
        val remaining = DEADLINE_MS - (SystemClock.elapsedRealtime() - read.startedAt)
        if (remaining <= 0) { finish(read, "timeout"); return }
        val call = channel.newCall(read.method, CallOptions.DEFAULT.withDeadlineAfter(remaining, TimeUnit.MILLISECONDS))
        read.call = call
        var response: ByteArray? = null
        call.start(object : ClientCall.Listener<ByteArray>() {
          override fun onMessage(message: ByteArray) {
            synchronized(lock) {
              if (read.finished.get()) return
              if (response != null) { finish(read, "invalid_response"); return }
              response = message
            }
          }
          override fun onClose(status: Status, trailers: Metadata) {
            if (read.finished.get()) return
            if (!status.isOk) { finish(read, safeGrpcCode(status)); return }
            try {
              if (selectedTls != null && !selectedTls.identity.requested.get()) { finish(read, "unauthorized"); return }
              val body = response ?: run { finish(read, "invalid_response"); return }
              val projected = read.parse(body)
              val authentication = if (lanDev) mapOf("transport" to "grpc-lan", "mutualTlsVerified" to false, "clientIdentitySelected" to false)
                else if (selectedTls == null) mapOf("mutualTlsVerified" to false) else mapOf(
                "mutualTlsVerified" to true, "clientCertificateSha256" to selectedTls.identity.certificateSha256())
              finish(read, null, mapOf("requestId" to read.id) + projected + authentication)
            } catch (_: Exception) { finish(read, "invalid_response") }
          }
        }, Metadata())
        call.request(2) // Detect a server incorrectly returning multiple messages for a unary call.
        call.sendMessage(byteArrayOf()) // google.protobuf.Empty has a zero-byte protobuf payload.
        call.halfClose()
      }
    } catch (_: Exception) {
      finish(read, "unavailable") // Never bridge TLS/server errors, host details or certificate data.
    }
  }

  private fun finish(read: Read, code: String?, value: Map<String, Any>? = null) {
    synchronized(lock) {
      if (!read.finished.compareAndSet(false, true)) return
      if (active === read) active = null
      read.timeout?.cancel(false)
      read.call?.cancel("Status read finished", null)
      if (read.ownsChannel) read.channel?.shutdownNow()
      if (code != null) reject(read.promise, code)
      else if (destroyed || paused || !isForeground()) reject(read.promise, "background")
      else read.promise.resolve(value)
    }
  }

  private fun safeGrpcCode(status: Status): String = when (status.code) {
    Status.Code.UNIMPLEMENTED -> "unimplemented"
    Status.Code.DEADLINE_EXCEEDED -> "timeout"
    Status.Code.CANCELLED -> "cancelled"
    Status.Code.UNAUTHENTICATED, Status.Code.PERMISSION_DENIED -> "unauthorized"
    Status.Code.RESOURCE_EXHAUSTED, Status.Code.INTERNAL, Status.Code.DATA_LOSS -> "invalid_response"
    else -> "unavailable"
  }

  private fun reject(promise: Promise, code: String) {
    promise.reject(code, "Brainstem status read failed ($code)", null)
  }

  private fun endpointKey(host: String, port: Int) = "$host|$port"

  private fun isLocalControlBuild(): Boolean {
    val context = appContext.reactContext ?: return false
    return context.packageName == "com.doso.robot.qa" ||
      (context.packageName == "com.doso.robot.dev" || context.packageName == "com.doso.robot.localtest")
      && context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  }

  private fun validLanEndpoint(host: String, port: Int): Boolean {
    if (!isLocalControlBuild() || !validEndpoint(host, port)
        || !host.matches(Regex("[0-9.]+"))) return false
    val bytes = host.split('.').map { it.toInt() }
    // Exact loopback supports a USB-reversed PC fixture without exposing a LAN listener.
    return host == "127.0.0.1" || bytes[0] == 10 || bytes[0] == 172 && bytes[1] in 16..31 || bytes[0] == 192 && bytes[1] == 168
  }

  private fun validEndpoint(host: String, port: Int): Boolean {
    if (port !in 1..65535 || host.length !in 1..253 || host != host.trim()) return false
    if (host.contains(':')) {
      if (!host.matches(Regex("[0-9a-fA-F:.]+"))) return false
      return try { InetAddress.getByName(host) is Inet6Address } catch (_: Exception) { false }
    }
    if (host.matches(Regex("[0-9.]+"))) {
      val parts = host.split('.')
      return parts.size == 4 && parts.all { it.matches(Regex("0|[1-9][0-9]{0,2}")) && it.toInt() <= 255 }
    }
    return host.split('.').all { it.length in 1..63 && it.matches(Regex("[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?")) }
  }

  /** PrivateKey is an OS-backed handle. It is never encoded, serialized, logged or sent to JS. */
  private class SelectedIdentity(
    private val alias: String,
    private val key: PrivateKey,
    private val chain: Array<X509Certificate>
  ) : X509ExtendedKeyManager() {
    val requested = AtomicBoolean(false)
    fun certificateSha256(): String = LocalIdentityCrypto.sha256(chain.first().encoded)
    private fun suitable(keyTypes: Array<out String>?, issuers: Array<out Principal>?): Boolean =
      keyTypes?.any { it.equals(key.algorithm, ignoreCase = true) } == true &&
        (issuers.isNullOrEmpty() || chain.any { cert -> issuers.any { it == cert.issuerX500Principal } })
    private fun choose(keyTypes: Array<out String>?, issuers: Array<out Principal>?): String? =
      if (suitable(keyTypes, issuers)) { requested.set(true); alias } else null
    override fun chooseClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, socket: Socket?): String? =
      choose(keyType, issuers)
    override fun chooseEngineClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, engine: SSLEngine?): String? =
      choose(keyType, issuers)
    override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? =
      if (keyType != null && suitable(arrayOf(keyType), issuers)) arrayOf(alias) else null
    override fun getCertificateChain(requested: String?): Array<X509Certificate>? = if (requested == alias) chain.clone() else null
    override fun getPrivateKey(requested: String?): PrivateKey? = if (requested == alias) key else null
    override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null
    override fun chooseServerAlias(keyType: String?, issuers: Array<out Principal>?, socket: Socket?): String? = null
  }

  private fun imuEvent(sessionId: String, sample: Map<String, Any>): Map<String, Any>? {
    val gyro = sample["gyroscope"] as? Map<*, *> ?: return null
    val quat = sample["quaternion"] as? Map<*, *> ?: return null
    val gyroX = gyro["x"] ?: return null
    val gyroY = gyro["y"] ?: return null
    val gyroZ = gyro["z"] ?: return null
    val quatW = quat["w"] ?: return null
    val quatX = quat["x"] ?: return null
    val quatY = quat["y"] ?: return null
    val quatZ = quat["z"] ?: return null
    val event = linkedMapOf<String, Any>(
      "sessionId" to sessionId,
      "gyroX" to gyroX, "gyroY" to gyroY, "gyroZ" to gyroZ,
      "quatW" to quatW, "quatX" to quatX, "quatY" to quatY, "quatZ" to quatZ,
    )
    val accel = sample["linearAcceleration"] as? Map<*, *>
    if (accel != null) {
      val accelX = accel["x"] ?: return null
      val accelY = accel["y"] ?: return null
      val accelZ = accel["z"] ?: return null
      event["accelX"] = accelX
      event["accelY"] = accelY
      event["accelZ"] = accelZ
    }
    val timestamp = sample["timestampMs"]
    if (timestamp is Number) event["timestampMs"] = timestamp.toLong()
    return event
  }

  companion object {
    private const val DEADLINE_MS = 3000L
    private const val VOICE_SPEECH_REQUEST_CODE = 13149
    // DSCP EF (46 << 2 = 0xB8) maps to WMM AC_VO hardware queue matching the robot AP EDCA policy.
    private const val DSCP_EF_TOS = 0xB8
    private val STATUS_METHOD: MethodDescriptor<ByteArray, ByteArray> = MethodDescriptor.newBuilder<ByteArray, ByteArray>()
      .setType(MethodDescriptor.MethodType.UNARY)
      .setFullMethodName("brainstem.api.v1.RobotControl/GetControlStatus")
      .setRequestMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(byteArrayOf())
        override fun parse(stream: InputStream): ByteArray = throw UnsupportedOperationException()
      })
      .setResponseMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = throw UnsupportedOperationException()
        override fun parse(stream: InputStream): ByteArray = ControlStatusParser.readBounded(stream)
      })
      .build()
    private val PROFILE_METHOD: MethodDescriptor<ByteArray, ByteArray> = MethodDescriptor.newBuilder<ByteArray, ByteArray>()
      .setType(MethodDescriptor.MethodType.UNARY)
      .setFullMethodName("brainstem.api.v1.RobotControl/GetProfile")
      .setRequestMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(byteArrayOf())
        override fun parse(stream: InputStream): ByteArray = throw UnsupportedOperationException()
      })
      .setResponseMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = throw UnsupportedOperationException()
        override fun parse(stream: InputStream): ByteArray = ProfileInfoParser.readBounded(stream)
      })
      .build()
    private val VOLTAGE_METHOD: MethodDescriptor<ByteArray, ByteArray> = MethodDescriptor.newBuilder<ByteArray, ByteArray>()
      .setType(MethodDescriptor.MethodType.UNARY)
      .setFullMethodName("brainstem.api.v1.RobotControl/GetVoltage")
      .setRequestMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(byteArrayOf())
        override fun parse(stream: InputStream): ByteArray = throw UnsupportedOperationException()
      })
      .setResponseMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = throw UnsupportedOperationException()
        override fun parse(stream: InputStream): ByteArray = VoltageParser.readBounded(stream)
      })
      .build()
    private val MOTOR_STATUS_METHOD: MethodDescriptor<ByteArray, ByteArray> = MethodDescriptor.newBuilder<ByteArray, ByteArray>()
      .setType(MethodDescriptor.MethodType.UNARY)
      .setFullMethodName("brainstem.api.v1.RobotControl/GetMotorStatus")
      .setRequestMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(byteArrayOf())
        override fun parse(stream: InputStream): ByteArray = throw UnsupportedOperationException()
      })
      .setResponseMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = throw UnsupportedOperationException()
        override fun parse(stream: InputStream): ByteArray = MotorStatusParser.readBounded(stream)
      })
      .build()
  }
}
