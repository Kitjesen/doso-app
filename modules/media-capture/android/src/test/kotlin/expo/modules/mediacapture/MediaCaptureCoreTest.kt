package expo.modules.mediacapture

import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicInteger

fun main() {
  assertTrue(MediaCaptureCore.sanitizeMediaFileName("DOSO_SNAP_01.jpg", "mp4") == "DOSO_SNAP_01.jpg", "keeps valid jpg filename")
  assertTrue(MediaCaptureCore.sanitizeMediaFileName("../evil.mp4", "mp4").endsWith(".mp4"), "strips traversal")
  assertTrue(MediaCaptureCore.sanitizeMediaFileName("bad/name.jpg", "jpg").endsWith(".jpg"), "strips slash")

  assertTrue(MediaCaptureCore.evenDimension(1081) == 1080, "clamps odd dimension down to even")
  assertTrue(MediaCaptureCore.evenDimension(1) == 2, "clamps tiny dimension to 2")
  assertTrue(MediaCaptureCore.normalizeRotation(270) == 270, "preserves 270")
  assertTrue(MediaCaptureCore.normalizeRotation(-90) == 270, "normalizes negative angle")
  assertTrue(MediaCaptureCore.normalizeRotation(45) == 0, "falls back non-quadrant to 0")

  // 2x2 I420: Y=[1,2,3,4], U=[10], V=[20]
  val y = ByteBuffer.wrap(byteArrayOf(1, 2, 3, 4))
  val u = ByteBuffer.wrap(byteArrayOf(10))
  val v = ByteBuffer.wrap(byteArrayOf(20))

  val nv21 = MediaCaptureCore.packI420ToNv21(y, 2, u, 1, v, 1, 2, 2)
  assertBytesEqual(nv21, byteArrayOf(1, 2, 3, 4, 20, 10), "nv21 interleaved V,U")

  val nv12Dest = ByteBuffer.allocate(6)
  val nv12Written = MediaCaptureCore.packI420ToSemiPlanarNv12(y, 2, u, 1, v, 1, 2, 2, nv12Dest)
  assertTrue(nv12Written == 6, "nv12 written byte count")
  assertBytesEqual(nv12Dest.array(), byteArrayOf(1, 2, 3, 4, 10, 20), "nv12 interleaved U,V")

  val planarDest = ByteBuffer.allocate(6)
  val planarWritten = MediaCaptureCore.packI420ToPlanar(y, 2, u, 1, v, 1, 2, 2, planarDest)
  assertTrue(planarWritten == 6, "planar written byte count")
  assertBytesEqual(planarDest.array(), byteArrayOf(1, 2, 3, 4, 10, 20), "planar Y,U,V")

  val gate = RecordingSlotGate<String>()
  val s1 = "session-1"
  val s2 = "session-2"
  assertTrue(gate.tryAcquire(s1), "acquires empty slot")
  assertTrue(!gate.tryAcquire(s2), "rejects concurrent session")
  assertTrue(gate.current() == s1, "returns current session")
  gate.release(s2)
  assertTrue(gate.current() == s1, "ignores unrelated release")
  assertTrue(gate.takeCurrent() == s1, "takes current session")
  assertTrue(gate.current() == null, "slot cleared after take")

  println("PASS: media capture core")
}

private fun assertTrue(cond: Boolean, message: String) {
  if (!cond) throw AssertionError(message)
}

private fun assertBytesEqual(actual: ByteArray, expected: ByteArray, message: String) {
  if (!actual.contentEquals(expected)) {
    throw AssertionError("$message: expected=${expected.contentToString()} actual=${actual.contentToString()}")
  }
}
