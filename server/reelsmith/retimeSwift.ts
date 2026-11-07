// RS-1259: the Swift source of the smooth slow-motion helper (rs-retime). It is kept here as text so it travels inside
// the desktop app's server bundle; retimeHelper.ts writes it to ~/.reelsmith/bin and builds it there with swiftc.
// String.raw keeps every backslash as Swift needs it; the source may not contain a backtick or a dollar-brace.
export const RETIME_SWIFT = String.raw`// RS-1259: smooth slow motion. Raw NV12 frames of a video span come in on stdin (from ffmpeg); for each output position
// in the positions file (a source frame number, fractional between two frames) one NV12 frame goes out on stdout (to
// ffmpeg's encoder): the source frame itself on a whole number, else an in-between frame from Apple's frame-rate
// conversion (Video Toolbox VTFrameRateConversion, macOS 15.4+), which follows each moving thing by optical flow.
//   rs-retime --probe                                  → {"supported":true|false,"blur":true|false}
//   rs-retime <width> <height> <positions file>        (positions ascending, one per line)
//   rs-retime --blur <strength> <width> <height> <positions file>
//   rs-retime --pair <width> <height> <phases file>     (two frames in; one in-between frame per phase out)
// The --blur mode (RS-1259 follow-up) is for sped-up spans: each output shows the source frame at floor(position) with
// Apple's motion blur (VTMotionBlur, 1-100), which reads the motion from the frames shown before and after it, so the
// blur follows each moving thing instead of one fixed angle.
// The --pair mode is a smooth cut (DaVinci's Smooth Cut): the two frames either side of a jump inside one talking clip
// come in, and the frames that morph from the first to the second go out, one per phase (0-1).
// Built on first use by retimeHelper.ts (swiftc -O); nothing is downloaded.
import CoreMedia
import CoreVideo
import Foundation
import VideoToolbox

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(("rs-retime: " + message + "\n").data(using: .utf8)!)
  exit(1)
}

var args = Array(CommandLine.arguments.dropFirst())
if args.first == "--probe" {
  print("{\"supported\":\(VTFrameRateConversionConfiguration.isSupported),\"blur\":\(VTMotionBlurConfiguration.isSupported)}")
  exit(0)
}
var blurStrength = 0
var pairMode = false
if args.first == "--pair" { pairMode = true; args.removeFirst() }
if args.first == "--blur" {
  guard args.count >= 2, let s = Int(args[1]), s >= 1, s <= 100 else { fail("--blur takes a strength from 1 to 100") }
  blurStrength = s
  args.removeFirst(2)
}
guard args.count >= 3, let W = Int(args[0]), let H = Int(args[1]), W > 0, H > 0, W % 2 == 0, H % 2 == 0 else {
  fail("usage: rs-retime [--blur <strength> | --pair] <even width> <even height> <positions file>")
}
guard let text = try? String(contentsOfFile: args[2], encoding: .utf8) else { fail("cannot read \(args[2])") }
let positions = text.split(whereSeparator: \.isNewline).compactMap { Double($0) }.map { max(0, $0) }
guard !positions.isEmpty else { fail("no positions") }
// one expression, not lets assigned in branches: top-level lets set that way crashed the -O build (objc_retain in main)
let processorConfig: any VTFrameProcessorConfiguration = {
  if blurStrength > 0 {
    guard VTMotionBlurConfiguration.isSupported else { fail("motion blur is not supported on this Mac") }
    guard let config = VTMotionBlurConfiguration(frameWidth: W, frameHeight: H, usePrecomputedFlow: false,
      qualityPrioritization: .normal, revision: VTMotionBlurConfiguration.defaultRevision) else { fail("no motion blur for \(W)x\(H)") }
    return config
  }
  guard VTFrameRateConversionConfiguration.isSupported else { fail("frame-rate conversion is not supported on this Mac") }
  guard let config = VTFrameRateConversionConfiguration(frameWidth: W, frameHeight: H, usePrecomputedFlow: false,
    qualityPrioritization: .normal, revision: VTFrameRateConversionConfiguration.defaultRevision) else {
    fail("no frame-rate conversion for \(W)x\(H)")
  }
  return config
}()
let sourceAttributes = processorConfig.sourcePixelBufferAttributes
let destinationAttributes = processorConfig.destinationPixelBufferAttributes

// The processor takes half-float RGBA; the pipes carry NV12 (a third of the bytes). Video Toolbox converts on the GPU,
// with Rec. 709 tags on both sides so the round trip is only the YCbCr matrix.
func pool(_ format: OSType?, _ required: [String: Any]?) -> CVPixelBufferPool {
  var mine: [String: Any] = [kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H, kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()]
  if let format { mine[kCVPixelBufferPixelFormatTypeKey as String] = format }
  var attributes: CFDictionary? = mine as CFDictionary
  if let required { CVPixelBufferCreateResolvedAttributesDictionary(nil, [mine as CFDictionary, required as CFDictionary] as CFArray, &attributes) }
  var made: CVPixelBufferPool?
  guard CVPixelBufferPoolCreate(nil, nil, attributes, &made) == kCVReturnSuccess, let made else { fail("no pixel buffer pool") }
  return made
}
let yuvPool = pool(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, nil)
let sourcePool = pool(nil, sourceAttributes)
let destinationPool = pool(nil, destinationAttributes)
func buffer(_ from: CVPixelBufferPool) -> CVPixelBuffer {
  var made: CVPixelBuffer?
  guard CVPixelBufferPoolCreatePixelBuffer(nil, from, &made) == kCVReturnSuccess, let made else { fail("no pixel buffer") }
  CVBufferSetAttachment(made, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
  CVBufferSetAttachment(made, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
  CVBufferSetAttachment(made, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
  return made
}
var transferSession: VTPixelTransferSession?
guard VTPixelTransferSessionCreate(allocator: nil, pixelTransferSessionOut: &transferSession) == noErr, let transfer = transferSession else { fail("no pixel transfer session") }
func convert(_ from: CVPixelBuffer, _ to: CVPixelBuffer) {
  let status = VTPixelTransferSessionTransferImage(transfer, from: from, to: to)
  if status != noErr { fail("pixel transfer failed (\(status))") }
}

let frameBytes = W * H * 3 / 2
var outBytes = [UInt8](repeating: 0, count: frameBytes)

/** The next raw frame on stdin, or nil at its end. */
func readRaw() -> [UInt8]? {
  var raw = [UInt8](repeating: 0, count: frameBytes)
  var got = 0
  while got < frameBytes {
    let n = raw.withUnsafeMutableBytes { fread($0.baseAddress! + got, 1, frameBytes - got, stdin) }
    if n <= 0 { break }
    got += n
  }
  return got == frameBytes ? raw : nil
}

func emit(_ raw: [UInt8]) {
  let written = raw.withUnsafeBytes { fwrite($0.baseAddress!, 1, frameBytes, stdout) }
  if written != frameBytes { fail("output closed") }
}

/** An interpolated frame (half-float RGBA) back to NV12, out. */
func emit(_ rgb: CVPixelBuffer) {
  let yuv = buffer(yuvPool)
  convert(rgb, yuv)
  CVPixelBufferLockBaseAddress(yuv, .readOnly)
  outBytes.withUnsafeMutableBytes { dst in
    let y = CVPixelBufferGetBaseAddressOfPlane(yuv, 0)!, yRow = CVPixelBufferGetBytesPerRowOfPlane(yuv, 0)
    for r in 0..<H { memcpy(dst.baseAddress! + r * W, y + r * yRow, W) }
    let uv = CVPixelBufferGetBaseAddressOfPlane(yuv, 1)!, uvRow = CVPixelBufferGetBytesPerRowOfPlane(yuv, 1)
    for r in 0..<(H / 2) { memcpy(dst.baseAddress! + W * H + r * W, uv + r * uvRow, W) }
  }
  CVPixelBufferUnlockBaseAddress(yuv, .readOnly)
  emit(outBytes)
}

struct Frame { let index: Int; let raw: [UInt8]; let vt: VTFrameProcessorFrame }
func frame(_ index: Int, _ raw: [UInt8]) -> Frame { Frame(index: index, raw: raw, vt: toProcessor(index, raw)) }
func toProcessor(_ index: Int, _ raw: [UInt8]) -> VTFrameProcessorFrame {
  let yuv = buffer(yuvPool)
  CVPixelBufferLockBaseAddress(yuv, [])
  raw.withUnsafeBytes { src in
    let y = CVPixelBufferGetBaseAddressOfPlane(yuv, 0)!, yRow = CVPixelBufferGetBytesPerRowOfPlane(yuv, 0)
    for r in 0..<H { memcpy(y + r * yRow, src.baseAddress! + r * W, W) }
    let uv = CVPixelBufferGetBaseAddressOfPlane(yuv, 1)!, uvRow = CVPixelBufferGetBytesPerRowOfPlane(yuv, 1)
    for r in 0..<(H / 2) { memcpy(uv + r * uvRow, src.baseAddress! + W * H + r * W, W) }
  }
  CVPixelBufferUnlockBaseAddress(yuv, [])
  let rgb = buffer(sourcePool)
  convert(yuv, rgb)
  guard let vt = VTFrameProcessorFrame(buffer: rgb, presentationTimeStamp: CMTime(value: CMTimeValue(index), timescale: 600)) else { fail("no source frame") }
  return vt
}

let processor = VTFrameProcessor()
do { try processor.startSession(configuration: processorConfig) } catch { fail("cannot start: \(error.localizedDescription)") }

/** Runs one request and waits for it. */
func run(_ parameters: VTFrameProcessorParameters) {
  let done = DispatchSemaphore(value: 0)
  var failure: Error?
  processor.process(parameters: parameters) { _, error in failure = error; done.signal() }
  done.wait()
  if let failure { fail("processing failed: \(failure.localizedDescription)") }
}

/** Phases this close to a source frame show that frame. */
let EDGE = 0.02

/**
 * The --blur mode. The neighbours handed to the processor are the frames shown before and after this one in the copy
 * (positions k - 1 and k + 1, a few source frames apart on a sped-up clip), so the blur covers the motion of one frame
 * of the copy, as a real shutter would at that speed, not the much smaller step between two source frames.
 */
func blurAll() -> Never {
  let shownAt = positions.map { Int($0.rounded(.down)) }
  let step = positions.count > 1 ? max(1, Int((positions[1] - positions[0]).rounded())) : 1
  var held: [Int: Frame] = [:]
  var read = 0
  var ended = false
  /** Source frame i, reading on to it; past the end, the last frame. */
  func source(_ i: Int) -> Frame? {
    while !ended && read <= i {
      if let raw = readRaw() { held[read] = frame(read, raw); read += 1 } else { ended = true }
    }
    return held[min(i, read - 1)]
  }
  var last = -2
  for (k, i) in shownAt.enumerated() {
    guard let shown = source(i) else { fail("no frames on stdin") }
    let before = source(k > 0 ? shownAt[k - 1] : max(0, i - step))
    let after = source(k + 1 < shownAt.count ? shownAt[k + 1] : i + step)
    // keep only what later frames can still ask for
    let keep = (k > 0 ? shownAt[k - 1] : 0)
    for key in held.keys where key < keep { held[key] = nil }
    let out = buffer(destinationPool)
    guard let target = VTFrameProcessorFrame(buffer: out, presentationTimeStamp: shown.vt.presentationTimeStamp),
      let parameters = VTMotionBlurParameters(sourceFrame: shown.vt,
        nextFrame: after.flatMap { $0.index != shown.index ? $0.vt : nil }, previousFrame: before.flatMap { $0.index != shown.index ? $0.vt : nil },
        nextOpticalFlow: nil, previousOpticalFlow: nil, motionBlurStrength: blurStrength,
        submissionMode: last == k - 1 ? .sequential : .random, destinationFrame: target) else { fail("bad blur parameters") }
    run(parameters)
    last = k
    emit(out)
  }
  fflush(stdout)
  processor.endSession()
  while readRaw() != nil {}
  exit(0)
}

/** Interpolation (the default mode). */
func convertAll() -> Never {
  var current = readRaw().map { frame(0, $0) }
  var next = readRaw().map { frame(1, $0) }
  guard current != nil else { fail("no frames on stdin") }
  var lastPair = -2
  var k = 0
  while k < positions.count {
    let i = Int(positions[k].rounded(.down))
    // slide the pair to (i, i + 1); past the last frame the last one holds
    while let n = next, current!.index < i {
      current = n
      next = readRaw().map { frame(n.index + 1, $0) }
    }
    var group: [Double] = []
    while k < positions.count, Int(positions[k].rounded(.down)) == i { group.append(positions[k] - Double(i)); k += 1 }
    let c = current!
    let paired = c.index == i && next != nil
    let phases = paired ? group.filter { $0 >= EDGE && $0 <= 1 - EDGE }.map { Float($0) } : []
    var made: [CVPixelBuffer] = []
    if let n = next, !phases.isEmpty {
      made = phases.map { _ in buffer(destinationPool) }
      let targets = made.map { VTFrameProcessorFrame(buffer: $0, presentationTimeStamp: .zero)! }
      guard let parameters = VTFrameRateConversionParameters(sourceFrame: c.vt, nextFrame: n.vt, opticalFlow: nil, interpolationPhase: phases,
        submissionMode: lastPair == i - 1 ? .sequential : .random, destinationFrames: targets) else { fail("bad parameters") }
      run(parameters)
      lastPair = i
    }
    var m = 0
    for phase in group {
      if !paired || phase < EDGE { emit(c.raw) } else if phase > 1 - EDGE { emit(next!.raw) } else { emit(made[m]); m += 1 }
    }
  }
  fflush(stdout)
  processor.endSession()
  // read what is left so the decoder upstream ends cleanly instead of on a broken pipe
  while readRaw() != nil {}
  exit(0)
}

/** The --pair mode: two frames, the morph between them. */
func pairAll() -> Never {
  guard let a = readRaw().map({ frame(0, $0) }), let b = readRaw().map({ frame(1, $0) }) else { fail("--pair needs two frames on stdin") }
  let phases = positions.map { Float(min(1, max(0, $0))) }
  let inside = phases.filter { $0 >= Float(EDGE) && $0 <= Float(1 - EDGE) }
  var made: [CVPixelBuffer] = []
  if !inside.isEmpty {
    made = inside.map { _ in buffer(destinationPool) }
    let targets = made.map { VTFrameProcessorFrame(buffer: $0, presentationTimeStamp: .zero)! }
    guard let parameters = VTFrameRateConversionParameters(sourceFrame: a.vt, nextFrame: b.vt, opticalFlow: nil, interpolationPhase: inside,
      submissionMode: .random, destinationFrames: targets) else { fail("bad parameters") }
    run(parameters)
  }
  var m = 0
  for phase in phases {
    if phase < Float(EDGE) { emit(a.raw) } else if phase > Float(1 - EDGE) { emit(b.raw) } else { emit(made[m]); m += 1 }
  }
  fflush(stdout)
  processor.endSession()
  while readRaw() != nil {}
  exit(0)
}

// both modes are functions, called once everything above is set up: a top-level variable read before its line runs
// (in an -O build) crashed in objc_retain
if blurStrength > 0 { blurAll() } else if pairMode { pairAll() } else { convertAll() }
`;
