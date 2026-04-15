/**
 * Video Production Orchestrator
 * Chains ElevenLabs → Suno → Kling → Whisper → FFmpeg to produce
 * finished social media videos from a script
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { generateSpeech } from './elevenlabs'
import * as suno from './suno'
import * as kling from './kling'
import { transcribeWithTimestamps, generateASS, type CaptionStyle, type WordTimestamp } from './captions'
import { assembleVideo as ffmpegAssemble, type AssemblyParams } from './ffmpeg'
import { scriptToScenes } from './script-to-scenes'

// ── Types ───────────────────────────────────────────────────────────

export interface VideoJob {
  contentPieceId: string
  script: string
  personaId: string
  voiceId?: string
  mood: string
  scenes: SceneDescription[]
}

export interface SceneDescription {
  text: string
  visualPrompt: string
  durationSeconds: number
}

export interface VideoResult {
  videoUrl: string
  voiceoverUrl: string
  musicUrl: string
  captionsPath: string
  clipPaths: string[]
  status: 'complete' | 'error'
  error?: string
}

// ── Supabase client ─────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase credentials not configured')
  return createClient(url, key)
}

// ── Orchestrator ────────────────────────────────────────────────────

export class VideoOrchestrator {
  private jobDir: string = ''
  private jobId: string = ''

  /**
   * Set up a working directory for the job
   */
  private initJob(contentPieceId: string): void {
    this.jobId = `${contentPieceId}_${Date.now()}`
    this.jobDir = path.join('/tmp/video-jobs', this.jobId)
    fs.mkdirSync(this.jobDir, { recursive: true })
    this.log('Job initialized', { jobDir: this.jobDir })
  }

  /** Log a progress message */
  private log(message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString()
    console.log(`[VideoOrchestrator ${timestamp}] ${message}`, data ? JSON.stringify(data) : '')
  }

  /** Update content_pieces status in Supabase */
  private async updateStatus(contentPieceId: string, status: string, extra?: Record<string, unknown>): Promise<void> {
    try {
      const supabase = getSupabase()
      await supabase
        .from('content_pieces')
        .update({ generation_status: status, ...extra, updated_at: new Date().toISOString() })
        .eq('id', contentPieceId)
    } catch (error) {
      this.log(`Failed to update status to "${status}"`, { error: String(error) })
    }
  }

  /**
   * Generate voiceover audio from script text
   * @param script - Full narration text
   * @param voiceId - ElevenLabs voice ID
   * @returns Path to the generated audio and its duration
   */
  async generateVoiceover(
    script: string,
    voiceId: string
  ): Promise<{ audioPath: string; durationSeconds: number }> {
    this.log('Generating voiceover...', { voiceId, scriptLength: script.length })

    try {
      const audioBuffer = await generateSpeech(script, voiceId)
      const audioPath = path.join(this.jobDir, 'voiceover.mp3')
      fs.writeFileSync(audioPath, audioBuffer)

      // Also save the script text for fallback caption timing
      fs.writeFileSync(path.join(this.jobDir, 'voiceover.txt'), script)

      // Estimate duration from word count (~150 wpm)
      const wordCount = script.split(/\s+/).length
      const durationSeconds = (wordCount / 150) * 60

      this.log('Voiceover generated', { audioPath, durationSeconds })
      return { audioPath, durationSeconds }
    } catch (error) {
      throw new Error(`Voiceover generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate background music matching the video mood
   * @param mood - Mood descriptor (upbeat, dramatic, chill, etc.)
   * @param durationSeconds - Target duration
   * @returns Path to the generated music audio
   */
  async generateMusic(
    mood: string,
    durationSeconds: number
  ): Promise<{ audioPath: string }> {
    this.log('Generating background music...', { mood, durationSeconds })

    try {
      const prompt = `${mood} background music for social media video, instrumental, no vocals, ${Math.round(durationSeconds)} seconds`
      const result = await suno.generateMusic(prompt, durationSeconds)

      if (!result.audioUrl || result.id === 'skipped') {
        this.log('Music generation skipped (no API key)')
        return { audioPath: '' }
      }

      // Poll for completion
      const audioUrl = await suno.waitForCompletion(result.id)
      if (!audioUrl) {
        this.log('Music generation timed out or failed')
        return { audioPath: '' }
      }

      // Download the audio
      const audioPath = path.join(this.jobDir, 'music.mp3')
      const response = await fetch(audioUrl)
      const buffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(audioPath, buffer)

      this.log('Background music generated', { audioPath })
      return { audioPath }
    } catch (error) {
      this.log('Music generation failed (non-critical)', { error: String(error) })
      return { audioPath: '' }
    }
  }

  /**
   * Generate a video clip from a visual prompt
   * @param prompt - Visual description for the clip
   * @param durationSeconds - Target clip duration
   * @param referenceImageUrl - Optional reference image for style guidance
   * @returns Path to the generated video clip
   */
  async generateVideoClip(
    prompt: string,
    durationSeconds: number,
    referenceImageUrl?: string
  ): Promise<{ clipPath: string }> {
    this.log('Generating video clip...', { prompt: prompt.slice(0, 80), durationSeconds })

    try {
      let taskResult: { taskId: string }

      if (referenceImageUrl) {
        taskResult = await kling.imageToVideo(referenceImageUrl, prompt, durationSeconds)
      } else {
        taskResult = await kling.generateVideo(prompt, { duration: durationSeconds })
      }

      if (taskResult.taskId === 'skipped') {
        this.log('Video clip generation skipped (no API key)')
        return { clipPath: '' }
      }

      // Poll for completion
      const videoUrl = await kling.waitForCompletion(taskResult.taskId)
      if (!videoUrl) {
        this.log('Video clip generation timed out or failed')
        return { clipPath: '' }
      }

      // Download the clip
      const clipIndex = fs.readdirSync(this.jobDir).filter((f) => f.startsWith('clip_')).length
      const clipPath = path.join(this.jobDir, `clip_${clipIndex}.mp4`)
      const response = await fetch(videoUrl)
      const buffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(clipPath, buffer)

      this.log('Video clip generated', { clipPath })
      return { clipPath }
    } catch (error) {
      this.log('Video clip generation failed', { error: String(error) })
      return { clipPath: '' }
    }
  }

  /**
   * Transcribe audio to get word-level timestamps for captions
   * @param audioPath - Path to the voiceover audio file
   * @returns Array of words with start/end timestamps
   */
  async transcribeAudio(
    audioPath: string
  ): Promise<{ words: WordTimestamp[] }> {
    this.log('Transcribing audio for captions...')

    try {
      const words = await transcribeWithTimestamps(audioPath)
      this.log('Transcription complete', { wordCount: words.length })
      return { words }
    } catch (error) {
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate ASS subtitle file with animated word-by-word highlighting
   * @param words - Word timestamps from transcription
   * @param style - Caption visual style
   * @returns Path to the generated ASS file
   */
  async generateCaptions(
    words: WordTimestamp[],
    style: CaptionStyle
  ): Promise<{ assPath: string }> {
    this.log('Generating captions...', { style, wordCount: words.length })

    try {
      const assContent = generateASS(words, style)
      const assPath = path.join(this.jobDir, 'captions.ass')
      fs.writeFileSync(assPath, assContent)

      this.log('Captions generated', { assPath })
      return { assPath }
    } catch (error) {
      throw new Error(`Caption generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Assemble the final video from all components
   * @param params - Assembly parameters (clips, audio, captions)
   * @returns Path to the final output video
   */
  async assembleVideo(params: AssemblyParams): Promise<{ outputPath: string }> {
    this.log('Assembling final video...')

    try {
      const result = await ffmpegAssemble(params)
      this.log('Video assembled', { outputPath: result.outputPath })
      return result
    } catch (error) {
      throw new Error(`Video assembly failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Full pipeline orchestration: script → finished video
   * Chains all AI services together with error handling and fallbacks
   * @param job - The video production job specification
   * @returns Complete result with all output paths
   */
  async produceVideo(job: VideoJob): Promise<VideoResult> {
    this.initJob(job.contentPieceId)
    this.log('Starting video production pipeline', {
      contentPieceId: job.contentPieceId,
      sceneCount: job.scenes.length,
      mood: job.mood,
    })

    const result: VideoResult = {
      videoUrl: '',
      voiceoverUrl: '',
      musicUrl: '',
      captionsPath: '',
      clipPaths: [],
      status: 'error',
    }

    try {
      // Auto-generate scenes if none provided
      const scenes = job.scenes.length > 0 ? job.scenes : scriptToScenes(job.script)

      // ── Step 1: Generate voiceover ────────────────────────────────
      await this.updateStatus(job.contentPieceId, 'generating_voiceover')

      let voiceover: { audioPath: string; durationSeconds: number }
      const voiceId = job.voiceId || '21m00Tcm4TlvDq8ikWAM' // Default: Rachel voice
      try {
        voiceover = await this.generateVoiceover(job.script, voiceId)
        result.voiceoverUrl = voiceover.audioPath
      } catch (error) {
        result.error = `Voiceover failed: ${error instanceof Error ? error.message : String(error)}`
        await this.updateStatus(job.contentPieceId, 'error', { error_message: result.error })
        return result
      }

      // ── Step 2: Generate background music (parallel-safe, non-critical) ──
      await this.updateStatus(job.contentPieceId, 'generating_music')

      const musicPromise = this.generateMusic(job.mood, voiceover.durationSeconds)

      // ── Step 3: Generate video clips (can run in parallel with music) ──
      await this.updateStatus(job.contentPieceId, 'generating_clips')

      const clipPromises = scenes.map((scene) =>
        this.generateVideoClip(scene.visualPrompt, scene.durationSeconds)
      )

      // Wait for both music and clips
      const [musicResult, ...clipResults] = await Promise.all([musicPromise, ...clipPromises])

      result.musicUrl = musicResult.audioPath
      result.clipPaths = clipResults.map((r) => r.clipPath).filter(Boolean)

      // If no clips were generated, we can't assemble
      if (result.clipPaths.length === 0) {
        this.log('No video clips generated — cannot assemble video')
        result.error = 'No video clips could be generated. Check Kling API key and prompts.'
        await this.updateStatus(job.contentPieceId, 'error', { error_message: result.error })
        return result
      }

      // ── Step 4: Transcribe voiceover for captions ─────────────────
      await this.updateStatus(job.contentPieceId, 'generating_captions')

      const { words } = await this.transcribeAudio(voiceover.audioPath)
      const { assPath } = await this.generateCaptions(words, 'bold_yellow')
      result.captionsPath = assPath

      // ── Step 5: Assemble final video ──────────────────────────────
      await this.updateStatus(job.contentPieceId, 'assembling')

      const outputPath = path.join(this.jobDir, 'final_video.mp4')
      const assemblyParams: AssemblyParams = {
        clips: result.clipPaths,
        voiceoverPath: voiceover.audioPath,
        musicPath: musicResult.audioPath || undefined,
        captionsPath: assPath,
        outputPath,
        musicVolume: 0.15,
      }

      const assembled = await this.assembleVideo(assemblyParams)
      result.videoUrl = assembled.outputPath
      result.status = 'complete'

      // ── Done ──────────────────────────────────────────────────────
      await this.updateStatus(job.contentPieceId, 'complete', {
        video_url: result.videoUrl,
        voiceover_url: result.voiceoverUrl,
        music_url: result.musicUrl,
        captions_path: result.captionsPath,
      })

      this.log('Video production complete!', {
        outputPath: result.videoUrl,
        clipCount: result.clipPaths.length,
        hasMusic: !!result.musicUrl,
      })

      return result
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      this.log('Pipeline failed', { error: result.error })
      await this.updateStatus(job.contentPieceId, 'error', { error_message: result.error })
      return result
    }
  }
}
