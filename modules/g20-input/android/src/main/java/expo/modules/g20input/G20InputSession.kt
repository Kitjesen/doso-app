package expo.modules.g20input

/** SDK-independent lifecycle, tested without loading vendor/native code. */
internal fun interface InputCancellation { fun cancel() }

internal interface G20ReadOnlySource {
  fun open(connected: () -> Unit, failed: (String) -> Unit, disconnected: () -> Unit)
  fun readSettings(done: (List<Map<String, Any>>?) -> Unit)
  fun readMode(done: (String?) -> Unit)
  fun readChannels(done: (IntArray?) -> Unit)
  fun close()
}

internal class G20InputSession(
  private val now: () -> Long,
  private val schedule: (Long, () -> Unit) -> InputCancellation,
  private val sourceFactory: () -> G20ReadOnlySource,
  private val emitState: (Map<String, Any?>) -> Unit,
  private val emitSample: (Map<String, Any?>) -> Unit,
  private val trace: (Map<String, Any>) -> Unit = {}
) {
  companion object {
    // Target 20 ms between request starts; five serial GETs may lower the actual input rate.
    const val POLL_INTERVAL_MS = 20L
    const val READ_TIMEOUT_MS = 300L
    const val INITIAL_SETTINGS_TIMEOUT_MS = 2300L
    const val CONNECT_TIMEOUT_MS = 1500L
    const val MAX_SAMPLE_AGE_MS = 150L
    private const val TRACE_FRAME_LIMIT = 8L
    private val HISTOGRAM_LE_MS = longArrayOf(5, 10, 20, 40, 80, 150, 300)
  }

  private class Timing {
    private var count = 0L
    private var total = 0.0
    private var minimum = Long.MAX_VALUE
    private var maximum = 0L
    private val histogram = LongArray(HISTOGRAM_LE_MS.size + 1)
    fun add(milliseconds: Long) {
      if (milliseconds < 0) return
      count++
      total += milliseconds
      minimum = minOf(minimum, milliseconds)
      maximum = maxOf(maximum, milliseconds)
      val bucket = HISTOGRAM_LE_MS.indexOfFirst { milliseconds <= it }
      histogram[if (bucket < 0) histogram.lastIndex else bucket]++
    }
    fun snapshot(): Map<String, Any> = mapOf(
      "count" to count, "min" to if (count == 0L) -1L else minimum,
      "max" to if (count == 0L) -1L else maximum, "mean" to if (count == 0L) -1.0 else total / count,
      "histogram" to histogram.toList()
    )
  }

  private class Run(val id: String, val generation: Long, val source: G20ReadOnlySource, val observationOnly: Boolean) {
    var timer: InputCancellation? = null
    var pending: Any? = null
    var sequence = 0L
    var sampleRequestedAt: Long? = null
    var channelRequestedAt: Long? = null
    var settings: List<Map<String, Any>>? = null
    var mode: String? = null
    var operation = "connect"
    var operationStartedAt = 0L
    var lastSampleAt: Long? = null
    var latestObservation: Map<String, Any?>? = null
    val channelStartGap = Timing()
    val sampleGap = Timing()
    val requestAge = Timing()
  }

  private var active: Run? = null
  private var generation = 0L
  private var destroyed = false
  private var state: Map<String, Any?> = mapOf(
    "requestId" to null, "generation" to 0L, "status" to "stopped", "reason" to null,
    "sequence" to 0L, "configurationReady" to false, "inputMode" to null
  )

  @Synchronized fun getStatus(): Map<String, Any?> = state.toMap()

  /** Observe the current slot atomically; queued notifications never lend freshness to old values. */
  @Synchronized fun getLatestObservation(requestId: String): Map<String, Any?>? {
    val run = active ?: return null
    if (!run.observationOnly || run.id != requestId || !isSampleFresh(run.generation, run.sequence)) return null
    return run.latestObservation?.toMap()
  }

  @Synchronized fun start(requestId: String): Map<String, Any?> = startRun(requestId, false)

  /** Channel-only observation never verifies calibration or authorizes control. */
  @Synchronized fun observe(requestId: String): Map<String, Any?> = startRun(requestId, true)

  private fun startRun(requestId: String, observationOnly: Boolean): Map<String, Any?> {
    require(requestId.matches(Regex("[A-Za-z0-9_-]{1,80}"))) { "Invalid input request identifier" }
    retire("stopped", "replaced")
    if (destroyed) return publish(null, requestId, "error", "destroyed")
    val source = try { sourceFactory() } catch (_: Exception) {
      return publish(null, requestId, "unavailable", "sdk_unavailable")
    } catch (_: LinkageError) {
      return publish(null, requestId, "unavailable", "sdk_unavailable")
    }
    val run = Run(requestId, generation, source, observationOnly)
    run.operationStartedAt = now()
    active = run
    publish(run, requestId, "starting", null)
    val ticket = Any()
    run.pending = ticket
    run.timer = schedule(CONNECT_TIMEOUT_MS) {
      synchronized(this) { if (owns(run, ticket)) fail(run, "connect_timeout") }
    }
    try {
      source.open(
        connected = {
          synchronized(this) {
            if (owns(run, ticket)) {
              val current = now()
              if (current < run.operationStartedAt || current - run.operationStartedAt >= CONNECT_TIMEOUT_MS) {
                fail(run, "connect_timeout")
              } else {
                complete(run)
                readFrame(run)
              }
            }
          }
        },
        failed = { reason -> synchronized(this) { if (active === run) fail(run, reason) } },
        disconnected = { synchronized(this) { if (active === run) fail(run, "disconnected") } }
      )
    } catch (_: Exception) { if (active === run) fail(run, "sdk_unavailable")
    } catch (_: LinkageError) { if (active === run) fail(run, "sdk_unavailable") }
    return getStatus()
  }

  @Synchronized fun stop(reason: String = "stopped"): Map<String, Any?> {
    retire("stopped", reason)
    return getStatus()
  }

  @Synchronized fun destroy() {
    destroyed = true
    retire("stopped", "destroyed")
  }

  /** Reject queued JS events using the native monotonic clock and current session ownership. */
  @Synchronized fun isSampleFresh(sampleGeneration: Long, sequence: Long): Boolean {
    val run = active ?: return false
    val requestedAt = run.sampleRequestedAt ?: return false
    val current = now()
    return run.generation == sampleGeneration && run.sequence == sequence && sequence > 0
      && state["status"] == "reading" && current >= requestedAt && current - requestedAt <= MAX_SAMPLE_AGE_MS
  }

  private fun owns(run: Run, ticket: Any) = !destroyed && active === run && run.pending === ticket

  private fun complete(run: Run) {
    run.timer?.cancel()
    run.timer = null
    run.pending = null
    run.operation = "idle"
    run.operationStartedAt = now()
  }

  private fun recordTrace(event: Map<String, Any>) {
    try { trace(event) } catch (_: Throwable) { /* Diagnostics must not change input ownership or timing gates. */ }
  }

  private fun <T> read(run: Run, operation: String, request: ((T?) -> Unit) -> Unit, consume: (T?) -> Unit) {
    if (active !== run || destroyed) return
    check(run.pending == null)
    val ticket = Any()
    val startedAt = now()
    val timeout = if (operation == "pre_settings" && run.sequence == 0L && run.channelRequestedAt == null)
      INITIAL_SETTINGS_TIMEOUT_MS else READ_TIMEOUT_MS
    run.operation = operation
    run.operationStartedAt = startedAt
    run.pending = ticket
    run.timer = schedule(timeout) {
      synchronized(this) { if (owns(run, ticket)) fail(run, "read_timeout") }
    }
    try {
      request { result ->
        synchronized(this) {
          if (owns(run, ticket)) {
            val current = now()
            if (current < startedAt || current - startedAt >= timeout) {
              fail(run, "read_timeout")
              return@synchronized
            }
            complete(run)
            if (run.sequence < TRACE_FRAME_LIMIT) recordTrace(mapOf(
              "event" to "get", "operation" to operation, "durationMs" to now() - startedAt, "sequence" to run.sequence
            ))
            if (active !== run || destroyed) return@synchronized
            consume(result)
          }
        }
      }
    } catch (_: Exception) { if (owns(run, ticket)) fail(run, "read_failed")
    } catch (_: LinkageError) { if (owns(run, ticket)) fail(run, "sdk_unavailable") }
  }

  private fun readConfiguration(run: Run, afterChannels: Boolean = false, consume: (List<Map<String, Any>>?, String?) -> Unit) {
    read<List<Map<String, Any>>>(run, if (afterChannels) "post_settings" else "pre_settings", run.source::readSettings) { settings ->
      val snapshot = settings?.takeIf { it.size == 16 }?.map { it.toMap() }
      read<String>(run, if (afterChannels) "post_mode" else "pre_mode", run.source::readMode) { mode ->
        consume(snapshot, mode?.takeUnless { it == "UNKNOWN" })
      }
    }
  }

  private fun readFrame(run: Run) {
    // Guarded input brackets each channel GET; observation never supplies a configuration.
    fun readWithConfiguration(settings: List<Map<String, Any>>?, mode: String?) {
      fun requestChannels() {
        if (active !== run || destroyed) return
        run.timer = null
        val requestedAt = now()
        run.channelRequestedAt?.let { run.channelStartGap.add(requestedAt - it) }
        run.channelRequestedAt = requestedAt
        read<IntArray>(run, "channels", run.source::readChannels) { values ->
          if (values == null || values.size < 16 || values.take(16).any { it !in 0..3000 }) {
            fail(run, "invalid_channels")
          } else {
            val channels = values.take(16)
            fun publishVerified(afterSettings: List<Map<String, Any>>?, afterMode: String?) {
              if (settings != afterSettings || mode != afterMode) {
                fail(run, "configuration_changed")
                return
              }
              run.settings = settings
              run.mode = mode
              run.sequence++
              run.sampleRequestedAt = requestedAt
              val sampledAt = now()
              run.requestAge.add(sampledAt - requestedAt)
              run.lastSampleAt?.let { run.sampleGap.add(sampledAt - it) }
              if (run.sequence <= TRACE_FRAME_LIMIT) recordTrace(mapOf(
                "event" to "sample", "operation" to "sample", "sequence" to run.sequence,
                "requestAgeMs" to sampledAt - requestedAt, "sampleGapMs" to (run.lastSampleAt?.let { sampledAt - it } ?: -1L)
              ))
              run.lastSampleAt = sampledAt
              if (active !== run || destroyed) return
              val ready = !run.observationOnly && run.settings != null && run.mode != null
              publish(run, run.id, "reading", if (run.observationOnly) "observation_only" else if (ready) null else "configuration_unavailable")
              val sample = mapOf(
                "requestId" to run.id, "generation" to run.generation, "sequence" to run.sequence,
                "receivedAtMonotonicMs" to now(), "requestStartedAtMonotonicMs" to requestedAt,
                "channels" to channels, "channelSettings" to run.settings,
                "controlMode" to run.mode, "configurationReady" to ready,
                "inputMode" to if (run.observationOnly) "observation" else "guarded"
              )
              if (run.observationOnly) run.latestObservation = sample
              emitSample(sample)
              if (active === run) run.timer = schedule(0) {
                synchronized(this) {
                  if (active === run && !destroyed) {
                    run.timer = null
                    readFrame(run)
                  }
                }
              }
            }
            if (run.observationOnly) publishVerified(null, null)
            else readConfiguration(run, true, ::publishVerified)
          }
        }
      }
      val wait = run.channelRequestedAt?.let { maxOf(0L, it + POLL_INTERVAL_MS - now()) } ?: 0L
      if (wait == 0L) requestChannels() else {
        run.operation = "cadence"
        run.operationStartedAt = now()
        run.timer = schedule(wait) {
          synchronized(this) { if (active === run && !destroyed) requestChannels() }
        }
      }
    }
    if (run.observationOnly) readWithConfiguration(null, null)
    else readConfiguration(run, consume = ::readWithConfiguration)
  }

  private fun fail(run: Run, reason: String) {
    if (active !== run) return
    retire(if (reason == "unsupported_device" || reason == "unsupported_abi") "unavailable" else "error", reason)
  }

  private fun retire(status: String, reason: String) {
    val previous = active
    active = null
    generation++
    previous?.timer?.cancel()
    previous?.pending = null
    // Five GETs plus one sample for eight frames, summary and terminal: at most 50 records per run.
    if (previous != null) {
      recordTrace(mapOf(
        "event" to "timing_summary", "sampleCount" to previous.sequence, "pollIntervalMs" to POLL_INTERVAL_MS,
        "histogramLeMs" to HISTOGRAM_LE_MS.toList(), "channelStartGapMs" to previous.channelStartGap.snapshot(),
        "sampleGapMs" to previous.sampleGap.snapshot(), "requestAgeMs" to previous.requestAge.snapshot()
      ))
      recordTrace(mapOf(
        "event" to if (status == "error" || status == "unavailable") "failure" else "stopped",
        "operation" to previous.operation, "durationMs" to now() - previous.operationStartedAt,
        "sequence" to previous.sequence, "requestAgeMs" to (previous.sampleRequestedAt?.let { now() - it } ?: -1L)
      ))
    }
    // Revoke ownership before vendor cleanup: its synchronous disconnect callback is now stale.
    try { previous?.source?.close() } catch (_: Exception) {} catch (_: LinkageError) {}
    publish(null, previous?.id ?: state["requestId"] as? String, status, reason)
  }

  private fun publish(run: Run?, id: String?, status: String, reason: String?): Map<String, Any?> {
    state = mapOf(
      "requestId" to id, "generation" to (run?.generation ?: generation),
      "status" to status, "reason" to reason, "sequence" to (run?.sequence ?: 0L),
      "configurationReady" to (run != null && !run.observationOnly && run.settings != null && run.mode != null),
      "inputMode" to run?.let { if (it.observationOnly) "observation" else "guarded" }
    )
    emitState(state.toMap())
    return state.toMap()
  }
}
