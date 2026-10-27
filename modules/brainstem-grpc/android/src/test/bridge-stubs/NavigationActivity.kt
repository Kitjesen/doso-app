package android.app

import android.view.Window
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner

class DisplayMetrics { var density = 3.0f }
class Resources { val displayMetrics = DisplayMetrics() }
class Activity : LifecycleOwner {
  override val lifecycle = Lifecycle()
  val window = Window()
  val resources = Resources()
  var uiDispatches = 0
  fun runOnUiThread(action: () -> Unit) { uiDispatches++; action() }
}
