package expo.modules.mediacapture

import com.facebook.react.bridge.ReactContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class MediaCaptureModule : Module() {
  private val sessionGate = RecordingSlotGate<ActiveWebRtcRecording>()
  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("DosoMediaCapture")

    AsyncFunction("captureSnapshot") { pcId: Int, trackId: String, streamUrl: String, fileName: String, rotationDegrees: Int ->
      val reactContext = appContext.reactContext as? ReactContext
        ?: throw IllegalStateException("React 上下文未就绪，无法抓拍")
      val result = AndroidWebRtcCapture.captureSnapshot(
        reactContext = reactContext,
        pcId = pcId,
        trackId = trackId,
        streamUrl = streamUrl,
        fileName = fileName,
        rotationDegrees = rotationDegrees,
      )
      mapOf(
        "fileName" to result.fileName,
        "width" to result.width,
        "height" to result.height,
        "bytes" to result.bytes,
        "uri" to result.uriString,
        "locationLabel" to result.locationLabel,
      )
    }

    AsyncFunction("startRecording") { pcId: Int, trackId: String, streamUrl: String, fileName: String, rotationDegrees: Int ->
      val reactContext = appContext.reactContext as? ReactContext
        ?: throw IllegalStateException("React 上下文未就绪，无法开始录屏")
      if (sessionGate.current() != null) {
        throw IllegalStateException("当前已在录制视频中")
      }
      val safeName = MediaCaptureCore.sanitizeMediaFileName(fileName, "mp4")
      val session = ActiveWebRtcRecording.start(
        reactContext = reactContext,
        pcId = pcId,
        trackId = trackId,
        streamUrl = streamUrl,
        fileName = safeName,
        rotationDegrees = rotationDegrees,
      )
      if (!sessionGate.tryAcquire(session)) {
        session.cancelAndDiscard()
        throw IllegalStateException("当前已在录制视频中")
      }
      mapOf(
        "fileName" to safeName,
        "mimeType" to "video/mp4",
      )
    }

    AsyncFunction("stopRecording") {
      val session = sessionGate.takeCurrent()
        ?: throw IllegalStateException("当前没有进行中的录屏任务")
      val saved = session.stopAndSave()
      mapOf(
        "fileName" to saved.fileName,
        "durationMs" to saved.durationMs,
        "bytes" to saved.bytes,
        "mimeType" to saved.mimeType,
        "uri" to saved.uriString,
        "locationLabel" to saved.locationLabel,
      )
    }

    AsyncFunction("cancelRecording") {
      sessionGate.takeCurrent()?.cancelAndDiscard()
    }

    OnActivityEntersBackground {
      val pending = sessionGate.takeCurrent() ?: return@OnActivityEntersBackground
      executor.execute {
        try {
          pending.stopAndSave()
        } catch (_: Throwable) {
          pending.cancelAndDiscard()
        }
      }
    }

    OnDestroy {
      sessionGate.takeCurrent()?.cancelAndDiscard()
      executor.shutdownNow()
    }
  }
}
