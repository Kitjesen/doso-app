package expo.modules.mediacapture

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import com.facebook.react.bridge.ReactContext
import com.oney.WebRTCModule.DosoWebRtcTrackLookup
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoTrack
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

internal data class SnapshotOutput(
  val fileName: String,
  val width: Int,
  val height: Int,
  val bytes: Long,
  val uriString: String,
  val locationLabel: String,
)

internal data class RecordingOutput(
  val fileName: String,
  val durationMs: Long,
  val bytes: Long,
  val mimeType: String,
  val uriString: String,
  val locationLabel: String,
)

internal object AndroidWebRtcCapture {
  private const val SNAPSHOT_TIMEOUT_MS = 2500L

  fun captureSnapshot(
    reactContext: ReactContext,
    pcId: Int,
    trackId: String,
    streamUrl: String,
    fileName: String,
    rotationDegrees: Int,
  ): SnapshotOutput {
    val videoTrack = DosoWebRtcTrackLookup.resolveVideoTrack(reactContext, pcId, trackId, streamUrl)
      ?: throw IllegalStateException("当前未找到正在播放的 WebRTC 视频轨")

    var nv21Bytes: ByteArray? = null
    var srcWidth = 0
    var srcHeight = 0
    var frameRotation = 0
    val captured = AtomicBoolean(false)
    val latch = CountDownLatch(1)

    val sink = VideoSink { frame ->
      if (!captured.compareAndSet(false, true)) return@VideoSink
      var i420: VideoFrame.I420Buffer? = null
      try {
        i420 = frame.buffer.toI420()
        if (i420 != null && i420.width > 0 && i420.height > 0) {
          nv21Bytes = MediaCaptureCore.packI420ToNv21(
            i420.dataY,
            i420.strideY,
            i420.dataU,
            i420.strideU,
            i420.dataV,
            i420.strideV,
            i420.width,
            i420.height,
          )
          srcWidth = i420.width
          srcHeight = i420.height
          frameRotation = frame.rotation
        }
      } finally {
        i420?.release()
        latch.countDown()
      }
    }

    videoTrack.addSink(sink)
    try {
      if (!latch.await(SNAPSHOT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
        throw IllegalStateException("等待实时视频帧超时，无法抓拍")
      }
    } finally {
      try {
        videoTrack.removeSink(sink)
      } catch (_: Throwable) {
      }
    }

    val yuv = nv21Bytes ?: throw IllegalStateException("当前视频帧无效，无法抓拍")
    if (srcWidth <= 0 || srcHeight <= 0) {
      throw IllegalStateException("视频分辨率无效，无法抓拍")
    }

    val jpegStream = ByteArrayOutputStream()
    val yuvImage = YuvImage(yuv, ImageFormat.NV21, srcWidth, srcHeight, null)
    if (!yuvImage.compressToJpeg(Rect(0, 0, srcWidth, srcHeight), 92, jpegStream)) {
      throw IllegalStateException("抓拍图像编码失败")
    }
    var finalJpeg = jpegStream.toByteArray()
    var finalWidth = srcWidth
    var finalHeight = srcHeight

    val totalRotation = MediaCaptureCore.normalizeRotation(frameRotation + rotationDegrees)
    if (totalRotation != 0) {
      val sourceBitmap = BitmapFactory.decodeByteArray(finalJpeg, 0, finalJpeg.size)
      if (sourceBitmap != null) {
        val matrix = Matrix().apply { postRotate(totalRotation.toFloat()) }
        val rotatedBitmap = Bitmap.createBitmap(
          sourceBitmap,
          0,
          0,
          sourceBitmap.width,
          sourceBitmap.height,
          matrix,
          true,
        )
        try {
          val rotatedOut = ByteArrayOutputStream()
          rotatedBitmap.compress(Bitmap.CompressFormat.JPEG, 92, rotatedOut)
          finalJpeg = rotatedOut.toByteArray()
          finalWidth = rotatedBitmap.width
          finalHeight = rotatedBitmap.height
        } finally {
          if (rotatedBitmap !== sourceBitmap) rotatedBitmap.recycle()
          sourceBitmap.recycle()
        }
      }
    }

    val saved = AndroidMediaStoreWriter.saveJpeg(reactContext, fileName, finalJpeg)
    return SnapshotOutput(
      fileName = saved.fileName,
      width = finalWidth,
      height = finalHeight,
      bytes = saved.bytes,
      uriString = saved.uriString,
      locationLabel = saved.locationLabel,
    )
  }
}

internal class ActiveWebRtcRecording private constructor(
  private val context: Context,
  private val videoTrack: VideoTrack,
  private val fileName: String,
  private val rotationDegrees: Int,
  private val tempFile: File,
) {
  private val lock = Any()
  private val stopping = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)
  private val pendingFrames = AtomicInteger(0)
  private val handlerThread = HandlerThread("doso-webrtc-recorder").apply { start() }
  private val handler = Handler(handlerThread.looper)

  private var codec: MediaCodec? = null
  private var muxer: MediaMuxer? = null
  private var muxerStarted = false
  private var trackIndex = -1
  private var useSemiPlanar = true
  private var configuredWidth = 0
  private var configuredHeight = 0
  private var framesWritten = 0
  private var startNs = 0L
  private var lastPtsUs = -1L
  private var encoderFailed: Throwable? = null

  private val sink = VideoSink { frame ->
    if (stopping.get() || cancelled.get() || encoderFailed != null) return@VideoSink
    if (pendingFrames.incrementAndGet() > 3) {
      pendingFrames.decrementAndGet()
      return@VideoSink
    }
    frame.retain()
    val posted = handler.post {
      try {
        encodeFrame(frame)
      } catch (error: Throwable) {
        if (encoderFailed == null) encoderFailed = error
      } finally {
        pendingFrames.decrementAndGet()
        frame.release()
      }
    }
    if (!posted) {
      pendingFrames.decrementAndGet()
      frame.release()
    }
  }

  private fun selectAvcColorFormat(codecInfo: MediaCodecInfo): Int {
    val caps = codecInfo.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC)
    val supported = caps.colorFormats
    if (supported.contains(MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar)) {
      useSemiPlanar = true
      return MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
    }
    if (supported.contains(MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar)) {
      useSemiPlanar = false
      return MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar
    }
    useSemiPlanar = true
    return MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
  }

  private fun createAvcEncoder(width: Int, height: Int): MediaCodec {
    val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
    for (info in list.codecInfos) {
      if (!info.isEncoder) continue
      if (!info.supportedTypes.any { it.equals(MediaFormat.MIMETYPE_VIDEO_AVC, ignoreCase = true) }) continue
      val colorFormat = selectAvcColorFormat(info)
      val candidate = MediaCodec.createByCodecName(info.name)
      try {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
          setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat)
          val bitRate = (width.toLong() * height.toLong() * 4L).coerceIn(2_000_000L, 8_000_000L).toInt()
          setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
          setInteger(MediaFormat.KEY_FRAME_RATE, 24)
          setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        candidate.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        candidate.start()
        return candidate
      } catch (_: Throwable) {
        try {
          candidate.release()
        } catch (_: Throwable) {
        }
      }
    }
    throw IllegalStateException("设备缺少可用的 H.264 视频编码器")
  }

  private fun initializePipeline(frame: VideoFrame) {
    val width = MediaCaptureCore.evenDimension(frame.buffer.width)
    val height = MediaCaptureCore.evenDimension(frame.buffer.height)
    configuredWidth = width
    configuredHeight = height
    startNs = SystemClock.elapsedRealtimeNanos()
    val totalRotation = MediaCaptureCore.normalizeRotation(frame.rotation + rotationDegrees)
    codec = createAvcEncoder(width, height)
    muxer = MediaMuxer(tempFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4).apply {
      setOrientationHint(totalRotation)
    }
  }

  private fun drainEncoder(endOfStream: Boolean) {
    val activeCodec = codec ?: return
    val activeMuxer = muxer ?: return
    val bufferInfo = MediaCodec.BufferInfo()
    val timeoutUs = if (endOfStream) 10_000L else 0L
    while (true) {
      val outputIndex = activeCodec.dequeueOutputBuffer(bufferInfo, timeoutUs)
      when {
        outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) break
        }
        outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (muxerStarted) continue
          trackIndex = activeMuxer.addTrack(activeCodec.outputFormat)
          activeMuxer.start()
          muxerStarted = true
        }
        outputIndex >= 0 -> {
          val encodedData = activeCodec.getOutputBuffer(outputIndex)
          if (encodedData != null && bufferInfo.size > 0 && (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0 && muxerStarted) {
            encodedData.position(bufferInfo.offset)
            encodedData.limit(bufferInfo.offset + bufferInfo.size)
            activeMuxer.writeSampleData(trackIndex, encodedData, bufferInfo)
            framesWritten += 1
          }
          activeCodec.releaseOutputBuffer(outputIndex, false)
          if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
            break
          }
        }
      }
    }
  }

  private fun encodeFrame(frame: VideoFrame) {
    if (stopping.get() || cancelled.get()) return
    if (codec == null) {
      initializePipeline(frame)
    }
    val activeCodec = codec ?: return
    val i420 = frame.buffer.toI420() ?: return
    try {
      val frameW = MediaCaptureCore.evenDimension(i420.width)
      val frameH = MediaCaptureCore.evenDimension(i420.height)
      if (frameW != configuredWidth || frameH != configuredHeight) {
        return
      }
      val inputIndex = activeCodec.dequeueInputBuffer(10_000L)
      if (inputIndex >= 0) {
        val inputBuffer: ByteBuffer? = activeCodec.getInputBuffer(inputIndex)
        if (inputBuffer != null) {
          inputBuffer.clear()
          val bytesWritten = if (useSemiPlanar) {
            MediaCaptureCore.packI420ToSemiPlanarNv12(
              i420.dataY,
              i420.strideY,
              i420.dataU,
              i420.strideU,
              i420.dataV,
              i420.strideV,
              configuredWidth,
              configuredHeight,
              inputBuffer,
            )
          } else {
            MediaCaptureCore.packI420ToPlanar(
              i420.dataY,
              i420.strideY,
              i420.dataU,
              i420.strideU,
              i420.dataV,
              i420.strideV,
              configuredWidth,
              configuredHeight,
              inputBuffer,
            )
          }
          val nowPtsUs = maxOf(lastPtsUs + 1L, (SystemClock.elapsedRealtimeNanos() - startNs) / 1000L)
          lastPtsUs = nowPtsUs
          activeCodec.queueInputBuffer(inputIndex, 0, bytesWritten, nowPtsUs, 0)
        }
      }
      drainEncoder(false)
    } finally {
      i420.release()
    }
  }

  private fun finalizePipelineOnHandler(discard: Boolean) {
    try {
      if (!discard) {
        val activeCodec = codec
        if (activeCodec != null) {
          val inputIndex = activeCodec.dequeueInputBuffer(50_000L)
          if (inputIndex >= 0) {
            val ptsUs = maxOf(0L, lastPtsUs + 1L)
            activeCodec.queueInputBuffer(inputIndex, 0, 0, ptsUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            drainEncoder(true)
          }
        }
      }
    } catch (error: Throwable) {
      if (encoderFailed == null) encoderFailed = error
    } finally {
      try {
        codec?.stop()
      } catch (_: Throwable) {
      }
      try {
        codec?.release()
      } catch (_: Throwable) {
      }
      codec = null
      try {
        if (muxerStarted) muxer?.stop()
      } catch (_: Throwable) {
      }
      try {
        muxer?.release()
      } catch (_: Throwable) {
      }
      muxer = null
    }
  }

  fun stopAndSave(): RecordingOutput {
    if (!stopping.compareAndSet(false, true)) {
      throw IllegalStateException("录屏正在停止中")
    }
    val latch = CountDownLatch(1)
    try {
      videoTrack.removeSink(sink)
    } catch (_: Throwable) {
    }
    if (handler.post {
      try {
        finalizePipelineOnHandler(discard = cancelled.get())
      } finally {
        latch.countDown()
      }
    }) {
      latch.await(4000, TimeUnit.MILLISECONDS)
    }
    handlerThread.quitSafely()

    try {
      encoderFailed?.let { throw it }
      if (cancelled.get() || !muxerStarted || framesWritten <= 0 || !tempFile.exists() || tempFile.length() <= 0L) {
        throw IllegalStateException("未采集到足够视频帧，录屏未生成有效文件")
      }
      val durationMs = if (lastPtsUs > 0L) lastPtsUs / 1000L else 0L
      val saved = AndroidMediaStoreWriter.saveMp4FromFile(context, fileName, tempFile)
      return RecordingOutput(
        fileName = saved.fileName,
        durationMs = durationMs,
        bytes = saved.bytes,
        mimeType = "video/mp4",
        uriString = saved.uriString,
        locationLabel = saved.locationLabel,
      )
    } finally {
      try {
        if (tempFile.exists()) tempFile.delete()
      } catch (_: Throwable) {
      }
    }
  }

  fun cancelAndDiscard() {
    cancelled.set(true)
    if (!stopping.compareAndSet(false, true)) return
    val latch = CountDownLatch(1)
    try {
      videoTrack.removeSink(sink)
    } catch (_: Throwable) {
    }
    if (handler.post {
      try {
        finalizePipelineOnHandler(discard = true)
      } finally {
        latch.countDown()
      }
    }) {
      latch.await(2000, TimeUnit.MILLISECONDS)
    }
    handlerThread.quitSafely()
    try {
      if (tempFile.exists()) tempFile.delete()
    } catch (_: Throwable) {
    }
  }

  companion object {
    fun start(
      reactContext: ReactContext,
      pcId: Int,
      trackId: String,
      streamUrl: String,
      fileName: String,
      rotationDegrees: Int,
    ): ActiveWebRtcRecording {
      val videoTrack = DosoWebRtcTrackLookup.resolveVideoTrack(reactContext, pcId, trackId, streamUrl)
        ?: throw IllegalStateException("当前未找到正在播放的 WebRTC 视频轨")
      val tempFile = File(reactContext.cacheDir, "doso_rec_${System.nanoTime()}.mp4")
      val session = ActiveWebRtcRecording(reactContext, videoTrack, fileName, rotationDegrees, tempFile)
      videoTrack.addSink(session.sink)
      return session
    }
  }
}
