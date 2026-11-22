package android.os

object Build {
  object VERSION {
    var SDK_INT: Int = 33
  }

  object VERSION_CODES {
    const val P = 28
    const val Q = 29
    const val TIRAMISU = 33
    const val UPSIDE_DOWN_CAKE = 34
  }
}

class Looper {
  data class DelayedTask(val runnable: Runnable, val delayMs: Long)

  val delayedTasks = mutableListOf<DelayedTask>()
  val recordedDelays = mutableListOf<Long>()

  fun reset() {
    delayedTasks.clear()
    recordedDelays.clear()
  }

  fun runNextDelayed(): Boolean {
    if (delayedTasks.isEmpty()) return false
    val task = delayedTasks.removeAt(0)
    task.runnable.run()
    return true
  }

  companion object {
    val main = Looper()
    fun getMainLooper(): Looper = main
  }
}

class Handler(private val looper: Looper) {
  fun post(runnable: Runnable): Boolean {
    runnable.run()
    return true
  }

  fun postDelayed(runnable: Runnable, delayMillis: Long): Boolean {
    looper.recordedDelays.add(delayMillis)
    looper.delayedTasks.add(Looper.DelayedTask(runnable, delayMillis))
    return true
  }

  fun removeCallbacks(runnable: Runnable) {
    looper.delayedTasks.removeAll { it.runnable === runnable }
  }
}
