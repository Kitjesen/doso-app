package expo.modules.kotlin.modules

import expo.modules.kotlin.functions.Queues

class AppContext {
  var currentActivity: android.app.Activity? = android.app.Activity()
  val reactContext = android.content.Context()
}
open class Module { val appContext = AppContext(); open fun definition() = ModuleDefinition {} }
class AsyncComponent { fun runOnQueue(queue: Queues) = this }
class Definition {
  val functions = mutableMapOf<String, Any>()
  lateinit var foreground: () -> Unit
  lateinit var background: () -> Unit
  lateinit var destroy: () -> Unit
  fun Name(name: String) {}
  fun Constants(body: () -> Map<String, Any?>) { body() }
  fun <T : Any> AsyncFunction(name: String, body: T): AsyncComponent { functions[name] = body; return AsyncComponent() }
  fun OnActivityEntersForeground(body: () -> Unit) { foreground = body }
  fun OnActivityEntersBackground(body: () -> Unit) { background = body }
  fun OnDestroy(body: () -> Unit) { destroy = body }
}
fun ModuleDefinition(body: Definition.() -> Unit) = Definition().apply(body)
