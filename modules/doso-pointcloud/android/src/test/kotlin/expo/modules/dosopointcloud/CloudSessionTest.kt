package expo.modules.dosopointcloud

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

private fun await(latch: CountDownLatch) { check(latch.await(3, TimeUnit.SECONDS)) { "Timed out waiting for native session" } }

fun main() {
  val entered = CountDownLatch(1)
  val release = CountDownLatch(1)
  val closed = CountDownLatch(1)
  val secondFrame = CountDownLatch(1)
  val events = mutableListOf<Float>()
  val source = object : CloudSource {
    var next = 0L
    override fun start(endpoint: String, kind: Int): Long = ++next
    override fun poll(handle: Long): FloatArray {
      if (handle == 1L) { entered.countDown(); await(release) }
      return floatArrayOf(handle.toFloat(), 0f, 0f)
    }
    override fun status(handle: Long) = "live"
    override fun stop(handle: Long) { if (handle == 2L) closed.countDown() }
  }
  val session = CloudSession(source, { _, values -> synchronized(events) { events.add(values[0]) }; secondFrame.countDown() }, { _, _ -> })
  session.open("http://127.0.0.1:5052", 2)
  await(entered)
  session.open("http://127.0.0.1:5053", 1)
  release.countDown()
  await(secondFrame)
  check(synchronized(events) { events.all { it == 2f } }) { "Prior target frame was delivered" }
  session.destroy()
  await(closed)
  session.destroy()

  val failed = CountDownLatch(1)
  val failure = CloudSession(object : CloudSource {
    override fun start(endpoint: String, kind: Int): Long = error("fixture transport unavailable")
    override fun poll(handle: Long): FloatArray? = null
    override fun status(handle: Long) = "waiting"
    override fun stop(handle: Long) = Unit
  }, { _, _ -> error("No frame expected on failed connection") }, { _, status -> if (status.startsWith("error:")) failed.countDown() })
  failure.open("https://fixture.invalid", 2)
  await(failed)
  failure.destroy()

  check(CloudEndpoint.validate("https://robot.example:5052", false) { false } == "https://robot.example:5052")
  check(CloudEndpoint.validate("http://192.168.66.64:5052", true) { true } == "http://192.168.66.64:5052")
  val rejected = listOf("http://192.168.66.64:5052", "http://8.8.8.8:5052", "http://10.0.0.1.invalid:5052",
    "http://user@10.0.0.1:5052", "http://10.0.0.1:5052/path", "https://robot.example:0", "https://robot.example?token=x")
  for ((index, endpoint) in rejected.withIndex()) {
    check(runCatching { CloudEndpoint.validate(endpoint, index != 0) { true } }.isFailure) { "Accepted unsafe endpoint $endpoint" }
  }
  check(runCatching { CloudEndpoint.validate("http://10.0.0.1:5052", true) { false } }.isFailure)
  println("PASS: point-cloud target replacement, cancellation, source errors and native endpoint policy")
}
