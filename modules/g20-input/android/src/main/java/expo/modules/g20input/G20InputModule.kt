package expo.modules.g20input

import android.os.SystemClock
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class G20InputModule : Module() {
  private val scheduler = Executors.newSingleThreadScheduledExecutor()
  private var destroyed = false
  private var paused = false
  private val session = G20InputSession(
    now = { SystemClock.elapsedRealtime() },
    schedule = { delay, block ->
      val future = scheduler.schedule({ block() }, delay, TimeUnit.MILLISECONDS)
      InputCancellation { future.cancel(false) }
    },
    sourceFactory = {
      val context = appContext.reactContext ?: throw IllegalStateException("No React context")
      SkydroidG20Source(context, now = { SystemClock.elapsedRealtime() },
        trace = { event -> Log.i("DOSO_G20_INPUT", event.entries.joinToString(" ") { (key, value) -> "$key=$value" }) })
    },
    emitState = { if (!destroyed) sendEvent("onState", it) },
    emitSample = { if (!destroyed) sendEvent("onSample", it) },
    trace = { event -> Log.i("DOSO_G20_INPUT", event.entries.joinToString(" ") { (key, value) -> "$key=$value" }) }
  )

  override fun definition() = ModuleDefinition {
    Name("DosoG20Input")
    Events("onState", "onSample")

    AsyncFunction("start") { requestId: String ->
      if (destroyed || paused || !isForeground()) session.stop("background")
      else session.start(requestId)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("observe") { requestId: String ->
      if (destroyed || paused || !isForeground()) session.stop("background")
      else session.observe(requestId)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stop") { session.stop() }.runOnQueue(Queues.MAIN)
    Function("getStatus") { session.getStatus() }
    Function("getLatestObservation") { requestId: String ->
      if (destroyed || paused || !isForeground()) null else session.getLatestObservation(requestId)
    }
    Function("isSampleFresh") { generation: Long, sequence: Long ->
      !destroyed && !paused && isForeground() && session.isSampleFresh(generation, sequence)
    }
    Function("captureInputFence") {
      if (!destroyed && !paused && isForeground() && session.getStatus()["status"] == "reading"
        && session.getStatus()["configurationReady"] == true)
        SystemClock.elapsedRealtime() else null
    }

    OnActivityEntersForeground { paused = false }
    OnActivityEntersBackground {
      paused = true
      session.stop("background")
    }
    OnDestroy {
      destroyed = true
      session.destroy()
      scheduler.shutdownNow()
    }
  }

  private fun isForeground(): Boolean {
    val owner = appContext.currentActivity as? LifecycleOwner ?: return false
    return owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
  }
}
