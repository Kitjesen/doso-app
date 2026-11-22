package expo.modules.dosopointcloud

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.opengl.GLSurfaceView
import android.os.Build
import android.security.NetworkSecurityPolicy
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.Collections
import java.util.WeakHashMap

@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
class PointCloudView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  companion object {
    private val views = Collections.newSetFromMap(WeakHashMap<PointCloudView, Boolean>())
    private var appForeground = true

    fun setForeground(active: Boolean) {
      appForeground = active
      synchronized(views) { views.toList() }.forEach { view -> view.post { view.applyProps() } }
    }

    fun destroyAll() { synchronized(views) { views.toList() }.forEach { view -> view.post { view.dispose() } } }
  }

  val onStatus by EventDispatcher()
  var endpoint = ""
  var kind = 2
  var active = false
  private var attached = false
  private var disposed = false
  private var running: Triple<String, Int, Boolean>? = null
  private var emitted = ""
  private var pointCount = 0
  private var lastX = 0f
  private var lastY = 0f
  private val renderer = PointCloudRenderer { message -> post { renderingFailed(message) } }
  private val surface = GLSurfaceView(context).apply {
    setEGLContextClientVersion(2)
    preserveEGLContextOnPause = true
    setRenderer(renderer)
    renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    visibility = View.INVISIBLE
  }
  private val session: CloudSession = CloudSession(NativeCloud, { generation, points ->
    if (points.size % 3 != 0 || points.size > 3_000_000 || !points.all { it.isFinite() }) {
      post { if (session.generation == generation) renderingFailed("Invalid native point-cloud data") }
    } else {
      renderer.update(generation, points)
      surface.requestRender()
      post { if (session.generation == generation) pointCount = points.size / 3 }
    }
  }, { generation, value ->
    val state = value.substringBefore(':')
    if (state != "live") { renderer.clear(generation); surface.requestRender() }
    post { publish(generation, state, if (state == "error") value.substringAfter(':') else state) }
  })
  private val scale = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
    override fun onScale(detector: ScaleGestureDetector): Boolean {
      renderer.scale(detector.scaleFactor)
      surface.requestRender()
      return true
    }
  })

  init {
    addView(surface)
    synchronized(views) { views.add(this) }
    surface.setOnTouchListener { _, event ->
      if (event.actionMasked == MotionEvent.ACTION_DOWN) parent?.requestDisallowInterceptTouchEvent(true)
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) parent?.requestDisallowInterceptTouchEvent(false)
      scale.onTouchEvent(event)
      if (event.actionMasked == MotionEvent.ACTION_MOVE && event.pointerCount == 1 && !scale.isInProgress) {
        renderer.rotate(event.x - lastX, event.y - lastY)
        surface.requestRender()
      }
      lastX = event.x
      lastY = event.y
      true
    }
  }

  fun applyProps() {
    if (disposed) return
    val enabled = active && attached && appForeground
    val desired = Triple(endpoint, kind, enabled)
    if (running == desired) return
    running = desired
    val stopped = session.stop()
    renderer.clear(stopped)
    pointCount = 0
    surface.visibility = View.INVISIBLE
    surface.requestRender()
    if (!enabled) {
      surface.onPause()
      publish(stopped, "paused", "Point-cloud viewing paused")
      return
    }
    surface.onResume()
    if (!Build.SUPPORTED_ABIS.contains("arm64-v8a") || !NativeCloud.available()) {
      publish(stopped, "unavailable", "This build does not contain the Android ARM64 Rust point-cloud library")
      return
    }
    try {
      require(kind == 1 || kind == 2) { "Point-cloud kind must be map or scan" }
      val target = CloudEndpoint.validate(endpoint, localBuild()) { host ->
        NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted(host)
      }
      val generation = session.open(target, kind)
      renderer.clear(generation)
      surface.requestRender()
      publish(generation, "connecting", "Connecting to the robot SDK")
    } catch (error: Exception) {
      publish(stopped, "error", error.message ?: "Invalid SDK endpoint")
    }
  }

  fun dispose() {
    if (disposed) return
    disposed = true
    val generation = session.destroy()
    renderer.clear(generation)
    surface.requestRender()
    surface.visibility = View.INVISIBLE
    surface.onPause()
    synchronized(views) { views.remove(this) }
  }

  override fun onAttachedToWindow() { super.onAttachedToWindow(); attached = true; applyProps() }
  override fun onDetachedFromWindow() { attached = false; applyProps(); super.onDetachedFromWindow() }

  private fun localBuild(): Boolean = context.packageName == "com.doso.robot.qa" ||
    (context.packageName == "com.doso.robot.dev" || context.packageName == "com.doso.robot.localtest") &&
    context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

  private fun renderingFailed(message: String) {
    if (disposed) return
    val generation = session.stop()
    renderer.clear(generation)
    surface.requestRender()
    publish(generation, "error", message)
  }

  private fun publish(generation: Long, state: String, message: String) {
    if (disposed || session.generation != generation) return
    if (state != "live") pointCount = 0
    surface.visibility = if (state == "live") View.VISIBLE else View.INVISIBLE
    if (state == "live") surface.requestRender()
    val signature = "$state|$message|$pointCount"
    if (signature == emitted) return
    emitted = signature
    onStatus(mapOf("status" to state, "message" to message, "points" to pointCount))
  }
}
