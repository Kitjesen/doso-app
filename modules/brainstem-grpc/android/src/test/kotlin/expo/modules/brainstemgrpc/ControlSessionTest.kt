package expo.modules.brainstemgrpc

import android.os.SystemClock
import io.grpc.CallOptions
import io.grpc.ClientCall
import io.grpc.ManagedChannel
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.grpc.Status
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.lang.reflect.InvocationTargetException
import java.io.ByteArrayOutputStream
import java.io.PrintStream

private const val PRINCIPAL = "doso-g20@robot"
private fun capability(id: String, profile: String = "", kind: Long = 1, availability: Long = 2) =
  ControlWireTest.join(ControlWireTest.text(1, id), ControlWireTest.f(2, kind),
    ControlWireTest.f(3, availability), ControlWireTest.text(4, profile))

private class FakeChannel(val expectedPrincipal: String = PRINCIPAL) : ManagedChannel() {
  val requests = ConcurrentLinkedQueue<Pair<String, ByteArray>>()
  val devHeaders = ConcurrentLinkedQueue<String>()
  var stopped = false
  var lease = false
  var enabled = true
  var kind = 2
  var profileCurrent = "flat"
  var profileAvailable = listOf("flat")
  var profileCapabilities = emptyList<ByteArray>()
  var profileActiveModeId: String? = null
  var onProfileSwitch: ((ByteArray) -> Unit)? = null
  var owner = 0
  var criticalFault = false
  var gesturesPayload = byteArrayOf()
  var speedMode = 0
  var sequence = 0L
  var wrongAck = false
  var failWalk = false
  var dropWalkReply = false
  var failRelease = false
  var releaseKeepsLease = false
  var delayStatus = false
  var beforeWalkCall: (() -> Unit)? = null
  var beforeWalkAck: (() -> Unit)? = null
  val statusEntered = CountDownLatch(1)
  val releaseStatus = CountDownLatch(1)
  fun state() = ControlWireTest.join(ControlWireTest.b(1, ControlWireTest.f(1, kind.toLong())),
    ControlWireTest.f(2, if (enabled) 1 else 0), ControlWireTest.f(3, owner.toLong()),
    ControlWireTest.f(4, if (criticalFault) 1 else 0),
    ControlWireTest.f(5, if (lease) 1 else 0), ControlWireTest.f(7, sequence),
    ControlWireTest.text(10, if (lease) expectedPrincipal else ""))
  override fun authority() = "fake-local-only"
  override fun shutdown(): ManagedChannel { stopped = true; return this }
  override fun shutdownNow(): ManagedChannel = shutdown()
  override fun isShutdown() = stopped
  override fun isTerminated() = stopped
  override fun awaitTermination(timeout: Long, unit: TimeUnit) = stopped
  override fun <ReqT : Any?, RespT : Any?> newCall(method: MethodDescriptor<ReqT, RespT>, options: CallOptions): ClientCall<ReqT, RespT> {
    val name = method.bareMethodName!!
    if (name == "WalkChecked") beforeWalkCall?.invoke()
    return object : ClientCall<ReqT, RespT>() {
      lateinit var listener: Listener<RespT>
      var request = byteArrayOf()
      val done = AtomicBoolean(false)
      override fun start(value: Listener<RespT>, headers: Metadata) { listener = value
        devHeaders.add(headers.get(Metadata.Key.of("x-doso-dev-client", Metadata.ASCII_STRING_MARSHALLER)) ?: "") }
      override fun request(count: Int) {}
      override fun sendMessage(value: ReqT) { request = (value as ByteArray).copyOf() }
      override fun cancel(message: String?, cause: Throwable?) {
        if (done.compareAndSet(false, true) && ::listener.isInitialized) listener.onClose(Status.CANCELLED, Metadata())
      }
      override fun halfClose() {
        requests.add(name to request)
        if (name == "WalkChecked" && dropWalkReply) return
        if (name == "WalkChecked" && failWalk || name == "ReleaseControl" && failRelease) {
          if (name == "WalkChecked") listener.onHeaders(Metadata())
          if (done.compareAndSet(false, true)) listener.onClose(Status.DEADLINE_EXCEEDED, Metadata())
          return
        }
        if (name == "GetControlStatus" && delayStatus) {
          statusEntered.countDown()
          Thread {
            releaseStatus.await(2, TimeUnit.SECONDS)
            complete(state())
          }.apply { isDaemon = true }.start()
          return
        }
        val response = when (name) {
          "GetControlStatus" -> state()
          "GetProfile", "SwitchProfile" -> {
            if (name == "SwitchProfile") onProfileSwitch?.invoke(request)
            ControlWireTest.join(ControlWireTest.text(1, profileCurrent),
              *profileAvailable.map { ControlWireTest.text(2, it) }.toTypedArray(),
              *profileCapabilities.map { ControlWireTest.b(5, it) }.toTypedArray(),
              profileActiveModeId?.let { ControlWireTest.text(6, it) } ?: byteArrayOf())
          }
          "AcquireControl" -> {
            lease = true; owner = 1; sequence = 0
            ControlWireTest.join(ControlWireTest.f(1, 1), ControlWireTest.text(2, "ephemeral-fixture"),
              ControlWireTest.f(3, 500), ControlWireTest.b(5, state()))
          }
          "WalkChecked" -> {
            sequence++
            ControlWireTest.join(ControlWireTest.f(1, 1), ControlWireTest.f(3, if (wrongAck) sequence + 1 else sequence),
              ControlWireTest.b(4, state()))
          }
          "ReleaseControl" -> { if (!releaseKeepsLease) { lease = false; owner = 0 }; state() }
          "Enable" -> { enabled = true; byteArrayOf() }
          "Disable" -> { enabled = false; byteArrayOf() }
          "StandUp" -> { kind = 4; byteArrayOf() }
          "SitDown" -> { kind = 4; byteArrayOf() }
          "SetZero" -> byteArrayOf()
          "ClearMotorFault" -> { criticalFault = false; byteArrayOf() }
          "PlayGesture" -> { kind = 4; byteArrayOf() }
          "ListGestures" -> gesturesPayload
          "SetSpeedMode" -> {
            speedMode = if (request.contentEquals(ControlWireTest.f(1, 1))) 1 else 0
            byteArrayOf()
          }
          "GetSpeedMode" -> if (speedMode == 1) ControlWireTest.f(1, 1) else byteArrayOf()
          else -> throw AssertionError("Unexpected local RPC $name")
        }
        complete(response)
      }
      @Suppress("UNCHECKED_CAST")
      fun complete(response: ByteArray) {
        if (done.compareAndSet(false, true)) {
          if (name == "WalkChecked") beforeWalkAck?.invoke()
          listener.onMessage(response as RespT)
          listener.onClose(Status.OK, Metadata())
        }
      }
    }
  }
}

private fun expectFailure(code: String, block: () -> Unit) {
  try { block() } catch (error: ControlSession.Failure) {
    check(error.code == code) { "Expected $code, got ${error.code}" }; return
  }
  error("Expected $code")
}

private fun verifyTimeoutDiagnostics() {
  for (source in listOf("latch", "grpc_deadline", "logger_failure")) {
    val channel = FakeChannel()
    val session = ControlSession(channel, PRINCIPAL) { it() }
    val previousError = System.err
    val output = ByteArrayOutputStream()
    try {
      session.acquire()
      channel.dropWalkReply = source == "latch"
      channel.failWalk = source != "latch"
      System.setErr(if (source == "logger_failure") object : PrintStream(output) {
        override fun println(value: String?) { throw IllegalStateException("fixture logger failed") }
      } else PrintStream(output))
      expectFailure("timeout") { session.input(0.0, 0.0, 0.0, SystemClock.elapsedRealtime()) }
      check(channel.requests.any { it.first == "ReleaseControl" }) { "Timeout logging blocked authority cleanup" }
      check(session.status()["leaseActive"] == false)
      if (source != "logger_failure") {
        val line = output.toString("UTF-8").trim()
        val headers = if (source == "latch") "none" else "[0-9]+"
        check(Regex("DOSO_CONTROL_RPC_TIMEOUT method=WalkChecked elapsedMs=[0-9]+ source=$source headersMs=$headers messageMs=none").matches(line)) { "Unexpected timeout diagnostic: $line" }
        check(!line.contains(PRINCIPAL) && !line.contains("ephemeral-fixture"))
      }
    } finally {
      System.setErr(previousError)
      session.close()
    }
  }
  println("PASS: timeout diagnostics distinguish latch/grpc deadlines without leaking data or blocking cleanup")
}

private fun verify50HzWireBoundary() {
  val probe = ControlSession(FakeChannel(), PRINCIPAL) { it() }
  val lastSent = ControlSession::class.java.getDeclaredField("lastWireAt").apply { isAccessible = true }
  val waitForWire = ControlSession::class.java.getDeclaredMethod("waitWireInterval", Boolean::class.javaPrimitiveType).apply { isAccessible = true }
  try {
    // A pre-existing interrupt makes any attempted Thread.sleep fail immediately.
    // Fixed elapsed time proves the boundary without a wall-clock timing assertion.
    SystemClock.setTestElapsedRealtime(10_000L)
    lastSent.setLong(probe, 9_980L)
    Thread.currentThread().interrupt()
    waitForWire.invoke(probe, true)
    check(Thread.interrupted()) { "A command eligible at 20 ms must not wait" }

    lastSent.setLong(probe, 9_981L)
    Thread.currentThread().interrupt()
    val blocked = runCatching { waitForWire.invoke(probe, true) }.exceptionOrNull()
    check(blocked is InvocationTargetException && blocked.cause is InterruptedException) {
      "A command at 19 ms must still be held by the shared motion limiter"
    }
  } finally {
    Thread.interrupted()
    SystemClock.setTestElapsedRealtime(-1L)
    probe.close()
  }
  println("PASS: native motion limiter permits 20 ms and holds 19 ms (50 Hz ceiling)")
}

private fun verifyAckReceiveCooldown() {
  val channel = FakeChannel()
  val session = ControlSession(channel, PRINCIPAL) { it() }
  val lastSent = ControlSession::class.java.getDeclaredField("lastWireAt").apply { isAccessible = true }
  val lastAck = ControlSession::class.java.getDeclaredField("lastWalkAckAt").apply { isAccessible = true }
  val waitForWire = ControlSession::class.java.getDeclaredMethod("waitWireInterval", Boolean::class.javaPrimitiveType).apply { isAccessible = true }
  fun expectWait(afterAck: Boolean) {
    Thread.currentThread().interrupt()
    val blocked = runCatching { waitForWire.invoke(session, afterAck) }.exceptionOrNull()
    check(blocked is InvocationTargetException && blocked.cause is InterruptedException) { "ACK receive cooldown did not hold movement" }
    Thread.interrupted()
  }
  try {
    SystemClock.setTestElapsedRealtime(10_000L)
    channel.beforeWalkAck = { SystemClock.setTestElapsedRealtime(10_080L) }
    session.acquire()
    check(lastAck.getLong(session) == 10_080L) { "Acquire's initial zero ACK must start the same cooldown" }
    // The wire was eligible long ago, but the ACK only just arrived after an 80ms transport delay.
    lastSent.setLong(session, 10_000L)
    expectWait(true)
    SystemClock.setTestElapsedRealtime(10_099L)
    expectWait(true)
    SystemClock.setTestElapsedRealtime(10_100L)
    Thread.currentThread().interrupt()
    waitForWire.invoke(session, true)
    check(Thread.interrupted()) { "ACK age 20ms should be eligible without another sleep" }

    SystemClock.setTestElapsedRealtime(10_080L)
    Thread.currentThread().interrupt()
    waitForWire.invoke(session, false)
    check(Thread.interrupted()) { "Safety cleanup must not acquire a new ACK cooldown" }
    val movementCount = channel.requests.count { it.first == "WalkChecked" }
    session.haltImmediately()
    expectFailure("not_armed") { session.input(.1, 0.0, 0.0, 10_080L) }
    check(channel.requests.count { it.first == "WalkChecked" } == movementCount) { "Cancellation during cooldown must not dispatch movement" }
  } finally {
    Thread.interrupted(); channel.beforeWalkAck = null
    SystemClock.setTestElapsedRealtime(-1L); session.close()
  }
  println("PASS: successful ACK receive cooldown includes initial zero, 80ms ACK, 19/20ms boundary and immediate cancellation/cleanup")
}

private fun verifyOriginalInputDeadline() {
  for (scenario in listOf("source_age", "future", "negative", "dispatch_age", "fresh")) {
    SystemClock.setTestElapsedRealtime(10_140L)
    val channel = FakeChannel()
    val session = ControlSession(channel, PRINCIPAL) { it() }
    try {
      session.acquire()
      val before = channel.requests.size
      val sampledAt = when (scenario) {
        "future" -> 10_200L
        "negative" -> -1L
        "dispatch_age" -> 10_000L
        "fresh" -> 10_020L
        else -> 10_000L
      }
      // A source check at 140 ms does not erase a later 40 ms bridge delay.
      SystemClock.setTestElapsedRealtime(if (scenario == "source_age") 10_180L else 10_140L)
      if (scenario == "dispatch_age") channel.beforeWalkCall = { SystemClock.setTestElapsedRealtime(10_180L) }
      if (scenario == "fresh") {
        session.input(.1, 0.0, 0.0, sampledAt)
        check(channel.requests.size == before + 1)
      } else {
        expectFailure("stale_input") { session.input(.1, 0.0, 0.0, sampledAt) }
        val rejected = ControlWire.walk("ephemeral-fixture", 2, .1, 0.0, 0.0)
        check(channel.requests.drop(before).none { it.first == "WalkChecked" && it.second.contentEquals(rejected) }) {
          "A rejected source sample reached the wire in $scenario"
        }
        check(session.status()["leaseActive"] == false)
      }
    } finally {
      channel.beforeWalkCall = null
      session.close()
      SystemClock.setTestElapsedRealtime(-1L)
    }
  }
  println("PASS: source timestamps survive queues; stale/future/negative and delayed dispatch cannot send movement")
}

private fun verifyCalibrationFaultGestureAndSpeedMode() {
  // SetZero: requires Grounded and no active lease/yunzhuo/fault.
  val groundedChannel = FakeChannel().apply { kind = 1; enabled = false }
  val zeroSession = ControlSession(groundedChannel, PRINCIPAL) { it() }
  try {
    zeroSession.action("set-zero", null)
    check(groundedChannel.requests.count { it.first == "SetZero" } == 1)
    groundedChannel.kind = 2 // Standing rejects set-zero
    expectFailure("precondition") { zeroSession.setZero() }
    check(groundedChannel.requests.count { it.first == "SetZero" } == 1)
  } finally { zeroSession.close() }

  // ClearMotorFault: exempts criticalMotorFault and supports clear-all or specific joint IDs.
  val faultChannel = FakeChannel().apply { kind = 1; enabled = false; criticalFault = true }
  val faultSession = ControlSession(faultChannel, PRINCIPAL) { it() }
  try {
    val cleared = faultSession.action("clear-motor-fault", null)
    @Suppress("UNCHECKED_CAST")
    val clearedStatus = cleared["status"] as Map<String, Any>
    check(faultChannel.requests.count { it.first == "ClearMotorFault" } == 1)
    check(faultChannel.requests.last { it.first == "ClearMotorFault" }.second.isEmpty())
    check(clearedStatus["criticalMotorFault"] == false)
    faultSession.clearMotorFault(listOf(0, 5))
    check(faultChannel.requests.last { it.first == "ClearMotorFault" }.second.contentEquals(ControlWire.clearFaultRequest(intArrayOf(0, 5))))
    expectFailure("config") { faultSession.action("clear-motor-fault", "bad") }
    expectFailure("config") { faultSession.clearMotorFault(listOf(16)) }
    faultChannel.owner = 2 // yunzhuo still blocks
    expectFailure("precondition") { faultSession.action("clear-motor-fault", null) }
  } finally { faultSession.close() }

  // Gestures & SpeedMode
  val gestureItem = ControlWireTest.join(ControlWireTest.text(1, "bow"), ControlWireTest.text(2, "鞠躬"), ControlWireTest.f(3, 1800))
  val gestureChannel = FakeChannel().apply {
    kind = 2; enabled = true
    gesturesPayload = ControlWireTest.b(1, gestureItem)
  }
  val gestureSession = ControlSession(gestureChannel, PRINCIPAL) { it() }
  try {
    @Suppress("UNCHECKED_CAST")
    val list = gestureSession.listGestures()["gestures"] as List<Map<String, Any>>
    check(list.size == 1 && list[0]["name"] == "bow" && list[0]["durationMs"] == 1800)
    gestureSession.action("play-gesture", "bow")
    check(gestureChannel.requests.last { it.first == "PlayGesture" }.second.contentEquals(ControlWire.stringRequest("bow")))
    expectFailure("precondition") { gestureSession.action("play-gesture", "bow") } // now kind == 4 (transitioning)
    gestureChannel.kind = 1 // grounded cannot play gesture
    expectFailure("precondition") { gestureSession.playGesture("bow") }
    gestureChannel.kind = 2
    expectFailure("config") { gestureSession.action("play-gesture", "") }
    expectFailure("config") { gestureSession.action("play-gesture", " ") }
    gestureChannel.kind = 2
    check(gestureSession.getSpeedMode()["speedMode"] == "normal")
    check(gestureSession.setSpeedMode("high")["speedMode"] == "high")
    check(gestureSession.getSpeedMode()["speedMode"] == "high")
    expectFailure("config") { gestureSession.setSpeedMode("invalid") }
  } finally { gestureSession.close() }

  println("PASS: native setZero, clearMotorFault exemption, listGestures/playGesture and speedMode")
}

fun main() {
  val catalogChannel = FakeChannel()
  val catalog = ControlSession(catalogChannel, PRINCIPAL) { it() }
  try {
    check((catalog.initialStatus()["profile"] as Map<*, *>)["current"] == "flat")
    catalogChannel.profileCurrent = "stairs"
    catalogChannel.profileAvailable = listOf("flat", "stairs")
    val stamp = ControlSession::class.java.getDeclaredField("profileReadAt").apply { isAccessible = true }
    stamp.set(catalog, SystemClock.elapsedRealtime() - 2001L)
    check((catalog.status()["profile"] as Map<*, *>)["current"] == "stairs")
    catalog.acquire()
    val before = catalogChannel.requests.count { it.first == "GetProfile" }
    stamp.set(catalog, SystemClock.elapsedRealtime() - 2001L)
    catalog.status()
    check(catalogChannel.requests.count { it.first == "GetProfile" } == before)
    catalog.input(1.0, -1.0, 1.0, SystemClock.elapsedRealtime())
    try { catalog.input(3.01, 0.0, 0.0, SystemClock.elapsedRealtime()); error("Protocol bound accepted") }
    catch (failure: ControlSession.Failure) { check(failure.code == "config") }
  } finally { catalog.close() }
  println("PASS: fresh idle catalog, no profile RPC while armed, deployed velocity range")
  verifyTimeoutDiagnostics()
  verifyOriginalInputDeadline()
  verify50HzWireBoundary()
  verifyAckReceiveCooldown()
  verifyCalibrationFaultGestureAndSpeedMode()
  val channel = FakeChannel()
  val cleanup = ConcurrentLinkedQueue<() -> Unit>()
  val session = ControlSession(channel, PRINCIPAL) { cleanup.add(it) }
  try {
    check(session.initialStatus()["principalVerified"] == false)
    val acquired = session.acquire()
    check(acquired["leaseActive"] == true && acquired["sequence"] == 1L && acquired["principalVerified"] == true)
    check(channel.requests.map { it.first } == listOf("GetControlStatus", "GetProfile", "GetControlStatus", "AcquireControl", "WalkChecked"))
    Thread.sleep(230)
    check(cleanup.isEmpty()) { "Initial neutral lease must not be treated as stale held movement" }
    channel.lease = false; channel.owner = 0
    check(session.status()["leaseActive"] == false)
    session.acquire() // Expiry does not auto-reacquire, but permits a new explicit request.
    session.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime())
    Thread.sleep(230)
    check(cleanup.size == 1) { "Active motion watchdog did not retire authority" }
    expectFailure("not_armed") { session.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime()) }
    cleanup.poll()!!.invoke()
    check(channel.requests.last().first == "ReleaseControl")
    check(!channel.lease)
    val stopped = session.status()
    check(stopped["leaseActive"] == false)
    session.acquire()
    val count = channel.requests.count { it.first == "WalkChecked" }
    expectFailure("stale_input") { session.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime() - 200) }
    check(channel.requests.count { it.first == "WalkChecked" } == count + 1) // one known neutral cleanup
    session.acquire()
    channel.wrongAck = true
    val before = channel.requests.count { it.first == "WalkChecked" }
    expectFailure("command_rejected") { session.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime()) }
    check(channel.requests.count { it.first == "WalkChecked" } == before + 1) { "Uncertain ACK must not guess another sequence" }
    check(channel.requests.last().first == "ReleaseControl")
  } finally { session.close() }

  val interrupted = FakeChannel().apply { delayStatus = true }
  val other = ControlSession(interrupted, PRINCIPAL) { it() }
  var result: Throwable? = null
  val thread = Thread { try { other.action("enable", null) } catch (error: Throwable) { result = error } }
  thread.start()
  check(interrupted.statusEntered.await(1, TimeUnit.SECONDS))
  other.haltImmediately()
  interrupted.releaseStatus.countDown()
  thread.join(1500)
  check(!thread.isAlive)
  check(result is ControlSession.Failure)
  check(interrupted.requests.none { it.first == "Enable" }) { "Cancelled status read dispatched actuator action" }
  other.close()

  val transition = FakeChannel().apply { kind = 1 }
  val posture = ControlSession(transition, PRINCIPAL) { it() }
  try {
    val actual = posture.action("stand-up", null)["status"] as Map<*, *>
    check(actual["fsmKind"] == "transitioning") { "Dispatch ACK must not claim terminal standing" }
    expectFailure("precondition") { posture.acquire() }
  } finally { posture.close() }

  val walkingChannel = FakeChannel().apply { kind = 3 }
  val walkingSession = ControlSession(walkingChannel, PRINCIPAL) { it() }
  try {
    walkingSession.acquire()
    walkingSession.interrupt()
    walkingSession.status()
    check(walkingChannel.requests.none { it.first == "StandUp" }) { "Release must not stand automatically" }
    walkingSession.action("stand-up", null)
    check(walkingChannel.requests.count { it.first == "StandUp" } == 1)
    val methods = walkingChannel.requests.map { it.first }
    check(methods.indexOf("ReleaseControl") < methods.indexOf("StandUp"))
  } finally { walkingSession.close() }

  val leasedWalking = FakeChannel().apply { kind = 3; lease = true; owner = 1 }
  val unownedWalking = ControlSession(leasedWalking, PRINCIPAL) { it() }
  try {
    expectFailure("precondition") { unownedWalking.action("stand-up", null) }
    check(leasedWalking.requests.none { it.first == "StandUp" })
  } finally { unownedWalking.close() }

  // Capture as the bridge enqueues, cancel before the worker starts, then run
  // the old queued work. This window was absent from the in-flight RPC test.
  val queuedChannel = FakeChannel()
  val queuedSession = ControlSession(queuedChannel, PRINCIPAL) { it() }
  try {
    val ticket = queuedSession.captureEpoch()
    val oldAction = { queuedSession.action("enable", null, ticket) }
    val oldAcquire = { queuedSession.acquire(ticket) }
    queuedSession.haltImmediately()
    expectFailure("cancelled") { oldAction() }
    expectFailure("cancelled") { oldAcquire() }
    expectFailure("cancelled") { queuedSession.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime(), ticket) }
    check(queuedChannel.requests.isEmpty()) { "Cancelled queued work reached the wire" }
    queuedSession.interrupt()
    queuedSession.action("enable", null)
    check(queuedChannel.requests.count { it.first == "Enable" } == 1) { "A fresh explicit intent remains usable" }
  } finally { queuedSession.close() }

  for (keepLease in listOf(false, true)) {
    val failedChannel = FakeChannel()
    val failedStop = ControlSession(failedChannel, PRINCIPAL) { it() }
    try {
      failedStop.acquire()
      failedChannel.failWalk = !keepLease
      failedChannel.failRelease = !keepLease
      failedChannel.releaseKeepsLease = keepLease
      expectFailure("stop_unconfirmed") { failedStop.interrupt() }
      check(failedStop.status()["leaseActive"] == false) { "Remote uncertainty must not retain local authority" }
      expectFailure("not_armed") { failedStop.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime()) }
      expectFailure("stop_unconfirmed") { failedStop.interrupt() } // No token is not a confirmed release.
    } finally { failedStop.close() }
  }

  val failedPreconditionChannel = FakeChannel()
  val failedPrecondition = ControlSession(failedPreconditionChannel, PRINCIPAL) { it() }
  try {
    failedPrecondition.acquire()
    failedPreconditionChannel.failWalk = true; failedPreconditionChannel.failRelease = true
    expectFailure("stop_unconfirmed") { failedPrecondition.action("disable", null) }
    check(failedPreconditionChannel.requests.none { it.first == "Disable" }) { "Unconfirmed stop continued into an actuator write" }
  } finally { failedPrecondition.close() }
  for ((kind, enabled) in listOf(3 to false, 3 to true, 0 to false, 4 to true)) {
    val unsafe = FakeChannel().apply { this.kind = kind; this.enabled = enabled }
    val guarded = ControlSession(unsafe, PRINCIPAL) { it() }
    try {
      expectFailure("precondition") { guarded.action("switch-profile", "flat") }
      check(unsafe.requests.none { it.first == "SwitchProfile" || it.first == "GetProfile" })
    } finally { guarded.close() }
  }
  for ((safeKind, safeEnabled) in listOf(1 to false, 1 to true, 2 to false, 2 to true)) {
    val safe = FakeChannel().apply { kind = safeKind; enabled = safeEnabled }
    val profile = ControlSession(safe, PRINCIPAL) { it() }
    try {
      profile.action("switch-profile", "flat")
      check(safe.requests.count { it.first == "SwitchProfile" } == 1)
      check(safe.requests.none { it.first in listOf("StandUp", "WalkChecked", "AcquireControl") })
    } finally { profile.close() }
  }
  val slots = FakeChannel().apply {
    kind = 2; enabled = true
    profileCurrent = "cts_v39_61128"
    profileAvailable = listOf("w5_89999", "cts_v39_61128")
    profileCapabilities = listOf(capability("recovery", kind = 2))
  }
  val slotSession = ControlSession(slots, PRINCIPAL) { it() }
  try {
    expectFailure("precondition") { slotSession.action("switch-profile", "stairs") }
    slotSession.action("switch-profile", "cts_v39_61128")
    check(slots.requests.single { it.first == "SwitchProfile" }.second.contentEquals(ControlWire.stringRequest("cts_v39_61128")))
    expectFailure("invalid_response") { slotSession.action("switch-profile", "w5_89999") }
    check(slots.requests.none { it.first in listOf("Enable", "Disable", "StandUp", "SitDown", "WalkChecked", "AcquireControl") })
  } finally { slotSession.close() }
  for ((flatModel, stairsModel) in listOf("w5_89999" to "cts_v39_61128", "replacement_flat" to "replacement_stairs")) {
    val modern = FakeChannel().apply {
      profileCurrent = flatModel
      profileAvailable = listOf(flatModel, stairsModel, "platform_model")
      profileCapabilities = listOf(capability("flat", flatModel), capability("stairs", stairsModel),
        capability("high_platform", "platform_model"), capability("recovery", kind = 2))
      profileActiveModeId = "flat"
    }
    val modernSession = ControlSession(modern, PRINCIPAL) { it() }
    try {
      expectFailure("precondition") { modernSession.action("switch-profile", stairsModel) }
      for ((slot, model) in listOf("stairs" to stairsModel, "high_platform" to "platform_model", "flat" to flatModel)) {
        modern.onProfileSwitch = { request ->
          check(request.contentEquals(ControlWire.stringRequest(slot))) { "Slot was translated to a model name" }
          modern.profileCurrent = model
          modern.profileActiveModeId = slot
        }
        val result = modernSession.action("switch-profile", slot)
        @Suppress("UNCHECKED_CAST") val selected = result["profile"] as Map<String, Any>
        check(selected["activeModeId"] == slot && selected["current"] == model)
      }
      check(modern.requests.count { it.first == "SwitchProfile" } == 3)
      check(modern.requests.none { it.first in listOf("Enable", "Disable", "StandUp", "SitDown", "WalkChecked", "AcquireControl") })
    } finally { modernSession.close() }
  }
  val invalidSlotCapabilities = listOf(
    listOf(capability("flat", "w5"), capability("stairs", "cts", availability = 1)),
    listOf(capability("flat", "w5"), capability("stairs", "cts", availability = 0)),
    listOf(capability("flat", "w5"), capability("stairs", kind = 2)),
    listOf(capability("flat", "w5"), capability("stairs", kind = 0)),
    listOf(capability("flat", "w5")),
    listOf(capability("flat", "w5"), capability("stairs", "cts"), capability("stairs", "other")),
    listOf(capability("flat", "w5"), capability("stairs", "cts"), capability("stairs", kind = 2)),
  )
  for (capabilities in invalidSlotCapabilities) {
    val invalid = FakeChannel().apply {
      profileAvailable = listOf("stairs") // A modern catalog cannot bypass capability checks through this legacy field.
      profileCapabilities = capabilities
    }
    val invalidSession = ControlSession(invalid, PRINCIPAL) { it() }
    try {
      expectFailure("precondition") { invalidSession.action("switch-profile", "stairs") }
      check(invalid.requests.none { it.first == "SwitchProfile" })
    } finally { invalidSession.close() }
  }
  for (wrongActive in listOf(null, "flat", "recovery")) {
    val unconfirmed = FakeChannel().apply {
      profileCurrent = "cts_model"
      profileAvailable = listOf("cts_model")
      profileCapabilities = listOf(capability("stairs", "cts_model"))
      profileActiveModeId = wrongActive
    }
    val unconfirmedSession = ControlSession(unconfirmed, PRINCIPAL) { it() }
    try {
      expectFailure("action_failed") { unconfirmedSession.action("switch-profile", "stairs") }
      check(unconfirmed.requests.count { it.first == "SwitchProfile" } == 1)
      check(unconfirmed.requests.none { it.first in listOf("Enable", "Disable", "StandUp", "SitDown", "WalkChecked", "AcquireControl") })
    } finally { unconfirmedSession.close() }
  }
  val lanPrincipal = "lan-" + "a".repeat(32) + "@dev"
  val lanChannel = FakeChannel(lanPrincipal)
  val lan = ControlSession(lanChannel, lanPrincipal, true) { it() }
  try {
    check(lan.initialStatus()["principalVerified"] == false)
    check(lanChannel.requests.none { it.first in listOf("Enable", "AcquireControl", "WalkChecked") })
    val acquired = lan.acquire()
    check(acquired["leaseOwnerMatched"] == true && acquired["principalVerified"] == false)
    check(lanChannel.requests.single { it.first == "AcquireControl" }.second.contentEquals(ControlWire.stringRequest(lanPrincipal)))
    check(lan.input(.1, 0.0, 0.0, SystemClock.elapsedRealtime())["principalVerified"] == false)
    lan.interrupt()
    check(lanChannel.devHeaders.all { it == lanPrincipal })
    check(lanChannel.requests.any { it.first == "ReleaseControl" })
  } finally { lan.close() }
  println("PASS: native lease/ACK/cancellation/stop and grounded disabled profile gate")
}
