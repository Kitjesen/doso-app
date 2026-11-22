package expo.modules.kotlin

interface Promise {
  fun resolve(value: Any?)
  fun reject(code: String, message: String, cause: Throwable?)
}
