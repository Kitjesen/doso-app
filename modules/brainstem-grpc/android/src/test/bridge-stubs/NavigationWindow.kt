package android.view

data class NavigationInsets(val bottom: Int)

class WindowInsets(var stableBottom: Int = 72) {
  object Type { fun navigationBars() = 2 }
  fun getInsetsIgnoringVisibility(type: Int): NavigationInsets {
    check(type == Type.navigationBars())
    return NavigationInsets(stableBottom)
  }
}

class WindowInsetsController {
  var systemBarsBehavior = 0
  var navigationHidden = false
  val changes = mutableListOf<Pair<String, Int>>()
  fun hide(type: Int) { navigationHidden = true; changes.add("hide" to type) }
  fun show(type: Int) { navigationHidden = false; changes.add("show" to type) }
  companion object { const val BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE = 2 }
}

interface WindowManager {
  class LayoutParams {
    companion object {
      const val FLAG_KEEP_SCREEN_ON = 128
    }
  }
}

class View { var rootWindowInsets: WindowInsets? = WindowInsets() }
class Window {
  val decorView = View()
  var insetsController: WindowInsetsController? = WindowInsetsController()
  var flags = 0
  val flagChanges = mutableListOf<Pair<String, Int>>()
  fun addFlags(flag: Int) { flags = flags or flag; flagChanges.add("add" to flag) }
  fun clearFlags(flag: Int) { flags = flags and flag.inv(); flagChanges.add("clear" to flag) }
}
