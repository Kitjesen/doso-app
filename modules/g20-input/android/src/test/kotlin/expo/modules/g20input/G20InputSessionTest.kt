package expo.modules.g20input

private class Clock {
  var time = 0L
  private class Work(val due: Long, val ordinal: Int, val action: () -> Unit) { var cancelled = false }
  private val work = mutableListOf<Work>()
  private var count = 0
  fun schedule(delay: Long, action: () -> Unit): InputCancellation {
    val item = Work(time + delay, count++, action)
    work.add(item)
    return InputCancellation { item.cancelled = true }
  }
  fun advance(delta: Long) {
    val target = time + delta
    while (true) {
      val item = work.filter { !it.cancelled && it.due <= target }.minWithOrNull(compareBy<Work> { it.due }.thenBy { it.ordinal }) ?: break
      work.remove(item)
      time = item.due
      item.action()
    }
    time = target
  }
}

private class Source(private val now: () -> Long) : G20ReadOnlySource {
  lateinit var connected: () -> Unit
  lateinit var failed: (String) -> Unit
  lateinit var disconnected: () -> Unit
  var settings: ((List<Map<String, Any>>?) -> Unit)? = null
  var mode: ((String?) -> Unit)? = null
  var channels: ((IntArray?) -> Unit)? = null
  var closed = 0
  val requests = mutableListOf<String>()
  val requestTimes = mutableListOf<Pair<String, Long>>()
  var outstanding = 0
  var maximumOutstanding = 0
  private fun <T> track(operation: String, done: (T?) -> Unit): (T?) -> Unit {
    requests.add(operation); requestTimes.add(operation to now())
    outstanding++; maximumOutstanding = maxOf(maximumOutstanding, outstanding)
    var completed = false
    return { value ->
      if (!completed) { completed = true; outstanding-- }
      done(value)
    }
  }
  override fun open(connected: () -> Unit, failed: (String) -> Unit, disconnected: () -> Unit) {
    this.connected = connected; this.failed = failed; this.disconnected = disconnected
  }
  override fun readSettings(done: (List<Map<String, Any>>?) -> Unit) { settings = track("settings", done) }
  override fun readMode(done: (String?) -> Unit) { mode = track("mode", done) }
  override fun readChannels(done: (IntArray?) -> Unit) { channels = track("channels", done) }
  override fun close() { closed++; if (::disconnected.isInitialized) disconnected() }
}

private fun configuration(max: Int = 1950) = List(16) { position -> mapOf<String, Any>(
  "channelIndex" to position, "index" to position + 1, "mapping" to position + 1,
  "min" to 1050, "middle" to 1500, "max" to max, "reverse" to false
) }

private class Harness(trace: (Map<String, Any>) -> Unit = {}) {
  val clock = Clock()
  val sources = mutableListOf<Source>()
  val states = mutableListOf<Map<String, Any?>>()
  val samples = mutableListOf<Map<String, Any?>>()
  val traces = mutableListOf<Map<String, Any>>()
  val session = G20InputSession({ clock.time }, clock::schedule, {
    Source { clock.time }.also { sources.add(it) }
  }, { states.add(it) }, { samples.add(it) }, { event -> traces.add(event); trace(event) })
  val source get() = sources.last()
  private var settingsSnapshot: List<Map<String, Any>>? = configuration()
  private var modeSnapshot: String? = "USA"
  fun start(id: String = "request-1") { session.start(id); source.connected() }
  fun observe(id: String = "observation-1") { session.observe(id); source.connected() }
  fun configure(settings: List<Map<String, Any>>? = configuration(), mode: String? = "USA") {
    settingsSnapshot = settings; modeSnapshot = mode
    source.settings!!(settings); source.mode!!(mode)
  }
  fun sample(channels: IntArray = IntArray(16) { 1500 }) {
    source.channels!!(channels)
    if (session.getStatus()["status"] != "error") {
      source.settings!!(settingsSnapshot); source.mode!!(modeSnapshot)
    }
  }
  fun frame() { configure(); sample() }
  fun timedFrame(delays: List<Long>) {
    check(delays.size == 5)
    clock.advance(0)
    clock.advance(delays[0]); source.settings!!(configuration())
    val channelCount = source.requests.count { it == "channels" }
    clock.advance(delays[1]); source.mode!!("USA")
    if (source.requests.count { it == "channels" } == channelCount) {
      val last = source.requestTimes.last { it.first == "channels" }.second
      clock.advance(maxOf(0, last + G20InputSession.POLL_INTERVAL_MS - clock.time))
    }
    check(source.requests.count { it == "channels" } == channelCount + 1)
    clock.advance(delays[2]); source.channels!!(IntArray(16) { 1500 })
    clock.advance(delays[3]); source.settings!!(configuration())
    clock.advance(delays[4]); source.mode!!("USA")
  }
  val generation get() = session.getStatus()["generation"] as Long
}

private var cases = 0
private fun verify(name: String, body: () -> Unit) { body(); cases++; println("PASS: $name") }

fun main() {
  verify("initial settings may arrive after 300ms without publishing any input early") {
    val h = Harness(); h.start(); h.clock.advance(1000)
    check(h.session.getStatus()["status"] == "starting" && h.samples.isEmpty())
    h.frame()
    check(h.samples.size == 1 && h.session.isSampleFresh(h.generation, 1))
    h.clock.advance(300)
    check(h.session.getStatus()["reason"] == "read_timeout" && h.source.closed == 1)
  }
  verify("initial settings at the extended deadline remain rejected") {
    val h = Harness(); h.start(); val callback = h.source.settings!!
    h.clock.time = 2300; callback(configuration())
    check(h.session.getStatus()["reason"] == "read_timeout" && h.samples.isEmpty())
    check(h.source.closed == 1)
  }
  verify("stopping during extended initial settings prevents late input") {
    val h = Harness(); h.start(); val delayed = h.source.settings!!
    h.clock.advance(500); h.session.stop("background"); delayed(configuration()); h.clock.advance(2500)
    check(h.samples.isEmpty() && h.source.closed == 1)
    check(h.session.getStatus()["reason"] == "background")
    check(h.source.requests == listOf("settings"))
  }
  verify("raw channel data and current configuration are read sequentially, never guessed") {
    val h = Harness(); h.start()
    check(h.source.requests == listOf("settings"))
    h.source.settings!!(configuration())
    check(h.source.requests == listOf("settings", "mode"))
    h.source.mode!!("USA")
    check(h.source.requests == listOf("settings", "mode", "channels"))
    val channels = IntArray(16) { 1500 }; channels[5] = 1950
    h.sample(channels)
    channels[5] = 0
    check(h.samples.single()["channels"] == List(16) { if (it == 5) 1950 else 1500 })
    check(h.samples.single()["configurationReady"] == true)
    check(h.samples.single()["controlMode"] == "USA")
    check(h.session.getStatus()["status"] == "reading")
  }
  verify("starts the next configuration read without adding a completed-frame delay and still bounds each GET") {
    val h = Harness(); h.start(); h.frame()
    h.clock.advance(99); check(h.source.requests.size == 6)
    check(h.source.requests.count { it == "channels" } == 1)
    h.clock.advance(1); check(h.source.requests.size == 6)
    h.clock.advance(199); check(h.source.requests.size == 6)
    h.clock.advance(1); check(h.session.getStatus()["reason"] == "read_timeout")
    check(h.source.closed == 1)
  }
  verify("each frame refreshes settings and mode and snapshots changed configuration") {
    val h = Harness(); h.start(); h.frame(); h.clock.advance(100)
    h.configure(configuration(2000), "JP"); h.sample()
    check(h.samples.size == 2)
    val first = h.samples[0]["channelSettings"] as List<*>
    val second = h.samples[1]["channelSettings"] as List<*>
    check((first[0] as Map<*, *>)["max"] == 1950)
    check((second[0] as Map<*, *>)["max"] == 2000)
    check(h.samples[1]["controlMode"] == "JP")
  }
  verify("failed configuration GET still permits raw observation but never claims configuration ready") {
    val h = Harness(); h.start(); h.configure(null, null); h.sample()
    check(h.samples.single()["configurationReady"] == false)
    check(h.samples.single()["channelSettings"] == null)
    check(h.session.getStatus()["reason"] == "configuration_unavailable")
  }
  verify("UNKNOWN mode or incomplete settings cannot produce a usable configuration") {
    val h = Harness(); h.start(); h.configure(configuration().take(15), "UNKNOWN"); h.sample()
    check(h.samples.single()["configurationReady"] == false)
    check(h.samples.single()["controlMode"] == null)
  }
  verify("native freshness checks age, generation, latest sequence and monotonic rollback") {
    val h = Harness(); h.start(); h.frame(); val generation = h.generation
    check(h.session.isSampleFresh(generation, 1))
    check(!h.session.isSampleFresh(generation + 1, 1))
    check(!h.session.isSampleFresh(generation, 0))
    h.clock.time = 150; check(h.session.isSampleFresh(generation, 1))
    h.clock.time = 151; check(!h.session.isSampleFresh(generation, 1))
    h.clock.time = -1; check(!h.session.isSampleFresh(generation, 1))
  }
  verify("a delayed SDK reply cannot become fresh by stamping its late arrival time") {
    val h = Harness(); h.start(); h.configure(); h.clock.time = 151; h.sample()
    check(h.samples.single()["receivedAtMonotonicMs"] == 151L)
    check(h.samples.single()["requestStartedAtMonotonicMs"] == 0L)
    check(!h.session.isSampleFresh(h.generation, 1))
  }
  verify("only the latest sequence remains eligible") {
    val h = Harness(); h.start(); h.frame(); h.clock.advance(100); h.frame()
    check(!h.session.isSampleFresh(h.generation, 1))
    check(h.session.isSampleFresh(h.generation, 2))
  }
  verify("stop revokes ownership before SDK cleanup and ignores a late channel callback") {
    val h = Harness(); h.start(); h.configure(); val delayed = h.source.channels!!
    val generation = h.generation
    h.session.stop("background"); delayed(IntArray(16) { 1950 }); h.clock.advance(2000)
    check(h.samples.isEmpty()); check(h.source.closed == 1)
    check(h.session.getStatus()["reason"] == "background")
    check(!h.session.isSampleFresh(generation, 1))
  }
  verify("old startup and configuration callbacks cannot cross a replacement session") {
    val h = Harness(); h.session.start("old"); val old = h.source
    h.session.start("new"); old.connected()
    check(h.source.requests.isEmpty())
    h.source.connected(); val pending = h.source.settings!!
    h.session.start("newest"); pending(configuration())
    check(h.source.requests.isEmpty()); check(h.samples.isEmpty())
    check(h.session.getStatus()["requestId"] == "newest")
  }
  verify("duplicate SDK callback is consumed once") {
    val h = Harness(); h.start(); val settings = h.source.settings!!
    settings(configuration()); settings(configuration())
    check(h.source.requests == listOf("settings", "mode"))
    h.source.mode!!("USA"); val channels = h.source.channels!!
    channels(IntArray(16) { 1500 }); channels(IntArray(16) { 1950 })
    h.configure()
    check(h.samples.size == 1)
  }
  verify("missing startup callback terminates the run and late success does not restart it") {
    val h = Harness(); h.session.start("no-callback"); val source = h.source
    h.clock.advance(1500); source.connected()
    check(h.session.getStatus()["reason"] == "connect_timeout")
    check(source.closed == 1); check(source.requests.isEmpty())
  }
  verify("a connected callback at the deadline cannot beat a delayed timeout timer") {
    val before = Harness(); before.session.start("before-connected-deadline")
    before.clock.time = 1499; before.source.connected()
    check(before.source.requests == listOf("settings"))
    val h = Harness(); h.session.start("late-connected"); val source = h.source
    h.clock.time = 1500; source.connected()
    check(h.session.getStatus()["reason"] == "connect_timeout")
    check(source.closed == 1 && source.requests.isEmpty())
    h.clock.advance(1); check(h.samples.isEmpty())
    val rollback = Harness(); rollback.clock.time = 100; rollback.session.start("clock-rollback")
    rollback.clock.time = 99; rollback.source.connected()
    check(rollback.session.getStatus()["reason"] == "connect_timeout")
  }
  verify("a GET callback at the deadline cannot beat a delayed timeout timer") {
    val before = Harness(); before.start()
    before.source.settings!!(configuration()); before.clock.time = 299; before.source.mode!!("USA")
    check(before.source.requests == listOf("settings", "mode", "channels"))
    val h = Harness(); h.start(); h.source.settings!!(configuration()); val source = h.source; val delayed = source.mode!!
    h.clock.time = 300; delayed("USA")
    check(h.session.getStatus()["reason"] == "read_timeout")
    check(source.closed == 1 && source.requests == listOf("settings", "mode"))
    h.clock.advance(1); check(h.samples.isEmpty())
    val rollback = Harness(); rollback.clock.time = 100; rollback.start()
    rollback.source.settings!!(configuration()); rollback.clock.time = 99; rollback.source.mode!!("USA")
    check(rollback.session.getStatus()["reason"] == "read_timeout")
  }
  verify("a fresh restart after a delayed GET stays isolated from the expired run") {
    val h = Harness(); h.start("expired-read"); val old = h.source; val late = old.settings!!
    h.clock.time = 2300; late(configuration())
    check(h.session.getStatus()["reason"] == "read_timeout" && old.closed == 1)
    h.start("fresh-read"); h.frame(); val generation = h.generation
    late(configuration()); old.connected(); h.clock.advance(0)
    check(h.samples.size == 1 && h.session.getStatus()["requestId"] == "fresh-read")
    check(h.session.isSampleFresh(generation, 1))
  }
  verify("unsupported device and disconnected SDK are unavailable or error, never reading") {
    val h = Harness(); h.session.start("wrong-device"); h.source.failed("unsupported_device")
    check(h.session.getStatus()["status"] == "unavailable")
    h.start("g20"); h.frame(); h.source.disconnected()
    check(h.session.getStatus()["reason"] == "disconnected")
    check(!h.session.isSampleFresh(h.generation, 1))
  }
  verify("invalid or short channel payload ends input immediately") {
    for (input in listOf(IntArray(15), IntArray(16) { 3001 }, null)) {
      val h = Harness(); h.start(); h.configure(); h.source.channels!!(input)
      check(h.samples.isEmpty()); check(h.session.getStatus()["reason"] == "invalid_channels")
    }
  }
  verify("destroy forbids another source and prevents old data publication") {
    val h = Harness(); h.start(); h.configure(); val callback = h.source.channels!!
    h.session.destroy(); callback(IntArray(16) { 1500 }); h.session.start("after-destroy")
    check(h.samples.isEmpty()); check(h.sources.size == 1)
    check(h.session.getStatus()["reason"] == "destroyed")
  }
  verify("a configuration changed inside the channel GET rejects the frame and terminates the run") {
    val h = Harness(); h.start(); h.configure(); h.source.channels!!(IntArray(16) { 1500 })
    check(h.samples.isEmpty())
    h.source.settings!!(configuration(2000)); h.source.mode!!("USA")
    check(h.samples.isEmpty())
    check(h.session.getStatus()["reason"] == "configuration_changed")
    check(h.source.closed == 1)
  }
  verify("control mode changing during the frame revokes the run even when settings match") {
    val h = Harness(); h.start(); h.configure(); h.source.channels!!(IntArray(16) { 1500 })
    h.source.settings!!(configuration()); h.source.mode!!("JP")
    check(h.samples.isEmpty()); check(h.session.getStatus()["reason"] == "configuration_changed")
  }
  verify("post-read validation latency cannot renew sample freshness") {
    val h = Harness(); h.start(); h.configure(); h.source.channels!!(IntArray(16) { 1500 })
    h.clock.time = 151; h.source.settings!!(configuration()); h.source.mode!!("USA")
    check(h.samples.size == 1)
    check(!h.session.isSampleFresh(h.generation, 1))
  }
  verify("bounded diagnostics identify each timed-out GET without vendor details") {
    val operations = listOf("pre_settings", "pre_mode", "channels", "post_settings", "post_mode")
    for ((index, operation) in operations.withIndex()) {
      val h = Harness(); h.start()
      if (index > 0) h.source.settings!!(configuration())
      if (index > 1) h.source.mode!!("USA")
      if (index > 2) h.source.channels!!(IntArray(16) { 1500 })
      if (index > 3) h.source.settings!!(configuration())
      val limit = if (operation == "pre_settings") 2300L else 300L
      h.clock.advance(limit)
      val failure = h.traces.last()
      check(failure["event"] == "failure" && failure["operation"] == operation)
      check(failure["durationMs"] == limit && failure["sequence"] == 0L)
      check(failure["requestAgeMs"] == -1L)
      check(h.session.getStatus()["reason"] == "read_timeout")
    }
  }
  verify("GET timings and sample ages expose five 20ms reads without a 200ms sample cadence") {
    val h = Harness(); h.start()
    repeat(3) { h.timedFrame(List(5) { 20L }) }
    val gets = h.traces.filter { it["event"] == "get" }
    check(gets.take(5).map { it["operation"] } == listOf("pre_settings", "pre_mode", "channels", "post_settings", "post_mode"))
    check(gets.all { it["durationMs"] == 20L })
    val samples = h.traces.filter { it["event"] == "sample" }
    check(samples.map { it["requestAgeMs"] } == listOf(60L, 60L, 60L))
    check(samples.map { it["sampleGapMs"] } == listOf(-1L, 100L, 100L))
    check(h.source.requestTimes.filter { it.first == "channels" }.map { it.second } == listOf(40L, 140L, 240L))
    check(h.source.maximumOutstanding == 1)
  }
  verify("diagnostics stop after eight frames plus summary and terminal records without channel or identity data") {
    val h = Harness(); h.start("private-device-id")
    repeat(12) { h.frame(); if (it < 11) h.clock.advance(100) }
    check(h.samples.size == 12 && h.traces.size == 48)
    h.source.failed("private-vendor-error-and-path")
    check(h.traces.size == 50 && h.traces.last()["event"] == "failure")
    val keys = setOf("event", "operation", "durationMs", "sequence", "requestAgeMs", "sampleGapMs")
    val operations = setOf("connect", "idle", "cadence", "pre_settings", "pre_mode", "channels", "post_settings", "post_mode", "sample")
    val detail = h.traces.filter { it["event"] != "timing_summary" }
    check(detail.all { keys.containsAll(it.keys) && it["operation"] in operations })
    check(detail.all { event -> event.values.none { it is List<*> || it is Map<*, *> } })
    check(h.traces.count { it["event"] == "timing_summary" } == 1)
    check(!h.traces.toString().contains("private") && !h.traces.toString().contains("USA"))
    h.session.stop(); h.session.stop(); h.clock.advance(2000)
    check(h.traces.size == 50)
  }
  verify("stop diagnostics show the outstanding GET and late callbacks cannot trace or publish") {
    val h = Harness(); h.start(); h.frame(); h.clock.advance(123)
    val delayed = h.source.settings!!
    h.session.stop()
    val stopped = h.traces.last()
    check(stopped["event"] == "stopped" && stopped["operation"] == "pre_settings")
    check(stopped["durationMs"] == 123L && stopped["sequence"] == 1L && stopped["requestAgeMs"] == 123L)
    val count = h.traces.size
    delayed(configuration()); h.source.connected(); h.session.stop(); h.clock.advance(2000)
    check(h.traces.size == count && h.samples.size == 1)
  }
  verify("a throwing diagnostic callback cannot change data, lifecycle or read deadlines") {
    val h = Harness { throw IllegalStateException("private trace failure") }
    h.start(); h.frame()
    check(h.samples.size == 1 && h.session.isSampleFresh(h.generation, 1))
    h.clock.advance(300)
    check(h.session.getStatus()["reason"] == "read_timeout" && h.source.closed == 1)
  }
  verify("variable GET latency preserves channel spacing without overlaps or extra whole-frame waits") {
    val h = Harness(); h.start()
    for (delays in listOf(listOf(3L, 4L, 7L, 5L, 3L), listOf(30L, 5L, 25L, 15L, 20L), listOf(1L, 1L, 1L, 1L, 1L))) h.timedFrame(delays)
    val channels = h.source.requestTimes.filter { it.first == "channels" }.map { it.second }
    check(channels == listOf(7L, 57L, 119L))
    check(channels.zipWithNext().all { (before, after) -> after - before >= 20L })
    check(h.samples.size == 3 && h.source.maximumOutstanding == 1)
  }
  verify("cadence waits belong to their run and stop, replacement and destroy cancel them") {
    for (action in listOf("stop", "replace", "destroy")) {
      val h = Harness(); h.start(); h.frame(); h.clock.advance(0); h.configure()
      val old = h.source
      check(old.requests.count { it == "channels" } == 1)
      when (action) {
        "stop" -> h.session.stop()
        "replace" -> h.start("replacement")
        else -> h.session.destroy()
      }
      h.clock.advance(100)
      check(old.requests.count { it == "channels" } == 1)
      check(h.traces.last { it["event"] == "stopped" }["operation"] == "cadence")
    }
  }
  verify("slow post-channel validation remains stale even with precise channel cadence") {
    val h = Harness(); h.start(); h.timedFrame(List(5) { 60L })
    check(h.samples.single()["requestStartedAtMonotonicMs"] == 120L)
    check(h.samples.single()["receivedAtMonotonicMs"] == 300L)
    check(!h.session.isSampleFresh(h.generation, 1))
    check(h.traces.last { it["event"] == "sample" }["requestAgeMs"] == 180L)
  }
  verify("fast GETs target 20ms channel starts without overlapping or renewing the original request time") {
    check(G20InputSession.POLL_INTERVAL_MS == 20L)
    val h = Harness(); h.start()
    repeat(4) { h.timedFrame(List(5) { 1L }) }
    check(h.source.requestTimes.filter { it.first == "channels" }.map { it.second } == listOf(2L, 22L, 42L, 62L))
    check(h.samples.map { it["requestStartedAtMonotonicMs"] } == listOf(2L, 22L, 42L, 62L))
    check(h.samples.map { it["receivedAtMonotonicMs"] } == listOf(5L, 25L, 45L, 65L))
    check(h.source.maximumOutstanding == 1)
    h.clock.time = 213L
    check(!h.session.isSampleFresh(h.generation, 4))
  }
  verify("slow GETs lower actual input rate and never accumulate catch-up channel requests") {
    val h = Harness(); h.start()
    repeat(4) { h.timedFrame(List(5) { 10L }) }
    check(h.source.requestTimes.filter { it.first == "channels" }.map { it.second } == listOf(20L, 70L, 120L, 170L))
    check(h.source.requests == List(4) { listOf("settings", "mode", "channels", "settings", "mode") }.flatten())
    check(h.source.maximumOutstanding == 1)
    h.clock.advance(0)
    check(h.source.requests.size == 21 && h.source.requests.last() == "settings")
    h.clock.advance(299)
    check(h.source.requests.size == 21)
    h.clock.advance(1)
    check(h.session.getStatus()["reason"] == "read_timeout")
    h.clock.advance(1000)
    check(h.source.requests.size == 21 && h.samples.size == 4)
  }
  verify("timing summary aggregates beyond the trace limit once per run with fixed histograms") {
    val h = Harness(); h.start()
    repeat(12) { h.timedFrame(List(5) { 1L }) }
    check(h.traces.size == 48)
    h.session.stop()
    val summary = h.traces.single { it["event"] == "timing_summary" }
    check(summary["sampleCount"] == 12L && summary["pollIntervalMs"] == 20L)
    check(summary.keys == setOf("event", "sampleCount", "pollIntervalMs", "histogramLeMs", "channelStartGapMs", "sampleGapMs", "requestAgeMs"))
    check(summary["histogramLeMs"] == listOf(5L, 10L, 20L, 40L, 80L, 150L, 300L))
    for (key in listOf("channelStartGapMs", "sampleGapMs")) {
      val stats = summary[key] as Map<*, *>
      check(stats["count"] == 11L && stats["min"] == 20L && stats["max"] == 20L && stats["mean"] == 20.0)
      check(stats["histogram"] == listOf(0L, 0L, 11L, 0L, 0L, 0L, 0L, 0L))
    }
    val age = summary["requestAgeMs"] as Map<*, *>
    check(age["count"] == 12L && age["min"] == 3L && age["max"] == 3L && age["mean"] == 3.0)
    check(age["histogram"] == listOf(12L, 0L, 0L, 0L, 0L, 0L, 0L, 0L))
    h.session.stop(); h.session.destroy()
    check(h.traces.size == 50)
  }
  verify("observation reads only channels at 20ms and always publishes unusable configuration") {
    val h = Harness(); h.observe()
    repeat(12) { index ->
      if (index > 0) h.clock.advance(20)
      h.source.channels!!(IntArray(16) { 1500 })
    }
    check(h.source.requests == List(12) { "channels" } && h.source.maximumOutstanding == 1)
    check(h.source.requestTimes.map { it.second } == List(12) { it * 20L })
    check(h.samples.size == 12 && h.samples.all {
      it["inputMode"] == "observation" && it["channelSettings"] == null && it["controlMode"] == null && it["configurationReady"] == false
    })
    check(h.session.getStatus()["configurationReady"] == false && h.session.getStatus()["inputMode"] == "observation")
    check(h.session.isSampleFresh(h.generation, 12))
    h.session.stop()
    check(h.traces.size == 18 && h.traces.single { it["event"] == "timing_summary" }["sampleCount"] == 12L)
  }
  verify("slow observation callbacks lower the rate without overlaps, catch-up or sample-time renewal") {
    val h = Harness(); h.observe()
    repeat(4) {
      h.clock.advance(50); h.source.channels!!(IntArray(16) { 1500 }); h.clock.advance(0)
    }
    check(h.source.requestTimes.map { it.second } == listOf(0L, 50L, 100L, 150L, 200L))
    check(h.source.maximumOutstanding == 1 && h.source.requests.all { it == "channels" })
    check(h.samples.map { it["requestStartedAtMonotonicMs"] } == listOf(0L, 50L, 100L, 150L))
    check(h.samples.map { it["receivedAtMonotonicMs"] } == listOf(50L, 100L, 150L, 200L))
    h.clock.time = 301L
    check(!h.session.isSampleFresh(h.generation, 4))
    h.session.stop(); val count = h.source.requests.size; h.clock.advance(1000)
    check(h.source.requests.size == count)
  }
  verify("observation replaces a configured run without inheriting settings or accepting its late callback") {
    val h = Harness(); h.start(); h.frame(); val old = h.source; val oldGeneration = h.generation
    h.clock.advance(0); val late = old.settings!!
    h.observe(); val generation = h.generation; late(configuration(2000)); old.connected()
    check(old.closed == 1 && !h.session.isSampleFresh(oldGeneration, 1))
    check(h.source.requests == listOf("channels"))
    h.source.channels!!(IntArray(16) { 1500 })
    check(h.samples.size == 2 && h.samples.last()["generation"] == generation)
    check(h.samples.last()["channelSettings"] == null && h.samples.last()["controlMode"] == null)
    check(h.samples.last()["configurationReady"] == false)
  }
  verify("stopped observation callbacks cannot cross a restart and guarded start still requires five GETs") {
    val h = Harness(); h.observe(); val old = h.source; val late = old.channels!!
    h.session.stop("background"); h.observe("new-observation"); late(IntArray(16) { 1950 })
    check(h.samples.isEmpty() && old.closed == 1 && h.source.requests == listOf("channels"))
    val observationLate = h.source.channels!!
    h.start("guarded"); observationLate(IntArray(16) { 1950 })
    check(h.source.requests == listOf("settings") && h.samples.isEmpty())
    h.frame()
    check(h.source.requests == listOf("settings", "mode", "channels", "settings", "mode"))
    check(h.samples.single()["configurationReady"] == true && h.samples.single()["inputMode"] == "guarded")
  }
  verify("observation age uses request time and rejects callbacks at the read deadline or after destruction") {
    val h = Harness(); h.observe(); h.clock.time = 151L; h.source.channels!!(IntArray(16) { 1500 })
    check(h.samples.single()["requestStartedAtMonotonicMs"] == 0L && !h.session.isSampleFresh(h.generation, 1))
    val deadline = Harness(); deadline.observe(); val late = deadline.source.channels!!
    deadline.clock.time = 300L; late(IntArray(16) { 1500 })
    check(deadline.samples.isEmpty() && deadline.session.getStatus()["reason"] == "read_timeout")
    check(deadline.source.closed == 1)
    val destroyed = Harness(); destroyed.observe(); val destroyedLate = destroyed.source.channels!!
    destroyed.session.destroy(); destroyedLate(IntArray(16) { 1500 }); destroyed.session.observe("after-destroy")
    check(destroyed.samples.isEmpty() && destroyed.sources.size == 1 && destroyed.session.getStatus()["reason"] == "destroyed")
  }
  verify("observation cadence cancellation and duplicate or invalid callbacks retain the shared lifecycle fences") {
    val h = Harness(); h.observe(); val first = h.source.channels!!
    first(IntArray(16) { 1500 }); first(IntArray(16) { 1950 }); h.clock.advance(0)
    check(h.samples.size == 1 && h.source.requests == listOf("channels"))
    h.session.stop(); h.clock.advance(20)
    check(h.source.requests == listOf("channels"))
    val invalid = Harness(); invalid.observe(); invalid.source.channels!!(IntArray(15))
    check(invalid.samples.isEmpty() && invalid.session.getStatus()["reason"] == "invalid_channels")
    check(invalid.source.requests == listOf("channels"))
  }
  verify("latest observation is atomic, expires by request time, and cannot survive stop or guarded mode") {
    val h = Harness(); h.observe("raw")
    check(h.session.getLatestObservation("raw") == null)
    h.source.channels!!(IntArray(16) { 1500 }); h.clock.advance(20)
    h.source.channels!!(IntArray(16) { 1600 })
    val latest = h.session.getLatestObservation("raw")!!
    check(latest["sequence"] == 2L && latest["requestStartedAtMonotonicMs"] == 20L)
    check((latest["channels"] as List<*>).first() == 1600 && latest["configurationReady"] == false)
    check(h.session.getLatestObservation("other") == null && !h.session.isSampleFresh(h.generation, 1))
    h.clock.time = 170; check(h.session.getLatestObservation("raw") != null)
    h.clock.time = 171; check(h.session.getLatestObservation("raw") == null)
    h.clock.time = 19; check(h.session.getLatestObservation("raw") == null)
    h.session.stop(); check(h.session.getLatestObservation("raw") == null)
    h.start("guarded"); h.frame(); check(h.session.getLatestObservation("guarded") == null)
    h.session.destroy(); check(h.session.getLatestObservation("guarded") == null)
  }
  println("PASS: $cases G20 read-only input lifecycle cases")
}
