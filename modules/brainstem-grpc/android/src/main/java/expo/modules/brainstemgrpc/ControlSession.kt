package expo.modules.brainstemgrpc

import android.os.SystemClock
import io.grpc.CallOptions
import io.grpc.ClientCall
import io.grpc.ManagedChannel
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.grpc.Status
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** One endpoint, one authenticated channel, one in-memory lease. No reconnect or replay. */
internal class ControlSession(
  val channel: ManagedChannel,
  private val principal: String,
  private val lanDev: Boolean = false,
  private val queueCleanup: (() -> Unit) -> Unit
) {
  val id: String = UUID.randomUUID().toString()
  private val closed = AtomicBoolean(false)
  private val armed = AtomicBoolean(false)
  private val stopping = AtomicBoolean(false)
  private val motionIntent = AtomicBoolean(false)
  private val cancellationEpoch = AtomicLong(0)
  private val dispatchLock = Any()
  private val watchdog = Executors.newSingleThreadScheduledExecutor()
  @Volatile private var call: ClientCall<ByteArray, ByteArray>? = null
  @Volatile private var imuCall: ClientCall<ByteArray, ByteArray>? = null
  private var imuGeneration = 0L
  private var recoveryHeartbeat: ScheduledFuture<*>? = null
  private val recoveryHeartbeatBusy = AtomicBoolean(false)
  @Volatile private var lastRecoveryHeartbeatAt = 0L
  @Volatile private var recoveryHeartbeatError: String? = null
  @Volatile private var lastInputAt = 0L
  private var lastWireAt = 0L
  private var lastWalkAckAt = 0L
  private var token = ""
  private var sequence = 0L
  private var sequenceCertain = true
  private var principalVerified = false
  private var leaseOwnerMatched = false
  private var stopUnconfirmed = false
  private var profileReadAt: Long? = null

  init {
    watchdog.scheduleAtFixedRate({
      if (armed.get() && motionIntent.get() && !inputFresh(lastInputAt)) {
        haltImmediately()
        queueCleanup { runCatching { interrupt() } }
      }
    }, 25, 25, TimeUnit.MILLISECONDS)
  }

  fun initialStatus(): Map<String, Any> {
    return status(refreshProfile = true)
  }

  fun status(refreshProfile: Boolean = false): Map<String, Any> {
    checkOpen()
    val bytes = rpc("GetControlStatus", EMPTY)
    val value = ControlStatusParser.parse(bytes)
    if (armed.get() && (!value.boolean("grpcLeaseActive") || value["owner"] != "grpc"
        || value.boolean("criticalMotorFault") || !value.boolean("motorOutputEnabled")
        || runCatching { ControlWire.requireLeaseOwner(bytes, principal, sequence) }.isFailure)) {
      haltImmediately()
      // There is no local authority after the server revokes or another controller takes over.
      token = ""
      sequence = 0
      sequenceCertain = true
      motionIntent.set(false)
      stopping.set(false)
    }
    val result = envelope(value)
    val now = SystemClock.elapsedRealtime()
    // Profile reads never block the motion RPC queue while a lease is held.
    if (!armed.get() && (refreshProfile || profileReadAt == null || now - profileReadAt!! >= 2000L)) {
      profileReadAt = now
      return try { result + mapOf("profile" to ProfileInfoParser.parse(rpc("GetProfile", EMPTY, 750))) }
      catch (error: Failure) {
        if (error.code in listOf("unimplemented", "unavailable", "timeout", "busy")) result + mapOf("profileUnavailable" to true)
        else throw error
      } catch (_: java.io.IOException) {
        result + mapOf("profileUnavailable" to true)
      }
    }
    return result
  }

  fun captureEpoch(): Long = cancellationEpoch.get()

  fun requireEpoch(expected: Long) {
    synchronized(dispatchLock) {
      checkOpen()
      if (expected != cancellationEpoch.get()) throw Failure("cancelled")
    }
  }

  fun action(action: String, profileName: String?, epoch: Long = captureEpoch()): Map<String, Any> {
    checkOpen()
    requireEpoch(epoch)
    if (stopping.get()) throw Failure("busy")
    interrupt()
    val before = ControlStatusParser.parse(rpc("GetControlStatus", EMPTY, epoch = epoch))
    val method = when (action) {
      "enable" -> "Enable"
      "disable" -> "Disable"
      "stand-up" -> "StandUp"
      "sit-down" -> "SitDown"
      "switch-profile" -> "SwitchProfile"
      "set-zero" -> "SetZero"
      "clear-motor-fault" -> "ClearMotorFault"
      "play-gesture" -> "PlayGesture"
      else -> throw Failure("config")
    }
    if (action == "clear-motor-fault") {
      if (before["owner"] == "yunzhuo") throw Failure("precondition")
    } else if (action != "disable") {
      if (before["owner"] == "yunzhuo" || before.boolean("criticalMotorFault")
          || before["fsmKind"] == "transitioning") throw Failure("precondition")
      if (action == "stand-up" || action == "sit-down") {
        if (!before.boolean("motorOutputEnabled")) throw Failure("precondition")
      }
      if (action == "stand-up" && before["fsmKind"] == "walking"
          && before.boolean("grpcLeaseActive")) throw Failure("precondition")
      if (action == "set-zero" && (before["fsmKind"] != "grounded"
          || before.boolean("grpcLeaseActive"))) throw Failure("precondition")
      if (action == "play-gesture" && (!before.boolean("motorOutputEnabled")
          || before["fsmKind"] != "standing" || before.boolean("grpcLeaseActive"))) throw Failure("precondition")
    }
    var motionSlotRequest = false
    val request = when (action) {
      "switch-profile" -> {
        if (before["fsmKind"] !in listOf("grounded", "standing")
            || before.boolean("grpcLeaseActive")) throw Failure("precondition")
        if (profileName.isNullOrBlank() || profileName.length > 256) throw Failure("config")
        val profile = ProfileInfoParser.parse(rpc("GetProfile", EMPTY, epoch = epoch))
        val capabilities = (profile["modeCapabilities"] as? List<*>)?.filterIsInstance<Map<*, *>>() ?: emptyList()
        motionSlotRequest = capabilities.any { it["kind"] == "locomotion" }
        if (motionSlotRequest) {
          val capability = capabilities.filter { it["id"] == profileName }.singleOrNull()
          if (capability == null || capability["kind"] != "locomotion"
              || capability["available"] != true || capability["availability"] != "available") throw Failure("precondition")
        } else {
          val available = profile["available"] as? List<*> ?: throw Failure("invalid_response")
          if (!available.contains(profileName)) throw Failure("precondition")
        }
        ControlWire.stringRequest(profileName)
      }
      "play-gesture" -> {
        val gestureName = profileName?.trim().orEmpty()
        if (gestureName.isEmpty() || gestureName.length > GestureListParser.MAX_NAME_CHARS || gestureName.contains('\u0000')) {
          throw Failure("config")
        }
        try { ControlWire.stringRequest(gestureName) } catch (_: IllegalArgumentException) { throw Failure("config") }
      }
      "clear-motor-fault" -> {
        if (profileName.isNullOrBlank()) EMPTY
        else {
          val ids = try {
            profileName.split(',').map { it.trim().toInt() }.toIntArray()
          } catch (_: NumberFormatException) {
            throw Failure("config")
          }
          try { ControlWire.clearFaultRequest(ids) } catch (_: IllegalArgumentException) { throw Failure("config") }
        }
      }
      else -> EMPTY
    }
    val response = rpc(method, request, epoch = epoch)
    principalVerified = !lanDev
    val result = status().toMutableMap()
    if (action == "switch-profile") {
      val profile = ProfileInfoParser.parse(response)
      if (motionSlotRequest) {
        if (profile["activeModeId"] != profileName) throw Failure("action_failed")
      } else if (profile["current"] != profileName) throw Failure("invalid_response")
      result["profile"] = profile
    }
    return result
  }

  fun acquire(epoch: Long = captureEpoch()): Map<String, Any> {
    checkOpen()
    requireEpoch(epoch)
    if (armed.get() || token.isNotEmpty() || stopping.get()) throw Failure("busy")
    val before = ControlStatusParser.parse(rpc("GetControlStatus", EMPTY, epoch = epoch))
    if (!before.boolean("motorOutputEnabled") || before.boolean("criticalMotorFault")
        || before["owner"] == "yunzhuo" || before["fsmKind"] !in listOf("standing", "walking")
        || before.boolean("grpcLeaseActive")) throw Failure("precondition")
    val leaseBytes = rpc("AcquireControl", ControlWire.stringRequest(principal), epoch = epoch)
    val lease = ControlWire.lease(leaseBytes)
    if (!lease.accepted) throw Failure("precondition")
    token = lease.token
    try {
      synchronized(dispatchLock) {
        requireEpoch(epoch)
        ControlWire.requireLeaseOwner(ControlWire.nestedStatus(leaseBytes, 5), principal, 0)
        if (lease.status["owner"] != "grpc" || !lease.status.boolean("grpcLeaseActive")) throw Failure("invalid_response")
        sequence = 0
        sequenceCertain = true
        lastWireAt = 0
        lastWalkAckAt = 0
        lastInputAt = SystemClock.elapsedRealtime()
        stopping.set(false)
        motionIntent.set(false)
        armed.set(true)
      }
      val zero = walk(0.0, 0.0, 0.0, lastInputAt, epoch)
      principalVerified = !lanDev
      return zero + mapOf("principalVerified" to principalVerified)
    } catch (error: Exception) {
      haltImmediately()
      runCatching { interrupt() }
      throw error
    }
  }

  private fun inputFresh(sampledAt: Long): Boolean {
    val current = SystemClock.elapsedRealtime()
    return sampledAt >= 0L && sampledAt <= current && current - sampledAt <= INPUT_MAX_AGE_MS
  }

  /** Physical input retains its original SDK request time; touch retains bridge ingress time. */
  fun input(x: Double, y: Double, yaw: Double, receivedAt: Long, epoch: Long = captureEpoch()): Map<String, Any> {
    checkOpen()
    requireEpoch(epoch)
    if (!armed.get() || stopping.get() || token.isEmpty()) throw Failure("not_armed")
    if (!inputFresh(receivedAt)) {
      haltImmediately(); runCatching { interrupt() }; throw Failure("stale_input")
    }
    return try { walk(x, y, yaw, receivedAt, epoch) } catch (error: Exception) {
      haltImmediately(); runCatching { interrupt() }; throw error
    }
  }

  private fun walk(x: Double, y: Double, yaw: Double, receivedAt: Long, epoch: Long): Map<String, Any> {
    if (!armed.get() || stopping.get()) throw Failure("not_armed")
    // Direct velocity RPC uses the deployed Brainstem protocol bounds, not a second low-speed cap.
    if (!x.isFinite() || !y.isFinite() || !yaw.isFinite() || kotlin.math.abs(x) > ControlWire.MAX_LINEAR_MPS
        || kotlin.math.abs(y) > ControlWire.MAX_LINEAR_MPS || kotlin.math.abs(yaw) > ControlWire.MAX_YAW_RPS) throw Failure("config")
    waitWireInterval()
    if (!armed.get() || stopping.get() || !inputFresh(receivedAt)) throw Failure("stale_input")
    val next = sequence + 1
    if (next <= 0 || next > 9_007_199_254_740_991L) throw Failure("invalid_response")
    // Zero after movement remains guarded until its ACK; an initial zero needs no input heartbeat.
    if (x != 0.0 || y != 0.0 || yaw != 0.0) motionIntent.set(true)
    lastInputAt = receivedAt
    sequenceCertain = false
    val response = rpc("WalkChecked", ControlWire.walk(token, next, x, y, yaw), MOTION_DEADLINE_MS, epoch, receivedAt)
    val ack = ControlWire.ack(response)
    if (!ack.accepted || ack.sequence != next || ack.reason != 0) throw Failure("command_rejected")
    ControlWire.requireLeaseOwner(ControlWire.nestedStatus(response, 4), principal, next)
    if (!ack.status.boolean("grpcLeaseActive") || ack.status["owner"] != "grpc"
        || ack.status.boolean("criticalMotorFault") || !ack.status.boolean("motorOutputEnabled")) throw Failure("command_rejected")
    lastWalkAckAt = SystemClock.elapsedRealtime()
    sequence = next
    leaseOwnerMatched = true
    sequenceCertain = true
    lastInputAt = receivedAt
    if (x == 0.0 && y == 0.0 && yaw == 0.0) motionIntent.set(false)
    if (!armed.get() || stopping.get()) throw Failure("stale_input")
    return envelope(ack.status) + mapOf("sequence" to sequence)
  }

  /** Cancels in-flight control immediately before queued cleanup; future input cannot resurrect it. */
  fun haltImmediately() {
    synchronized(dispatchLock) {
      cancellationEpoch.incrementAndGet()
      armed.set(false)
      leaseOwnerMatched = false
      stopping.set(true)
      call?.cancel("Control interrupted", null)
    }
  }

  fun interrupt(): Map<String, Any> {
    armed.set(false)
    stopping.set(true)
    var projected: Map<String, Any>? = null
    val held = token
    var releaseConfirmed = held.isEmpty() && !stopUnconfirmed
    try {
      if (held.isNotEmpty() && !channel.isShutdown) {
        // A rejected/uncertain ACK is never retried with a guessed sequence. Release alone is safe.
        if (sequenceCertain) runCatching {
          waitWireInterval(afterAck = false)
          val ack = ControlWire.ack(rpc("WalkChecked", ControlWire.walk(held, sequence + 1, 0.0, 0.0, 0.0), MOTION_DEADLINE_MS))
          if (ack.accepted && ack.reason == 0 && ack.sequence == sequence + 1) projected = ack.status
        }
        runCatching {
          val released = ControlStatusParser.parse(rpc("ReleaseControl", ControlWire.stringRequest(held), MOTION_DEADLINE_MS))
          if (!released.boolean("grpcLeaseActive") && released["owner"] != "grpc") {
            projected = released
            releaseConfirmed = true
          }
        }
      }
    } finally {
      // Retire local authority even when the network cannot confirm remote revocation.
      token = ""
      leaseOwnerMatched = false
      sequence = 0
      sequenceCertain = true
      motionIntent.set(false)
      stopUnconfirmed = !releaseConfirmed
      stopping.set(!releaseConfirmed)
    }
    if (!releaseConfirmed) throw Failure("stop_unconfirmed")
    return mapOf("sessionId" to id, "leaseActive" to false, "principalVerified" to principalVerified, "leaseOwnerMatched" to false) +
      (projected?.let { mapOf("status" to it) } ?: emptyMap())
  }

  fun startImu(onSample: (Map<String, Any>) -> Unit) {
    val next = channel.newCall(LISTEN_IMU, CallOptions.DEFAULT)
    synchronized(dispatchLock) {
      checkOpen()
      imuCall?.cancel("replaced", null)
      val generation = ++imuGeneration
      imuCall = next
      next.start(object : ClientCall.Listener<ByteArray>() {
        private var lastAt = 0L
        override fun onMessage(message: ByteArray) {
          next.request(1)
          if (generation != imuGeneration) return
          val now = SystemClock.elapsedRealtime()
          if (now - lastAt < 100L) return
          val parsed = runCatching { ImuParser.parse(message) }.getOrNull() ?: return
          lastAt = now
          onSample(parsed)
        }
        override fun onClose(status: Status, trailers: Metadata) {
          if (generation == imuGeneration) imuCall = null
        }
      }, Metadata().apply { if (lanDev) put(DEV_CLIENT, principal) })
      next.request(1)
      next.sendMessage(EMPTY)
      next.halfClose()
    }
  }

  fun stopImu() {
    synchronized(dispatchLock) {
      imuGeneration++
      imuCall?.cancel("stopped", null)
      imuCall = null
    }
  }

  fun listGestures(): Map<String, Any> {
    checkOpen()
    val bytes = rpc("ListGestures", EMPTY)
    val gestures = try { GestureListParser.parse(bytes) } catch (_: Exception) { throw Failure("invalid_response") }
    return mapOf("gestures" to gestures)
  }

  fun playGesture(name: String, epoch: Long = captureEpoch()): Map<String, Any> =
    action("play-gesture", name, epoch)

  fun setZero(epoch: Long = captureEpoch()): Map<String, Any> =
    action("set-zero", null, epoch)

  fun clearMotorFault(jointIds: List<Int>? = null, epoch: Long = captureEpoch()): Map<String, Any> {
    if (jointIds != null) {
      try { ControlWire.clearFaultRequest(jointIds.toIntArray()) }
      catch (_: IllegalArgumentException) { throw Failure("config") }
    }
    val arg = jointIds?.takeIf { it.isNotEmpty() }?.joinToString(",")
    return action("clear-motor-fault", arg, epoch)
  }

  fun getSpeedMode(): Map<String, Any> {
    checkOpen()
    val bytes = rpc("GetSpeedMode", EMPTY)
    val mode = try { ControlWire.parseSpeedMode(bytes) } catch (_: Exception) { throw Failure("invalid_response") }
    return mapOf("speedMode" to mode)
  }

  fun setSpeedMode(mode: String, epoch: Long = captureEpoch()): Map<String, Any> {
    checkOpen()
    requireEpoch(epoch)
    if (stopping.get()) throw Failure("busy")
    val normalized = mode.trim().lowercase()
    val payload = try { ControlWire.speedModeRequest(normalized) } catch (_: IllegalArgumentException) { throw Failure("config") }
    interrupt()
    val before = ControlStatusParser.parse(rpc("GetControlStatus", EMPTY, epoch = epoch))
    if (before["owner"] == "yunzhuo" || before.boolean("criticalMotorFault")
        || before["fsmKind"] == "transitioning") throw Failure("precondition")
    rpc("SetSpeedMode", payload, epoch = epoch)
    principalVerified = !lanDev
    return status() + mapOf("speedMode" to normalized)
  }

  fun recovery(action: String): Map<String, Any> {
    val name = when (action) {
      "status" -> "GetStatus"
      "enter" -> "Enter"
      "enable" -> "Enable"
      "start" -> "Start"
      "cancel" -> "Cancel"
      "exit" -> "Exit"
      else -> throw Failure("config")
    }
    @Suppress("UNCHECKED_CAST")
    val parsed = RecoveryStatusParser.parse(recoveryRpc(name, 3000)) as Map<String, Any>
    return recoveryEnvelope(parsed)
  }

  fun setRecoveryHeartbeat(enabled: Boolean) {
    synchronized(dispatchLock) {
      recoveryHeartbeat?.cancel(false)
      recoveryHeartbeat = null
      recoveryHeartbeatBusy.set(false)
      if (!enabled || closed.get()) {
        lastRecoveryHeartbeatAt = 0L
        recoveryHeartbeatError = null
        return
      }
      recoveryHeartbeat = watchdog.scheduleAtFixedRate({
        if (closed.get() || !recoveryHeartbeatBusy.compareAndSet(false, true)) return@scheduleAtFixedRate
        try {
          recoveryRpc("Heartbeat", 150)
          lastRecoveryHeartbeatAt = SystemClock.elapsedRealtime()
          recoveryHeartbeatError = null
        } catch (error: Exception) {
          val code = (error as? Failure)?.code ?: "unavailable"
          recoveryHeartbeatError = code
          if (code == "unimplemented") setRecoveryHeartbeat(false)
        } finally {
          recoveryHeartbeatBusy.set(false)
        }
      }, 0, 100, TimeUnit.MILLISECONDS)
    }
  }

  fun close() {
    setRecoveryHeartbeat(false)
    stopImu()
    haltImmediately()
    runCatching { interrupt() }
    closed.set(true)
    watchdog.shutdownNow()
    channel.shutdownNow()
  }

  private fun envelope(status: Map<String, Any>): Map<String, Any> = mapOf(
    "sessionId" to id, "status" to status,
    "leaseActive" to (armed.get() && token.isNotEmpty() && status.boolean("grpcLeaseActive")),
    "principalVerified" to principalVerified,
    "leaseOwnerMatched" to leaseOwnerMatched,
    "transport" to if (lanDev) "grpc-lan" else "grpc-mtls"
  )

  private fun recoveryEnvelope(parsed: Map<String, Any>): Map<String, Any> {
    val fresh = lastRecoveryHeartbeatAt > 0L && SystemClock.elapsedRealtime() - lastRecoveryHeartbeatAt < 300L
    val value = linkedMapOf<String, Any>()
    value.putAll(parsed)
    value["heartbeatFresh"] = fresh
    recoveryHeartbeatError?.let { value["heartbeatError"] = it }
    return value
  }

  private fun recoveryRpc(name: String, deadline: Long): ByteArray {
    checkOpen()
    val latch = CountDownLatch(1)
    var body: ByteArray? = null
    var result = Status.UNKNOWN
    var duplicate = false
    val next = channel.newCall(recoveryMethod(name), CallOptions.DEFAULT.withDeadlineAfter(deadline, TimeUnit.MILLISECONDS))
    try {
      if (closed.get()) throw Failure("cancelled")
      next.start(object : ClientCall.Listener<ByteArray>() {
        override fun onMessage(message: ByteArray) { if (body != null) duplicate = true else body = message }
        override fun onClose(status: Status, trailers: Metadata) { result = status; latch.countDown() }
      }, Metadata().apply { if (lanDev) put(DEV_CLIENT, principal) })
      next.request(2)
      next.sendMessage(EMPTY)
      next.halfClose()
      if (!latch.await(deadline + 40, TimeUnit.MILLISECONDS)) throw Failure("timeout")
      if (!result.isOk) throw Failure(when (result.code) {
        Status.Code.UNAUTHENTICATED, Status.Code.PERMISSION_DENIED -> "unauthorized"
        Status.Code.FAILED_PRECONDITION, Status.Code.ABORTED -> "precondition"
        Status.Code.DEADLINE_EXCEEDED -> "timeout"
        Status.Code.CANCELLED -> "cancelled"
        Status.Code.UNIMPLEMENTED, Status.Code.NOT_FOUND -> "unimplemented"
        else -> "unavailable"
      })
      if (duplicate) throw Failure("invalid_response")
      return body ?: throw Failure("invalid_response")
    } finally { next.cancel("Recovery RPC finished", null) }
  }

  private fun checkOpen() { if (closed.get() || channel.isShutdown) throw Failure("cancelled") }
  private fun Map<String, Any>.boolean(key: String) = this[key] == true
  private fun waitWireInterval(afterAck: Boolean = true) {
    val current = SystemClock.elapsedRealtime()
    // Send spacing alone cannot prevent network jitter from clustering arrivals at the server.
    val remaining = maxOf(MIN_WIRE_INTERVAL_MS - (current - lastWireAt),
      if (afterAck) MIN_WIRE_INTERVAL_MS - (current - lastWalkAckAt) else 0L)
    if (remaining > 0) Thread.sleep(remaining)
  }

  private fun rpc(name: String, request: ByteArray, deadline: Long = 3000, epoch: Long? = null, sampledAt: Long? = null): ByteArray {
    checkOpen()
    val startedAt = SystemClock.elapsedRealtime()
    val latch = CountDownLatch(1)
    var body: ByteArray? = null
    var result = Status.UNKNOWN
    var duplicate = false
    val headersAt = AtomicLong(-1)
    val messageAt = AtomicLong(-1)
    val next = channel.newCall(method(name), CallOptions.DEFAULT.withDeadlineAfter(deadline, TimeUnit.MILLISECONDS))
    try {
      synchronized(dispatchLock) {
        checkOpen()
        if (epoch != null && epoch != cancellationEpoch.get()) throw Failure("cancelled")
        if (sampledAt != null && !inputFresh(sampledAt)) throw Failure("stale_input")
        call = next
        next.start(object : ClientCall.Listener<ByteArray>() {
          override fun onHeaders(headers: Metadata) { headersAt.compareAndSet(-1, SystemClock.elapsedRealtime()) }
          override fun onMessage(message: ByteArray) {
            messageAt.compareAndSet(-1, SystemClock.elapsedRealtime())
            if (body != null) duplicate = true else body = message
          }
          override fun onClose(status: Status, trailers: Metadata) { result = status; latch.countDown() }
        }, Metadata().apply { if (lanDev) put(DEV_CLIENT, principal) })
        next.request(2)
        next.sendMessage(request)
        next.halfClose()
        if (name == "WalkChecked") lastWireAt = SystemClock.elapsedRealtime()
      }
      if (!latch.await(deadline + 50, TimeUnit.MILLISECONDS)) {
        recordTimeout(name, startedAt, true, headersAt.get(), messageAt.get())
        throw Failure("timeout")
      }
      if (result.code == Status.Code.DEADLINE_EXCEEDED) recordTimeout(name, startedAt, false, headersAt.get(), messageAt.get())
      if (!result.isOk) throw Failure(when (result.code) {
        Status.Code.UNAUTHENTICATED, Status.Code.PERMISSION_DENIED -> "unauthorized"
        Status.Code.FAILED_PRECONDITION, Status.Code.ABORTED, Status.Code.NOT_FOUND, Status.Code.INVALID_ARGUMENT -> "precondition"
        Status.Code.DEADLINE_EXCEEDED -> "timeout"
        Status.Code.CANCELLED -> "cancelled"
        Status.Code.UNIMPLEMENTED -> "unimplemented"
        else -> "unavailable"
      })
      if (duplicate) throw Failure("invalid_response")
      if (epoch != null && epoch != cancellationEpoch.get()) throw Failure("cancelled")
      return body ?: throw Failure("invalid_response")
    } finally { call = null; next.cancel("Control RPC finished", null) }
  }

  private fun recordTimeout(name: String, startedAt: Long, latchExpired: Boolean, headersAt: Long, messageAt: Long) {
    runCatching {
      val method = if (name in allowedMethods) name else "unknown"
      val elapsed = (SystemClock.elapsedRealtime() - startedAt).coerceAtLeast(0L)
      val headersMs = if (headersAt >= startedAt) (headersAt - startedAt).toString() else "none"
      val messageMs = if (messageAt >= startedAt) (messageAt - startedAt).toString() else "none"
      System.err.println("DOSO_CONTROL_RPC_TIMEOUT method=$method elapsedMs=$elapsed source=${if (latchExpired) "latch" else "grpc_deadline"} headersMs=$headersMs messageMs=$messageMs")
    }
  }

  internal class Failure(val code: String) : Exception("Brainstem control failed")

  companion object {
    const val INPUT_MAX_AGE_MS = 150L
    const val MIN_WIRE_INTERVAL_MS = 20L
    const val MOTION_DEADLINE_MS = 100L
    private val DEV_CLIENT = Metadata.Key.of("x-doso-dev-client", Metadata.ASCII_STRING_MARSHALLER)
    private val EMPTY = byteArrayOf()
    private val LISTEN_IMU: MethodDescriptor<ByteArray, ByteArray> = MethodDescriptor.newBuilder<ByteArray, ByteArray>()
      .setType(MethodDescriptor.MethodType.SERVER_STREAMING)
      .setFullMethodName("brainstem.api.v1.RobotControl/ListenImu")
      .setRequestMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(value)
        override fun parse(stream: InputStream): ByteArray = throw UnsupportedOperationException()
      })
      .setResponseMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = throw UnsupportedOperationException()
        override fun parse(stream: InputStream): ByteArray = ImuParser.readBounded(stream)
      }).build()
    private val allowedMethods = setOf("GetControlStatus", "GetProfile", "AcquireControl", "RenewControlLease",
      "ReleaseControl", "WalkChecked", "Enable", "Disable", "StandUp", "SitDown", "SwitchProfile",
      "SetZero", "ClearMotorFault", "PlayGesture", "ListGestures", "SetSpeedMode", "GetSpeedMode")
    private fun recoveryMethod(name: String): MethodDescriptor<ByteArray, ByteArray> {
      if (name !in setOf("GetStatus", "Enter", "Enable", "Heartbeat", "Start", "Cancel", "Exit")) throw Failure("config")
      return MethodDescriptor.newBuilder<ByteArray, ByteArray>()
        .setType(MethodDescriptor.MethodType.UNARY)
        .setFullMethodName("brainstem.api.v1.RobotRecovery/$name")
        .setRequestMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
          override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(value)
          override fun parse(stream: InputStream): ByteArray = throw UnsupportedOperationException()
        })
        .setResponseMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
          override fun stream(value: ByteArray): InputStream = throw UnsupportedOperationException()
          override fun parse(stream: InputStream): ByteArray = RecoveryStatusParser.readBounded(stream)
        }).build()
    }
    private fun method(name: String): MethodDescriptor<ByteArray, ByteArray> {
      if (name !in allowedMethods) throw Failure("config")
      return MethodDescriptor.newBuilder<ByteArray, ByteArray>()
        .setType(MethodDescriptor.MethodType.UNARY)
        .setFullMethodName("brainstem.api.v1.RobotControl/$name")
        .setRequestMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
          override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(value)
          override fun parse(stream: InputStream): ByteArray = throw UnsupportedOperationException()
        })
        .setResponseMarshaller(object : MethodDescriptor.Marshaller<ByteArray> {
          override fun stream(value: ByteArray): InputStream = throw UnsupportedOperationException()
          override fun parse(stream: InputStream): ByteArray = ControlStatusParser.readBounded(stream)
        }).build()
    }
  }
}
