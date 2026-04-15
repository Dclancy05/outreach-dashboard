/**
 * ElevenLabs Text-to-Speech Integration
 * Generates voiceovers using ElevenLabs API
 */

const API_BASE = 'https://api.elevenlabs.io/v1'

interface Voice {
  voice_id: string
  name: string
  category: string
  labels: Record<string, string>
  preview_url: string
}

/**
 * Generate speech audio from text using a specific voice
 * @param text - The script text to convert to speech
 * @param voiceId - ElevenLabs voice ID
 * @returns Audio buffer (MP3)
 */
export async function generateSpeech(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured. Set it in .env.local to enable voiceover generation.')
  }

  try {
    const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    if (error instanceof Error && error.message.includes('ELEVENLABS_API_KEY')) throw error
    throw new Error(`ElevenLabs speech generation failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Design a new voice from a text description
 * @param description - Natural language description of the desired voice
 * @returns The new voice ID and a preview URL
 */
export async function designVoice(description: string): Promise<{ voiceId: string; previewUrl: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured.')
  }

  try {
    const response = await fetch(`${API_BASE}/voice-generation/generate-voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        voice_description: description,
        text: 'Hello! This is a preview of the generated voice. How does it sound?',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Voice design failed (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    return {
      voiceId: result.voice_id,
      previewUrl: result.preview_url || '',
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('ELEVENLABS_API_KEY')) throw error
    throw new Error(`Voice design failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * List all available voices in the ElevenLabs account
 * @returns Array of available voices
 */
export async function listVoices(): Promise<Voice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured.')
  }

  try {
    const response = await fetch(`${API_BASE}/voices`, {
      headers: { 'xi-api-key': apiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to list voices (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return (data.voices || []).map((v: Record<string, unknown>) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category || 'premade',
      labels: v.labels || {},
      preview_url: v.preview_url || '',
    }))
  } catch (error) {
    if (error instanceof Error && error.message.includes('ELEVENLABS_API_KEY')) throw error
    throw new Error(`Failed to list voices: ${error instanceof Error ? error.message : String(error)}`)
  }
}
