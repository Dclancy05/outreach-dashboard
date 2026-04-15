/**
 * FFmpeg Video Assembly Module
 * Handles all video/audio processing: cropping, concatenation, audio mixing,
 * subtitle burning, and final assembly into 9:16 vertical video
 */

import { execSync, execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

/** Check if ffmpeg is available on the system */
function ensureFFmpeg(): void {
  try {
    execSync('which ffmpeg', { stdio: 'ignore' })
  } catch {
    throw new Error(
      'ffmpeg not found on this system. Install it with: sudo apt-get install ffmpeg'
    )
  }
}

/** Run an ffmpeg command and return stdout */
function runFFmpeg(args: string[]): string {
  ensureFFmpeg()
  try {
    return execFileSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    })
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string }
    throw new Error(`FFmpeg failed: ${err.stderr || err.message || 'Unknown error'}`)
  }
}

/** Get duration of a media file in seconds */
function getMediaDuration(filePath: string): number {
  ensureFFmpeg()
  try {
    const result = execFileSync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
      { encoding: 'utf-8' }
    )
    const info = JSON.parse(result)
    return parseFloat(info.format?.duration || '0')
  } catch {
    return 0
  }
}

export interface AssemblyParams {
  clips: string[]
  voiceoverPath: string
  musicPath?: string
  captionsPath?: string
  outputPath: string
  musicVolume?: number
}

/**
 * Assemble a complete video from clips, voiceover, music, and captions
 * @param params - All input paths and settings
 * @returns Path to the final output video
 */
export async function assembleVideo(params: AssemblyParams): Promise<{ outputPath: string }> {
  const { clips, voiceoverPath, musicPath, captionsPath, outputPath, musicVolume = 0.15 } = params
  const workDir = path.dirname(outputPath)

  // Step 1: Concatenate video clips
  let videoPath: string
  if (clips.length === 1) {
    videoPath = clips[0]
  } else if (clips.length > 1) {
    videoPath = path.join(workDir, '_concat.mp4')
    await concatenateClips(clips, videoPath)
  } else {
    throw new Error('No video clips provided')
  }

  // Step 2: Crop to 9:16 if needed
  const croppedPath = path.join(workDir, '_cropped.mp4')
  await cropToVertical(videoPath, croppedPath)

  // Step 3: Mix audio (voiceover + music)
  let audioPath = voiceoverPath
  if (musicPath && fs.existsSync(musicPath)) {
    const mixedPath = path.join(workDir, '_mixed_audio.mp3')
    await mixAudio(voiceoverPath, musicPath, mixedPath, musicVolume)
    audioPath = mixedPath
  }

  // Step 4: Combine video + audio
  const withAudioPath = path.join(workDir, '_with_audio.mp4')
  const voiceDuration = getMediaDuration(audioPath)
  runFFmpeg([
    '-y',
    '-stream_loop', '-1',
    '-i', croppedPath,
    '-i', audioPath,
    '-t', String(voiceDuration),
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-map', '0:v',
    '-map', '1:a',
    withAudioPath,
  ])

  // Step 5: Burn subtitles if provided
  if (captionsPath && fs.existsSync(captionsPath)) {
    await overlaySubtitles(withAudioPath, captionsPath, outputPath)
  } else {
    fs.copyFileSync(withAudioPath, outputPath)
  }

  // Cleanup intermediate files
  for (const f of ['_concat.mp4', '_cropped.mp4', '_mixed_audio.mp3', '_with_audio.mp4']) {
    const p = path.join(workDir, f)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }

  return { outputPath }
}

/**
 * Auto-crop any video to 9:16 vertical aspect ratio
 * @param inputPath - Source video
 * @param outputPath - Output path (optional, overwrites input if omitted)
 */
export async function cropToVertical(inputPath: string, outputPath?: string): Promise<void> {
  const out = outputPath || inputPath.replace(/(\.[^.]+)$/, '_vertical$1')

  // Scale to 1080 wide, then pad/crop to 1920 tall
  runFFmpeg([
    '-y',
    '-i', inputPath,
    '-vf', 'scale=1080:-2,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-an',
    out,
  ])
}

/**
 * Create a Ken Burns zoom effect on a still image
 * @param imagePath - Source image
 * @param duration - Duration in seconds
 * @param outputPath - Output video path
 */
export async function addKenBurns(
  imagePath: string,
  duration: number,
  outputPath?: string
): Promise<string> {
  const out = outputPath || imagePath.replace(/\.[^.]+$/, '_kb.mp4')

  // Slow zoom from 100% to 120% over the duration
  runFFmpeg([
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-vf',
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.001,1.2)':d=${Math.round(duration * 30)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    out,
  ])

  return out
}

/**
 * Concatenate multiple video clips with crossfade transitions
 * @param clips - Array of clip file paths
 * @param outputPath - Output path for joined video
 */
export async function concatenateClips(clips: string[], outputPath?: string): Promise<string> {
  if (clips.length === 0) throw new Error('No clips to concatenate')
  if (clips.length === 1) return clips[0]

  const out = outputPath || path.join(path.dirname(clips[0]), '_concatenated.mp4')

  // Use concat demuxer for simple joining, xfade filter for crossfades
  const fadeDuration = 0.5
  const inputs = clips.flatMap((c) => ['-i', c])

  // Build xfade filter chain
  const filters: string[] = []
  let lastOutput = '[0:v]'
  for (let i = 1; i < clips.length; i++) {
    const offset = clips
      .slice(0, i)
      .reduce((sum, c) => sum + getMediaDuration(c), 0) - fadeDuration * i
    const output = i === clips.length - 1 ? '[outv]' : `[v${i}]`
    filters.push(
      `${lastOutput}[${i}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${Math.max(0, offset)}${output}`
    )
    lastOutput = output
  }

  if (filters.length === 0) {
    // Single clip — just copy
    fs.copyFileSync(clips[0], out)
    return out
  }

  runFFmpeg([
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[outv]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-an',
    out,
  ])

  return out
}

/**
 * Mix voiceover and background music audio
 * @param voiceoverPath - Voiceover audio file
 * @param musicPath - Background music file
 * @param outputPath - Output mixed audio path
 * @param musicVolume - Music volume (0.0-1.0), default 0.15
 */
export async function mixAudio(
  voiceoverPath: string,
  musicPath: string,
  outputPath?: string,
  musicVolume = 0.15
): Promise<string> {
  const out =
    outputPath || path.join(path.dirname(voiceoverPath), '_mixed.mp3')

  const voiceDuration = getMediaDuration(voiceoverPath)

  runFFmpeg([
    '-y',
    '-i', voiceoverPath,
    '-stream_loop', '-1',
    '-i', musicPath,
    '-t', String(voiceDuration),
    '-filter_complex',
    `[0:a]volume=1.0[voice];[1:a]volume=${musicVolume}[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[out]`,
    '-map', '[out]',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    out,
  ])

  return out
}

/**
 * Burn ASS subtitle captions into the video
 * @param videoPath - Source video with audio
 * @param assPath - ASS subtitle file
 * @param outputPath - Output video path
 */
export async function overlaySubtitles(
  videoPath: string,
  assPath: string,
  outputPath?: string
): Promise<string> {
  const out =
    outputPath || videoPath.replace(/(\.[^.]+)$/, '_captioned$1')

  // Escape special characters in the ASS path for ffmpeg filter
  const escapedPath = assPath.replace(/([:\\'])/g, '\\$1')

  runFFmpeg([
    '-y',
    '-i', videoPath,
    '-vf', `ass='${escapedPath}'`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'copy',
    out,
  ])

  return out
}
