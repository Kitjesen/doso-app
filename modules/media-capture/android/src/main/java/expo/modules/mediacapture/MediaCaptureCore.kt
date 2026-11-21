package expo.modules.mediacapture

import java.nio.ByteBuffer

internal object MediaCaptureCore {
  private val SAFE_NAME_RE = Regex("^[A-Za-z0-9._-]+\\.(jpg|jpeg|mp4)$")

  fun sanitizeMediaFileName(raw: String, fallbackExt: String): String {
    val ext = if (fallbackExt.equals("jpg", ignoreCase = true) || fallbackExt.equals("jpeg", ignoreCase = true)) {
      "jpg"
    } else {
      "mp4"
    }
    val trimmed = raw.trim()
    if (trimmed.isEmpty() || trimmed.length > 96 || trimmed.contains("..") || !SAFE_NAME_RE.matches(trimmed)) {
      return "DOSO_${System.currentTimeMillis()}.$ext"
    }
    return trimmed
  }

  fun evenDimension(value: Int): Int {
    if (value <= 2) return 2
    return value and 1.inv()
  }

  fun normalizeRotation(degrees: Int): Int {
    val mod = ((degrees % 360) + 360) % 360
    return when (mod) {
      90, 180, 270 -> mod
      else -> 0
    }
  }

  /**
   * Converts I420 planes to Android NV21 (Y plane followed by interleaved V, U bytes).
   */
  fun packI420ToNv21(
    y: ByteBuffer,
    strideY: Int,
    u: ByteBuffer,
    strideU: Int,
    v: ByteBuffer,
    strideV: Int,
    width: Int,
    height: Int,
  ): ByteArray {
    require(width > 0 && height > 0) { "Dimensions must be positive" }
    val out = ByteArray(width * height + 2 * ((width + 1) / 2) * ((height + 1) / 2))
    val yDup = y.duplicate()
    val uDup = u.duplicate()
    val vDup = v.duplicate()

    var dst = 0
    for (row in 0 until height) {
      yDup.position(row * strideY)
      yDup.get(out, dst, width)
      dst += width
    }

    val chromaWidth = (width + 1) / 2
    val chromaHeight = (height + 1) / 2
    for (row in 0 until chromaHeight) {
      val uRow = row * strideU
      val vRow = row * strideV
      for (col in 0 until chromaWidth) {
        out[dst++] = vDup.get(vRow + col)
        out[dst++] = uDup.get(uRow + col)
      }
    }
    return out
  }

  /**
   * Writes I420 into NV12 (YUV420SemiPlanar: Y then interleaved U, V) directly into target buffer.
   */
  fun packI420ToSemiPlanarNv12(
    y: ByteBuffer,
    strideY: Int,
    u: ByteBuffer,
    strideU: Int,
    v: ByteBuffer,
    strideV: Int,
    width: Int,
    height: Int,
    dest: ByteBuffer,
  ): Int {
    val w = evenDimension(width)
    val h = evenDimension(height)
    val required = w * h * 3 / 2
    require(dest.remaining() >= required) { "Destination buffer too small for NV12 frame" }

    val yDup = y.duplicate()
    val uDup = u.duplicate()
    val vDup = v.duplicate()
    val rowBuf = ByteArray(w)
    for (row in 0 until h) {
      yDup.position(row * strideY)
      yDup.get(rowBuf, 0, w)
      dest.put(rowBuf, 0, w)
    }

    val chromaW = w / 2
    val chromaH = h / 2
    val uvRowBuf = ByteArray(w)
    for (row in 0 until chromaH) {
      val uRow = row * strideU
      val vRow = row * strideV
      for (col in 0 until chromaW) {
        uvRowBuf[col * 2] = uDup.get(uRow + col)
        uvRowBuf[col * 2 + 1] = vDup.get(vRow + col)
      }
      dest.put(uvRowBuf, 0, w)
    }
    return required
  }

  /**
   * Writes I420 planar (YUV420Planar: Y then U then V) directly into target buffer.
   */
  fun packI420ToPlanar(
    y: ByteBuffer,
    strideY: Int,
    u: ByteBuffer,
    strideU: Int,
    v: ByteBuffer,
    strideV: Int,
    width: Int,
    height: Int,
    dest: ByteBuffer,
  ): Int {
    val w = evenDimension(width)
    val h = evenDimension(height)
    val required = w * h * 3 / 2
    require(dest.remaining() >= required) { "Destination buffer too small for I420 frame" }

    val yDup = y.duplicate()
    val uDup = u.duplicate()
    val vDup = v.duplicate()
    val rowBuf = ByteArray(w)
    for (row in 0 until h) {
      yDup.position(row * strideY)
      yDup.get(rowBuf, 0, w)
      dest.put(rowBuf, 0, w)
    }

    val chromaW = w / 2
    val chromaH = h / 2
    val cRowBuf = ByteArray(chromaW)
    for (row in 0 until chromaH) {
      uDup.position(row * strideU)
      uDup.get(cRowBuf, 0, chromaW)
      dest.put(cRowBuf, 0, chromaW)
    }
    for (row in 0 until chromaH) {
      vDup.position(row * strideV)
      vDup.get(cRowBuf, 0, chromaW)
      dest.put(cRowBuf, 0, chromaW)
    }
    return required
  }
}

internal class RecordingSlotGate<T : Any> {
  private val lock = Any()
  private var active: T? = null

  fun tryAcquire(session: T): Boolean = synchronized(lock) {
    if (active != null) return false
    active = session
    true
  }

  fun current(): T? = synchronized(lock) { active }

  fun takeCurrent(): T? = synchronized(lock) {
    val current = active
    active = null
    current
  }

  fun release(session: T) {
    synchronized(lock) {
      if (active === session) {
        active = null
      }
    }
  }
}
