package expo.modules.dosopointcloud

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

internal interface CloudSource {
  fun start(endpoint: String, kind: Int): Long
  fun poll(handle: Long): FloatArray?
  fun status(handle: Long): String
  fun stop(handle: Long)
}

internal class CloudSession(
  private val source: CloudSource,
  private val onFrame: (Long, FloatArray) -> Unit,
  private val onStatus: (Long, String) -> Unit,
  private val worker: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor(),
) {
  private val version = AtomicLong()
  private var handle = 0L
  @Volatile private var destroyed = false
  val generation: Long get() = version.get()

  fun open(endpoint: String, kind: Int): Long {
    val current = version.incrementAndGet()
    worker.execute {
      closeHandle()
      if (destroyed || generation != current) return@execute
      try {
        handle = source.start(endpoint, kind)
        check(handle != 0L) { "Rust SDK could not start the point-cloud session" }
        read(current)
      } catch (error: Exception) {
        closeHandle()
        if (generation == current) onStatus(current, "error:${error.message ?: "Point-cloud session failed"}")
      }
    }
    return current
  }

  fun stop(): Long {
    val current = version.incrementAndGet()
    if (!destroyed) worker.execute { closeHandle() }
    return current
  }

  fun destroy(): Long {
    val current = version.incrementAndGet()
    if (!destroyed) {
      destroyed = true
      worker.execute { closeHandle(); worker.shutdown() }
    }
    return current
  }

  private fun read(current: Long) {
    if (destroyed || generation != current || handle == 0L) return
    try {
      val frame = source.poll(handle)
      val status = source.status(handle)
      if (generation != current || destroyed) return
      if (status == "live" && frame != null) onFrame(current, frame)
      onStatus(current, status)
      if (status == "ended" || status.startsWith("error:")) {
        closeHandle()
        return
      }
      worker.schedule({ read(current) }, 100, TimeUnit.MILLISECONDS)
    } catch (error: Exception) {
      closeHandle()
      if (generation == current && !destroyed) onStatus(current, "error:${error.message ?: "Point-cloud read failed"}")
    }
  }

  private fun closeHandle() {
    if (handle != 0L) {
      val previous = handle
      handle = 0L
      source.stop(previous)
    }
  }
}
