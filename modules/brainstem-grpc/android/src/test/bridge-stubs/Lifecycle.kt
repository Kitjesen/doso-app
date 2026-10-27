package androidx.lifecycle

class Lifecycle {
  enum class State { RESUMED; fun isAtLeast(other: State) = ordinal >= other.ordinal }
  val currentState = State.RESUMED
}
interface LifecycleOwner { val lifecycle: Lifecycle }
