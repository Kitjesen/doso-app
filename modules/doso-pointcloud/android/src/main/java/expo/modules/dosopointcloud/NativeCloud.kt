package expo.modules.dosopointcloud

internal object NativeCloud : CloudSource {
  private val loadFailure = runCatching { System.loadLibrary("doso_sdk_android") }.exceptionOrNull()

  fun available(): Boolean = loadFailure == null

  external override fun start(endpoint: String, kind: Int): Long
  external override fun poll(handle: Long): FloatArray?
  external override fun status(handle: Long): String
  external override fun stop(handle: Long)
}
