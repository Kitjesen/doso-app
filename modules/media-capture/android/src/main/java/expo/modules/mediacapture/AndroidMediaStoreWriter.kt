package expo.modules.mediacapture

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

internal data class SavedMediaEntry(
  val fileName: String,
  val uriString: String,
  val bytes: Long,
  val locationLabel: String,
)

internal object AndroidMediaStoreWriter {
  fun saveJpeg(context: Context, fileName: String, jpegBytes: ByteArray): SavedMediaEntry {
    val safeName = MediaCaptureCore.sanitizeMediaFileName(fileName, "jpg")
    require(jpegBytes.isNotEmpty()) { "JPEG data must not be empty" }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = context.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, safeName)
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/DOSO")
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }
      val uri: Uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("无法创建相册图片条目")
      try {
        resolver.openOutputStream(uri, "w")?.use { output ->
          output.write(jpegBytes)
          output.flush()
        } ?: throw IllegalStateException("无法写入相册图片流")
        val publishValues = ContentValues().apply {
          put(MediaStore.Images.Media.IS_PENDING, 0)
        }
        resolver.update(uri, publishValues, null, null)
        return SavedMediaEntry(
          fileName = safeName,
          uriString = uri.toString(),
          bytes = jpegBytes.size.toLong(),
          locationLabel = "系统相册 Pictures/DOSO",
        )
      } catch (error: Throwable) {
        try {
          resolver.delete(uri, null, null)
        } catch (_: Throwable) {
        }
        throw error
      }
    }

    val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "DOSO")
    if (!dir.exists()) dir.mkdirs()
    val target = File(dir, safeName)
    FileOutputStream(target).use { output ->
      output.write(jpegBytes)
      output.flush()
    }
    MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf("image/jpeg"), null)
    return SavedMediaEntry(
      fileName = safeName,
      uriString = Uri.fromFile(target).toString(),
      bytes = target.length(),
      locationLabel = "应用相册目录 Pictures/DOSO",
    )
  }

  fun saveMp4FromFile(context: Context, fileName: String, sourceFile: File): SavedMediaEntry {
    val safeName = MediaCaptureCore.sanitizeMediaFileName(fileName, "mp4")
    require(sourceFile.exists() && sourceFile.length() > 0L) { "Recorded video file is empty" }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = context.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME, safeName)
        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
        put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/DOSO")
        put(MediaStore.Video.Media.IS_PENDING, 1)
      }
      val uri: Uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("无法创建系统视频库条目")
      try {
        resolver.openOutputStream(uri, "w")?.use { output ->
          FileInputStream(sourceFile).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val read = input.read(buffer)
              if (read <= 0) break
              output.write(buffer, 0, read)
            }
          }
          output.flush()
        } ?: throw IllegalStateException("无法写入系统视频文件流")
        val publishValues = ContentValues().apply {
          put(MediaStore.Video.Media.IS_PENDING, 0)
        }
        resolver.update(uri, publishValues, null, null)
        return SavedMediaEntry(
          fileName = safeName,
          uriString = uri.toString(),
          bytes = sourceFile.length(),
          locationLabel = "系统相册 Movies/DOSO",
        )
      } catch (error: Throwable) {
        try {
          resolver.delete(uri, null, null)
        } catch (_: Throwable) {
        }
        throw error
      }
    }

    val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "DOSO")
    if (!dir.exists()) dir.mkdirs()
    val target = File(dir, safeName)
    FileInputStream(sourceFile).use { input ->
      FileOutputStream(target).use { output ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          output.write(buffer, 0, read)
        }
        output.flush()
      }
    }
    MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf("video/mp4"), null)
    return SavedMediaEntry(
      fileName = safeName,
      uriString = Uri.fromFile(target).toString(),
      bytes = target.length(),
      locationLabel = "应用影片目录 Movies/DOSO",
    )
  }
}
