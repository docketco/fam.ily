import CoreImage
import ExpoModulesCore
import UIKit
import Vision

enum SubjectCutoutError: LocalizedError {
  case unavailable
  case badImage(String)
  case noSubject
  case failed(String)

  var errorDescription: String? {
    switch self {
    case .unavailable: return "Cutting out needs iOS 17 or newer."
    case .badImage(let uri): return "Couldn't read the photo at \(uri)"
    case .noSubject: return "Couldn't find the plushie in this photo."
    case .failed(let reason): return "Couldn't cut out the plushie: \(reason)"
    }
  }
}

public class SubjectCutoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SubjectCutout")

    Function("isAvailable") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    // Lifts the main subject out of the photo (like long-pressing a photo in the Photos app)
    // and resolves with the file URI of a transparent PNG cropped to it.
    AsyncFunction("cutOutAsync") { (uri: String) async throws -> String in
      guard #available(iOS 17.0, *) else { throw SubjectCutoutError.unavailable }
      return try SubjectCutter.cutOut(uri: uri)
    }
  }
}

@available(iOS 17.0, *)
enum SubjectCutter {
  static func cutOut(uri: String) throws -> String {
    guard let url = URL(string: uri), let data = try? Data(contentsOf: url), let image = UIImage(data: data),
          let cgImage = image.cgImage else {
      throw SubjectCutoutError.badImage(uri)
    }

    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: CGImagePropertyOrientation(image.imageOrientation), options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw SubjectCutoutError.failed(error.localizedDescription)
    }
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      throw SubjectCutoutError.noSubject
    }

    let buffer: CVPixelBuffer
    do {
      buffer = try observation.generateMaskedImage(
        ofInstances: observation.allInstances, from: handler, croppedToInstancesExtent: true)
    } catch {
      throw SubjectCutoutError.failed(error.localizedDescription)
    }

    let ciImage = CIImage(cvPixelBuffer: buffer)
    guard let outImage = CIContext().createCGImage(ciImage, from: ciImage.extent),
          let png = UIImage(cgImage: outImage).pngData() else {
      throw SubjectCutoutError.failed("could not encode the result")
    }
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("cutout-\(UUID().uuidString).png")
    do {
      try png.write(to: out)
    } catch {
      throw SubjectCutoutError.failed(error.localizedDescription)
    }
    return out.absoluteString
  }
}

extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
