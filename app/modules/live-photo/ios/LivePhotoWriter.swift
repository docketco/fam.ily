import AVFoundation
import CoreMedia
import ImageIO
import Photos
import UniformTypeIdentifiers

enum LivePhotoError: LocalizedError {
  case badUri(String)
  case notAuthorized
  case noVideoTrack
  case failed(String)

  var errorDescription: String? {
    switch self {
    case .badUri(let uri): return "Not a local video file: \(uri)"
    case .notAuthorized: return "Allow adding to Photos in Settings to save Live Photos."
    case .noVideoTrack: return "The video has no video track."
    case .failed(let reason): return "Couldn't create the Live Photo: \(reason)"
    }
  }
}

/// A Live Photo is a still image and a QuickTime movie linked by a shared identifier:
/// the image carries it in its Apple maker note (key "17"), the movie in its
/// `com.apple.quicktime.content.identifier` metadata, plus a timed
/// `still-image-time` marker saying which moment the still shows.
enum LivePhotoWriter {
  private static let stillImageTimeKey = "com.apple.quicktime.still-image-time"

  static func saveToLibrary(videoUri: String, keyPhotoSeconds: Double) async throws -> String {
    guard let sourceURL = URL(string: videoUri), sourceURL.isFileURL else {
      throw LivePhotoError.badUri(videoUri)
    }
    try await ensureAddPermission()

    let identifier = UUID().uuidString
    let workDir = FileManager.default.temporaryDirectory.appendingPathComponent("livephoto-\(identifier)", isDirectory: true)
    try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: workDir) }
    let photoURL = workDir.appendingPathComponent("photo.jpg")
    let movieURL = workDir.appendingPathComponent("video.mov")

    let asset = AVURLAsset(url: sourceURL)
    let duration = try await asset.load(.duration)
    let keySeconds = min(max(0, keyPhotoSeconds), max(0, duration.seconds - 0.05))
    let keyTime = CMTime(seconds: keySeconds, preferredTimescale: 600)

    try await writeKeyPhoto(asset: asset, at: keyTime, identifier: identifier, to: photoURL)
    try await writePairedMovie(asset: asset, keyTime: keyTime, identifier: identifier, to: movieURL)

    try await PHPhotoLibrary.shared().performChanges {
      let request = PHAssetCreationRequest.forAsset()
      request.addResource(with: .photo, fileURL: photoURL, options: nil)
      request.addResource(with: .pairedVideo, fileURL: movieURL, options: nil)
    }
    return identifier
  }

  private static func ensureAddPermission() async throws {
    var status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .notDetermined {
      status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    }
    guard status == .authorized || status == .limited else {
      throw LivePhotoError.notAuthorized
    }
  }

  private static func writeKeyPhoto(asset: AVAsset, at time: CMTime, identifier: String, to url: URL) async throws {
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    let (cgImage, _) = try await generator.image(at: time)

    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
      throw LivePhotoError.failed("could not create the key photo")
    }
    let properties: [CFString: Any] = [
      kCGImagePropertyMakerAppleDictionary: ["17": identifier],
      kCGImageDestinationLossyCompressionQuality: 0.92,
    ]
    CGImageDestinationAddImage(destination, cgImage, properties as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      throw LivePhotoError.failed("could not write the key photo")
    }
  }

  /// Copies the video samples as-is (no re-encode) into a .mov carrying the Live Photo metadata.
  private static func writePairedMovie(asset: AVAsset, keyTime: CMTime, identifier: String, to url: URL) async throws {
    guard let track = try await asset.loadTracks(withMediaType: .video).first else {
      throw LivePhotoError.noVideoTrack
    }
    let formatDescriptions = try await track.load(.formatDescriptions)
    let transform = try await track.load(.preferredTransform)

    let reader = try AVAssetReader(asset: asset)
    let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    readerOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(readerOutput) else { throw LivePhotoError.failed("cannot read the video") }
    reader.add(readerOutput)

    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    writer.metadata = [contentIdentifierItem(identifier)]

    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: formatDescriptions.first)
    videoInput.transform = transform
    videoInput.expectsMediaDataInRealTime = false

    let metadataInput = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: stillImageTimeFormat())
    let metadataAdaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: metadataInput)

    guard writer.canAdd(videoInput), writer.canAdd(metadataInput) else {
      throw LivePhotoError.failed("cannot write the movie")
    }
    writer.add(videoInput)
    writer.add(metadataInput)

    guard writer.startWriting() else {
      throw LivePhotoError.failed(writer.error?.localizedDescription ?? "writer did not start")
    }
    guard reader.startReading() else {
      writer.cancelWriting()
      throw LivePhotoError.failed(reader.error?.localizedDescription ?? "reader did not start")
    }
    writer.startSession(atSourceTime: .zero)

    let marker = AVTimedMetadataGroup(
      items: [stillImageTimeItem()],
      timeRange: CMTimeRange(start: keyTime, duration: CMTime(value: 1, timescale: 100))
    )
    if !metadataAdaptor.append(marker) {
      writer.cancelWriting()
      throw LivePhotoError.failed(writer.error?.localizedDescription ?? "could not write the still-image marker")
    }
    metadataInput.markAsFinished()

    let queue = DispatchQueue(label: "family.livephoto.writer")
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      videoInput.requestMediaDataWhenReady(on: queue) {
        while videoInput.isReadyForMoreMediaData {
          guard let sample = readerOutput.copyNextSampleBuffer(), videoInput.append(sample) else {
            videoInput.markAsFinished()
            continuation.resume()
            return
          }
        }
      }
    }

    if reader.status == .failed || writer.status == .failed {
      reader.cancelReading()
      writer.cancelWriting()
      throw LivePhotoError.failed((writer.error ?? reader.error)?.localizedDescription ?? "copying video failed")
    }
    await writer.finishWriting()
    guard writer.status == .completed else {
      throw LivePhotoError.failed(writer.error?.localizedDescription ?? "the movie was not finished")
    }
  }

  private static func contentIdentifierItem(_ identifier: String) -> AVMetadataItem {
    let item = AVMutableMetadataItem()
    item.keySpace = .quickTimeMetadata
    item.key = AVMetadataKey.quickTimeMetadataKeyContentIdentifier.rawValue as NSString
    item.value = identifier as NSString
    item.dataType = kCMMetadataBaseDataType_UTF8 as String
    return item
  }

  private static func stillImageTimeItem() -> AVMetadataItem {
    let item = AVMutableMetadataItem()
    item.keySpace = .quickTimeMetadata
    item.key = stillImageTimeKey as NSString
    item.value = 0 as NSNumber
    item.dataType = kCMMetadataBaseDataType_SInt8 as String
    return item
  }

  private static func stillImageTimeFormat() -> CMFormatDescription? {
    let spec: [String: Any] = [
      kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier as String: "mdta/\(stillImageTimeKey)",
      kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType as String: kCMMetadataBaseDataType_SInt8 as String,
    ]
    var description: CMFormatDescription?
    _ = CMMetadataFormatDescriptionCreateWithMetadataSpecifications(
      allocator: kCFAllocatorDefault,
      metadataType: kCMMetadataFormatType_Boxed,
      metadataSpecifications: [spec] as CFArray,
      formatDescriptionOut: &description
    )
    return description
  }
}
