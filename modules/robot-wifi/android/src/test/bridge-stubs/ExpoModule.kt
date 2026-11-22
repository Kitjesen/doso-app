package expo.modules.kotlin.modules

import expo.modules.kotlin.functions.Queues

class AppContext {
  var reactContext: android.content.Context? = android.content.Context()
}

open class Module {
  val appContext = AppContext()
  open fun definition() = ModuleDefinition {}
}

class AsyncComponent {
  fun runOnQueue(queue: Queues) = this
}

class Definition {
  val functions = mutableMapOf<String, Any>()
  var moduleName: String? = null
  var destroy: (() -> Unit)? = null

  fun Name(name: String) {
    moduleName = name
  }

  fun <T : Any> AsyncFunction(name: String, body: T): AsyncComponent {
    functions[name] = body
    return AsyncComponent()
  }

  fun OnDestroy(body: () -> Unit) {
    destroy = body
  }
}

fun ModuleDefinition(body: Definition.() -> Unit) = Definition().apply(body)
