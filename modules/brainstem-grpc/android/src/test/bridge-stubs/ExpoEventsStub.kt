package expo.modules.kotlin.events

import android.content.Intent

data class OnActivityResultPayload(
  val requestCode: Int,
  val resultCode: Int,
  val data: Intent?
)
