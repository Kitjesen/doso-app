package android.content

import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch

open class Context {
  val noBackupFilesDir = File(System.getProperty("java.io.tmpdir"), "doso-context-${UUID.randomUUID()}")
  var packageName = "com.doso.robot.qa"
  var receiver: BroadcastReceiver? = null
  var senderPermission: String? = null
  fun registerReceiver(receiver: BroadcastReceiver, filter: IntentFilter, permission: String, scheduler: Any?): Intent? {
    this.receiver = receiver; senderPermission = permission; return null
  }
  fun registerReceiver(receiver: BroadcastReceiver, filter: IntentFilter, permission: String, scheduler: Any?, flags: Int): Intent? {
    check(flags == RECEIVER_EXPORTED); return registerReceiver(receiver, filter, permission, scheduler)
  }
  fun unregisterReceiver(receiver: BroadcastReceiver) { check(this.receiver === receiver); this.receiver = null }
  companion object { const val RECEIVER_EXPORTED = 2 }
}
class Intent(val action: String? = null) {
  var `package`: String? = null
  private val extras = mutableMapOf<String, String>()
  fun putExtra(name: String, value: String): Intent { extras[name] = value; return this }
  fun getStringExtra(name: String): String? = extras[name]
}
class IntentFilter(val action: String)
abstract class BroadcastReceiver {
  var isOrderedBroadcast = true
  var result: PendingResult? = null
  abstract fun onReceive(context: Context, intent: Intent)
  fun goAsync() = PendingResult().also { result = it }
  class PendingResult {
    var resultCode = 0
    var resultData: String? = null
    val done = CountDownLatch(1)
    fun finish() { done.countDown() }
  }
}
