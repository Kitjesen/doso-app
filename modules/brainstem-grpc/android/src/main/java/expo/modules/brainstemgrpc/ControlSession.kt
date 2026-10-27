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
  @Volatile private var lastInputAt = 0L
  private var lastWireAt = 0L
  private var token = ""
  private var sequence = 0L
  private var sequenceCertain = true
  private var principalVerified = false
  private var leaseOwnerMatched = false
  private var stopUnconfirmed = false

  init {
    watchdog.scheduleAtFixedRate({
      if (armed.get() && motionIntent.get() && !inputFresh(lastInputAt)) {
        haltImmediately()
        queueCleanup { runCatching { interrupt() } }
      }
    }, 25, 25, TimeUnit.MILLISECONDS)
  }

  fun initialStatus(): Map<String, Any> {
    val observed = status()
    return try { observed + mapOf("profile" to ProfileInfoParser.parse(rpc("GetProfile", EMPTY, 750))) }
    catch (error: Failure) { if (error.code == "unimplemented") observed else throw error }
  }

  fun status(): Map<String, Any> {
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
    return envelope(value)
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
      else -> throw Failure("config")
    }
    if (action != "disable") {
      if (before["owner"] == "yunzhuo" || before.boolean("criticalMotorFault")
          || before["fsmKind"] == "transitioning") throw Failure("precondition")
      if (action == "stand-up" || action == "sit-down") {
        if (!before.boolean("motorOutputEnabled")) throw Failure("precondition")
      }
    }
    val request = if (action == "switch-profile") {
      if (before["fsmKind"] !in listOf("grounded", "standing")
          || before.boolean("grpcLeaseActive")) throw Failure("precondition")
      if (profileName.isNullOrBlank() || profileName.length > 256) throw Failure("config")
      val profile = ProfileInfoParser.parse(rpc("GetProfile", EMPTY, epoch = epoch))
      val available = profile["available"] as? List<*> ?: throw Failure("invalid_response")
      if (!available.contains(profileName)) throw Failure("precondition")
      ControlWire.stringRequest(profileName)
    } else EMPTY
    val response = rpc(method, request, epoch = epoch)
    principalVerified = !lanDev
    val result = status().toMutableMap()
    if (action == "switch-profile") {
      val profile = ProfileInfoParser.parse(response)
      if (profile["current"] != profileName) throw Failure("invalid_response")
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
    if (!x.isFinite() || !y.isFinite() || !yaw.isFinite() || kotlin.math.abs(x) > .3
        || kotlin.math.abs(y) > .3 || kotlin.math.abs(yaw) > .5) throw Failure("config")
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
          waitWireInterval()
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

  fun close() {
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

  private fun checkOpen() { if (closed.get() || channel.isShutdown) throw Failure("cancelled") }
  private fun Map<String, Any>.boolean(key: String) = this[key] == true
  private fun waitWireInterval() {
    val remaining = MIN_WIRE_INTERVAL_MS - (SystemClock.elapsedRealtime() - lastWireAt)
    if (remaining > 0) Thread.sleep(remaining)
  }

  private fun rpc(name: String, request: ByteArray, deadline: Long = 3000, epoch: Long? = null, sampledAt: Long? = null): ByteArray {
    checkOpen()
    val latch = CountDownLatch(1)
    var body: ByteArray? = null
    var result = Status.UNKNOWN
    var duplicate = false
    val next = channel.newCall(method(name), CallOptions.DEFAULT.withDeadlineAfter(deadline, TimeUnit.MILLISECONDS))
    try {
      synchronized(dispatchLock) {
        checkOpen()
        if (epoch != null && epoch != cancellationEpoch.get()) throw Failure("cancelled")
        if (sampledAt != null && !inputFresh(sampledAt)) throw Failure("stale_input")
        call = next
        next.start(object : ClientCall.Listener<ByteArray>() {
          override fun onMessage(message: ByteArray) { if (body != null) duplicate = true else body = message }
          override fun onClose(status: Status, trailers: Metadata) { result = status; latch.countDown() }
        }, Metadata().apply { if (lanDev) put(DEV_CLIENT, principal) })
        next.request(2)
        next.sendMessage(request)
        next.halfClose()
        if (name == "WalkChecked") lastWireAt = SystemClock.elapsedRealtime()
      }
      if (!latch.await(deadline + 50, TimeUnit.MILLISECONDS)) throw Failure("timeout")
      if (!result.isOk) throw Failure(when (result.code) {
        Status.Code.UNAUTHENTICATED, Status.Code.PERMISSION_DENIED -> "unauthorized"
        Status.Code.FAILED_PRECONDITION, Status.Code.ABORTED -> "precondition"
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

  internal class Failure(val code: String) : Exception("Brainstem control failed")

  companion object {
    const val INPUT_MAX_AGE_MS = 150L
    const val MIN_WIRE_INTERVAL_MS = 20L
    const val MOTION_DEADLINE_MS = 100L
    private val DEV_CLIENT = Metadata.Key.of("x-doso-dev-client", Metadata.ASCII_STRING_MARSHALLER)
    private val EMPTY = byteArrayOf()
    private val allowedMethods = setOf("GetControlStatus", "GetProfile", "AcquireControl", "RenewControlLease",
      "ReleaseControl", "WalkChecked", "Enable", "Disable", "StandUp", "SitDown", "SwitchProfile")
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
