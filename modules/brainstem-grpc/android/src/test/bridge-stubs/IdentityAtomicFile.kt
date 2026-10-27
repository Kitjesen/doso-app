package android.util

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

class AtomicFile(private val file: File) {
  fun openRead() = FileInputStream(file)
  fun startWrite() = FileOutputStream(File(file.path + ".new"))
  fun finishWrite(output: FileOutputStream) {
    output.fd.sync(); output.close()
    Files.move(File(file.path + ".new").toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
  }
  fun failWrite(output: FileOutputStream) { output.close(); File(file.path + ".new").delete() }
}
