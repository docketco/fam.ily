import ExpoModulesCore

public class LivePhotoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LivePhoto")

    // Converts a local video file into a Live Photo (key photo + paired video sharing one
    // content identifier) and saves it to the photo library. Resolves with that identifier.
    AsyncFunction("saveLivePhotoAsync") { (videoUri: String, keyPhotoSeconds: Double) async throws -> String in
      return try await LivePhotoWriter.saveToLibrary(videoUri: videoUri, keyPhotoSeconds: keyPhotoSeconds)
    }
  }
}
