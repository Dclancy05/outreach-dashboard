/**
 * Kling AI Video Generation Integration
 * Uses Access Key + Secret Key to generate JWT tokens for API auth
 * Docs: https://docs.qingque.cn/d/home/eZQB2ySnMEB-7CMEHnE_GSZUA
 */

import { createHmac } from 'crypto'
import { getSecret } from '@/lib/secrets'

const API_BASE = 'https://api.klingai.com/v1'

/** Generate a JWT token for Kling API authentication */
async function generateKlingToken(): Promise<string | null> {
  const accessKey = await getSecret('KLING_ACCESS_KEY')
  const secretKey = await getSecret('KLING_SECRET_KEY')
  if (!accessKey || !secretKey) return null

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({
    iss: accessKey,
    exp: now + 1800, // 30 min expiry
    nbf: now - 5,
    iat: now,
  })).toString('base64url')

  const signature = createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url')

  return `${header}.${payload}.${signature}`
}

async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const token = await generateKlingToken()
  if (!token) return null
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }
}

/**
 * Start a video generation task from a text prompt
 */
export async function generateVideo(
  prompt: string,
  options?: { duration?: number; referenceImage?: string }
): Promise<{ taskId: string }> {
  const headers = await getAuthHeaders()
  if (!headers) {
    console.log('[Kling] No KLING_ACCESS_KEY/KLING_SECRET_KEY configured — skipping')
    return { taskId: 'skipped' }
  }

  try {
    const body: Record<string, unknown> = {
      model_name: 'kling-v1-5',
      prompt,
      duration: String(options?.duration || 5),
      aspect_ratio: '9:16',
      mode: 'std',
    }
    if (options?.referenceImage) {
      body.image = options.referenceImage
    }

    const response = await fetch(`${API_BASE}/videos/text2video`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Kling API error (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    const taskId = result.data?.task_id || result.task_id || ''
    console.log(`[Kling] Video generation started: ${taskId}`)
    return { taskId }
  } catch (error) {
    console.error('[Kling] Video generation failed:', error)
    return { taskId: 'error' }
  }
}

/**
 * Poll for video generation completion
 */
export async function checkStatus(taskId: string): Promise<{ status: string; videoUrl?: string }> {
  const headers = await getAuthHeaders()
  if (!headers || taskId === 'skipped' || taskId === 'error') {
    return { status: 'skipped' }
  }

  try {
    const response = await fetch(`${API_BASE}/videos/text2video/${taskId}`, { headers })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Kling status check failed (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    const data = result.data || result
    const status = data.task_status || data.status || 'unknown'
    const videoUrl = data.task_result?.videos?.[0]?.url || data.video_url || undefined

    return { status, videoUrl }
  } catch (error) {
    console.error('[Kling] Status check failed:', error)
    return { status: 'error' }
  }
}

/**
 * Generate a video from a reference image with motion
 */
export async function imageToVideo(
  imageUrl: string,
  prompt: string,
  duration?: number
): Promise<{ taskId: string }> {
  const headers = await getAuthHeaders()
  if (!headers) {
    console.log('[Kling] No credentials configured — skipping image-to-video')
    return { taskId: 'skipped' }
  }

  try {
    const response = await fetch(`${API_BASE}/videos/image2video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model_name: 'kling-v1-5',
        image: imageUrl,
        prompt,
        duration: String(duration || 5),
        aspect_ratio: '9:16',
        mode: 'std',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Kling img2video failed (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    return { taskId: result.data?.task_id || result.task_id || '' }
  } catch (error) {
    console.error('[Kling] Image-to-video failed:', error)
    return { taskId: 'error' }
  }
}

/**
 * Poll until video generation is complete or times out
 */
export async function waitForCompletion(
  taskId: string,
  timeoutMs = 600000,
  intervalMs = 10000
): Promise<string> {
  if (taskId === 'skipped' || taskId === 'error') return ''

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await checkStatus(taskId)
    if ((result.status === 'succeed' || result.status === 'complete' || result.status === 'succeeded') && result.videoUrl) {
      return result.videoUrl
    }
    if (result.status === 'failed' || result.status === 'error') return ''
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  console.warn(`[Kling] Timed out waiting for task ${taskId}`)
  return ''
}
