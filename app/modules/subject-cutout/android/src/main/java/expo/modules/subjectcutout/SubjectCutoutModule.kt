package expo.modules.subjectcutout

import android.graphics.Bitmap
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

class SubjectCutoutModule : Module() {
  private val segmenter by lazy {
    SubjectSegmentation.getClient(
      SubjectSegmenterOptions.Builder().enableForegroundBitmap().build()
    )
  }

  override fun definition() = ModuleDefinition {
    Name("SubjectCutout")

    Function("isAvailable") { true }

    // Lifts the main subject out of the photo with ML Kit and resolves with the file URI of a
    // transparent PNG cropped to it.
    AsyncFunction("cutOutAsync") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_CUTOUT", "The app isn't ready yet.", null)
        return@AsyncFunction
      }
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("ERR_CUTOUT", "Couldn't read the photo.", e)
        return@AsyncFunction
      }
      segmenter.process(image)
        .addOnSuccessListener { result ->
          val foreground = result.foregroundBitmap
          if (foreground == null) {
            promise.reject("ERR_CUTOUT", "Couldn't find the plushie in this photo.", null)
            return@addOnSuccessListener
          }
          try {
            val cropped = cropToContent(foreground)
            if (cropped == null) {
              promise.reject("ERR_CUTOUT", "Couldn't find the plushie in this photo.", null)
              return@addOnSuccessListener
            }
            val out = File(context.cacheDir, "cutout-${UUID.randomUUID()}.png")
            FileOutputStream(out).use { cropped.compress(Bitmap.CompressFormat.PNG, 100, it) }
            promise.resolve(Uri.fromFile(out).toString())
          } catch (e: Exception) {
            promise.reject("ERR_CUTOUT", "Couldn't save the cutout.", e)
          }
        }
        .addOnFailureListener { e ->
          promise.reject("ERR_CUTOUT", "Couldn't cut out the plushie: ${e.message}", e)
        }
    }
  }

  /** Crops away fully transparent borders; null when nothing is left. */
  private fun cropToContent(bitmap: Bitmap): Bitmap? {
    val w = bitmap.width
    val h = bitmap.height
    val pixels = IntArray(w * h)
    bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
    var minX = w
    var minY = h
    var maxX = -1
    var maxY = -1
    for (y in 0 until h) {
      val row = y * w
      for (x in 0 until w) {
        if ((pixels[row + x] ushr 24) > 16) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < minX || maxY < minY) return null
    return Bitmap.createBitmap(bitmap, minX, minY, maxX - minX + 1, maxY - minY + 1)
  }
}
