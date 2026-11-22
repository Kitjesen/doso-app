package expo.modules.dosopointcloud

import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

internal class PointCloudRenderer(private val onError: (String) -> Unit) : GLSurfaceView.Renderer {
  private data class Frame(val generation: Long, val points: FloatArray)
  private val generation = AtomicLong()
  private val resets = AtomicLong()
  private val frameLock = Any()
  private val pending = AtomicReference<Frame?>()
  private var vertices: FloatBuffer? = null
  private var count = 0
  private var program = 0
  private var width = 1
  private var height = 1
  private var center = floatArrayOf(0f, 0f, 0f)
  private var radius = 1f
  private var fitted = false
  private var appliedReset = -1L
  @Volatile private var yaw = -0.8f
  @Volatile private var pitch = 0.65f
  @Volatile private var zoom = 1f

  fun clear(current: Long) {
    synchronized(frameLock) {
      if (current < generation.get()) return
      generation.set(current)
      resets.incrementAndGet()
      pending.set(Frame(current, floatArrayOf()))
    }
  }

  fun update(current: Long, points: FloatArray) {
    synchronized(frameLock) {
      if (generation.get() == current) {
        if (points.isEmpty()) resets.incrementAndGet()
        pending.set(Frame(current, points))
      }
    }
  }

  fun rotate(dx: Float, dy: Float) {
    yaw += dx * 0.008f
    pitch = (pitch + dy * 0.008f).coerceIn(0.05f, 1.5f)
  }

  fun scale(factor: Float) { zoom = (zoom * factor).coerceIn(0.1f, 30f) }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0.035f, 0.05f, 0.075f, 1f)
    GLES20.glEnable(GLES20.GL_DEPTH_TEST)
    try {
      val vertex = shader(GLES20.GL_VERTEX_SHADER, "attribute vec3 position; uniform mat4 matrix; varying float shade; void main(){ gl_Position=matrix*vec4(position,1.0); gl_PointSize=3.0; shade=0.5+0.5*sin(position.z*0.6); }")
      val fragment = shader(GLES20.GL_FRAGMENT_SHADER, "precision mediump float; varying float shade; void main(){ gl_FragColor=vec4(0.15+shade*0.3,0.65+shade*0.3,1.0-shade*0.25,1.0); }")
      program = GLES20.glCreateProgram()
      GLES20.glAttachShader(program, vertex)
      GLES20.glAttachShader(program, fragment)
      GLES20.glLinkProgram(program)
      GLES20.glDeleteShader(vertex)
      GLES20.glDeleteShader(fragment)
      val linked = IntArray(1)
      GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0)
      check(linked[0] != 0) { GLES20.glGetProgramInfoLog(program) }
    } catch (error: RuntimeException) {
      program = 0
      onError(error.message ?: "Point-cloud renderer is unavailable")
    }
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    this.width = max(1, width)
    this.height = max(1, height)
    GLES20.glViewport(0, 0, width, height)
  }

  override fun onDrawFrame(gl: GL10?) {
    val reset = resets.get()
    if (appliedReset != reset) { count = 0; fitted = false; appliedReset = reset }
    pending.getAndSet(null)?.let { frame ->
      if (frame.generation == generation.get()) {
        count = frame.points.size / 3
        if (count == 0) {
          vertices = null
          fitted = false
        } else {
          if (!fitted) fit(frame.points)
          if ((vertices?.capacity() ?: 0) < frame.points.size) {
            vertices = ByteBuffer.allocateDirect(frame.points.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
          }
          vertices!!.apply { clear(); put(frame.points); flip() }
        }
      }
    }
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
    val buffer = vertices ?: return
    if (program == 0 || count == 0) return
    val aspect = width.toFloat() / height
    val distance = radius * 3f / minOf(1f, aspect).coerceAtLeast(0.2f) / zoom
    val view = FloatArray(16)
    val projection = FloatArray(16)
    val matrix = FloatArray(16)
    Matrix.setLookAtM(view, 0, center[0] + cos(yaw) * cos(pitch) * distance,
      center[1] + sin(yaw) * cos(pitch) * distance, center[2] + sin(pitch) * distance,
      center[0], center[1], center[2], 0f, 0f, 1f)
    Matrix.perspectiveM(projection, 0, 55f, aspect, max(0.001f, distance / 1000f), max(100f, radius * 100f))
    Matrix.multiplyMM(matrix, 0, projection, 0, view, 0)
    GLES20.glUseProgram(program)
    GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(program, "matrix"), 1, false, matrix, 0)
    val position = GLES20.glGetAttribLocation(program, "position")
    GLES20.glEnableVertexAttribArray(position)
    GLES20.glVertexAttribPointer(position, 3, GLES20.GL_FLOAT, false, 0, buffer)
    GLES20.glDrawArrays(GLES20.GL_POINTS, 0, count)
    GLES20.glDisableVertexAttribArray(position)
  }

  private fun fit(points: FloatArray) {
    val minimum = floatArrayOf(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
    val maximum = floatArrayOf(Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY)
    for (i in points.indices step 3) for (axis in 0..2) {
      minimum[axis] = minOf(minimum[axis], points[i + axis])
      maximum[axis] = maxOf(maximum[axis], points[i + axis])
    }
    center = FloatArray(3) { minimum[it] + (maximum[it] - minimum[it]) / 2f }
    radius = max(0.5f, (0..2).maxOf { maximum[it] - minimum[it] } / 2f)
    zoom = 1f
    fitted = true
  }

  private fun shader(type: Int, text: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, text)
    GLES20.glCompileShader(shader)
    val compiled = IntArray(1)
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
    if (compiled[0] == 0) {
      val log = GLES20.glGetShaderInfoLog(shader)
      GLES20.glDeleteShader(shader)
      error(log)
    }
    return shader
  }
}
