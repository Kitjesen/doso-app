package expo.modules.g20input

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.skydroid.rcsdk.KeyManager
import com.skydroid.rcsdk.RCSDKManager
import com.skydroid.rcsdk.SDKManagerCallBack
import com.skydroid.rcsdk.common.DeviceType
import com.skydroid.rcsdk.common.callback.CompletionCallbackWith
import com.skydroid.rcsdk.common.error.SkyException
import com.skydroid.rcsdk.common.remotecontroller.ChannelSettings
import com.skydroid.rcsdk.common.remotecontroller.ControlMode
import com.skydroid.rcsdk.internal.InternalKey
import com.skydroid.rcsdk.key.RemoteControllerKey
import com.skydroid.rcsdk.utils.RCSDKUtils

/** G20 local RC input only. This adapter has no device SET/ACTION or robot transport. */
internal class SkydroidG20Source(context: Context) : G20ReadOnlySource {
  // RCSDK retains its callback after disconnect; never let that root retain ReactContext.
  private val applicationContext = context.applicationContext
  private class Pending<T>(var done: ((T?) -> Unit)?)
  private class Connection(
    var connected: (() -> Unit)?, var failed: ((String) -> Unit)?, var disconnected: (() -> Unit)?
  ) {
    val pending = mutableSetOf<Pending<*>>()
    fun clear() {
      connected = null; failed = null; disconnected = null
      for (request in pending) request.done = null
      pending.clear()
    }
  }
  private val callbackLock = Any()
  @Volatile private var connection: Connection? = null
  private val callbacks = Handler(Looper.getMainLooper())
  private var initialized = false
  private var previousConnectionScope: Int? = null

  @Synchronized override fun open(connected: () -> Unit, failed: (String) -> Unit, disconnected: () -> Unit) {
    close()
    // The official SDK has ARM JNI only. Device recognition itself does not load that JNI.
    if (!Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "armeabi-v7a" }) {
      failed("unsupported_abi")
      return
    }
    if (RCSDKUtils.getDeviceType() != DeviceType.G20) {
      failed("unsupported_device")
      return
    }
    val run = Connection(connected, failed, disconnected)
    synchronized(callbackLock) { connection = run }
    initialized = true
    RCSDKManager.initSDK(applicationContext, object : SDKManagerCallBack {
      // Only the revocable run is captured, never the session callbacks themselves.
      override fun onRcConnected() { deliver(run) { run.connected?.invoke() } }
      override fun onRcConnectFail(e: SkyException?) { deliver(run) { run.failed?.invoke("rc_connect_failed") } }
      override fun onRcDisconnect() { deliver(run) { run.disconnected?.invoke() } }
    })
    RCSDKManager.setLogEnable(false)
    // v1.9.2's default connects both RC and airlink. This process-local SDK selector
    // prevents starting airlink/video helpers; it does not write any controller setting.
    previousConnectionScope = InternalKey.onlyConnect
    InternalKey.onlyConnect = InternalKey.ONLY_CONNECT_RC
    RCSDKManager.connectToRC()
  }

  override fun readSettings(done: (List<Map<String, Any>>?) -> Unit) {
    val (run, request) = register(done) ?: return
    KeyManager.get(RemoteControllerKey.KeyChannelSettings, object : CompletionCallbackWith<ChannelSettings> {
      override fun onSuccess(value: ChannelSettings?) {
        if (connection !== run) return
        val snapshot = try {
          value?.channels?.mapIndexed { position, item -> mapOf(
            // Array position addresses the raw channels array. Vendor index is retained separately.
            "channelIndex" to position, "index" to item.index, "mapping" to item.mapping,
            "min" to item.min, "middle" to item.middle, "max" to item.max, "reverse" to item.reverse
          ) }
        } catch (_: Exception) { null }
        complete(run, request, snapshot)
      }
      override fun onFailure(e: SkyException) { complete(run, request, null) }
    })
  }

  override fun readMode(done: (String?) -> Unit) {
    val (run, request) = register(done) ?: return
    KeyManager.get(RemoteControllerKey.KeyControlMode, object : CompletionCallbackWith<ControlMode> {
      override fun onSuccess(value: ControlMode?) { complete(run, request, value?.name) }
      override fun onFailure(e: SkyException) { complete(run, request, null) }
    })
  }

  override fun readChannels(done: (IntArray?) -> Unit) {
    val (run, request) = register(done) ?: return
    KeyManager.get(RemoteControllerKey.KeyChannels, object : CompletionCallbackWith<IntArray> {
      override fun onSuccess(value: IntArray?) {
        val snapshot = value?.copyOf()
        complete(run, request, snapshot)
      }
      override fun onFailure(e: SkyException) { complete(run, request, null) }
    })
  }

  @Synchronized override fun close() {
    synchronized(callbackLock) {
      val previous = connection
      connection = null
      // Cut SDK-retained lifecycle and GET closures before disconnect callbacks can fire.
      previous?.clear()
    }
    callbacks.removeCallbacksAndMessages(null)
    if (initialized) {
      initialized = false
      try { RCSDKManager.disconnectRC() } finally {
        previousConnectionScope?.let { InternalKey.onlyConnect = it }
        previousConnectionScope = null
      }
    }
  }

  // Never make the SDK's own callback thread wait for session cleanup under its lock.
  private fun deliver(run: Connection, action: () -> Unit) {
    if (connection === run) callbacks.post { if (connection === run) action() }
  }

  private fun <T> register(done: (T?) -> Unit): Pair<Connection, Pending<T>>? {
    synchronized(callbackLock) {
      val run = connection ?: return null
      val request = Pending<T>(done)
      run.pending.add(request)
      return run to request
    }
  }

  private fun <T> complete(run: Connection, request: Pending<T>, value: T?) {
    deliver(run) {
      val done = synchronized(callbackLock) {
        if (connection !== run) null else {
          run.pending.remove(request)
          request.done.also { request.done = null }
        }
      }
      done?.invoke(value)
    }
  }
}
