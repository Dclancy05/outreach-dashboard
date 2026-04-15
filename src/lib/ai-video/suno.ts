/**
 * Suno AI Music Generation Integration
 * Generates background music tracks for videos
 */

const API_BASE = 'https://api.suno.ai/v1'

/**
 * Generate a background music track matching a mood/prompt
 * @param prompt - Description of the desired music (e.g. "upbeat corporate background music")
 * @param durationSeconds - Target duration in seconds
 * @returns Audio URL and generation ID
 */
export async function generateMusic(
  prompt: string,
  durationSeconds?: number
): Promise<{ audioUrl: string; id: string }> {
  const apiKey = process.env.SUNO_API_KEY
  if (!apiKey) {
    console.log('[Suno] No SUNO_API_KEY configured — skipping music generation')
    return { audioUrl: '', id: 'skipped' }
  }

  try {
    const response = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        duration: durationSeconds || 60,
        instrumental: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Suno API error (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    return {
      audioUrl: result.audio_url || '',
      id: result.id || result.task_id || '',
    }
  } catch (error) {
    console.error('[Suno] Music generation failed:', error)
    return { audioUrl: '', id: 'error' }
  }
}

/**
 * Poll for music generation completion (Suno is async)
 * @param id - The generation task ID
 * @returns Current status and audio URL when complete
 */
export async function checkStatus(id: string): Promise<{ status: string; audioUrl?: string }> {
  const apiKey = process.env.SUNO_API_KEY
  if (!apiKey || id === 'skipped' || id === 'error') {
    return { status: 'skipped' }
  }

  try {
    const response = await fetch(`${API_BASE}/status/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Suno status check failed (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    return {
      status: result.status || 'unknown',
      audioUrl: result.audio_url,
    }
  } catch (error) {
    console.error('[Suno] Status check failed:', error)
    return { status: 'error' }
  }
}

/**
 * Poll until music generation is complete or times out
 * @param id - The generation task ID
 * @param timeoutMs - Maximum wait time (default 5 minutes)
 * @param intervalMs - Poll interval (default 5 seconds)
 * @returns Final audio URL or empty string
 */
export async function waitForCompletion(
  id: string,
  timeoutMs = 300000,
  intervalMs = 5000
): Promise<string> {
  if (id === 'skipped' || id === 'error') return ''

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await checkStatus(id)
    if (result.status === 'complete' && result.audioUrl) return result.audioUrl
    if (result.status === 'error' || result.status === 'failed') return ''
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  console.warn(`[Suno] Timed out waiting for generation ${id}`)
  return ''
}
