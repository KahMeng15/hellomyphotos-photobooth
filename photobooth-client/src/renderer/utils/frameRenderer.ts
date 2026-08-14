export interface FramePlaceholder {
  index: number
  x: number
  y: number
  width: number
  height: number
  cropTop: number
  cropBottom: number
  cropLeft: number
  cropRight: number
  borderRadius: number
}

export interface FrameConfig {
  id: string
  name: string
  disabled: boolean
  canvasWidth: number
  canvasHeight: number
  placeholders: FramePlaceholder[]
  imageUrl?: string
}

export async function renderFrame(
  frameConfig: FrameConfig,
  frameImageUrl: string,
  photoUrls: string[],
  targetCanvas: HTMLCanvasElement
): Promise<void> {
  const ctx = targetCanvas.getContext('2d')
  if (!ctx) return

  targetCanvas.width = frameConfig.canvasWidth
  targetCanvas.height = frameConfig.canvasHeight

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  // 1. Draw placeholders
  for (let i = 0; i < frameConfig.placeholders.length; i++) {
    const p = frameConfig.placeholders[i]
    if (i >= photoUrls.length) break // No photo for this placeholder

    try {
      const photo = await loadImage(photoUrls[i])
      
      const origWidth = photo.width
      const origHeight = photo.height
      
      const extractTop = p.cropTop
      const extractLeft = p.cropLeft
      const extractWidth = origWidth - p.cropLeft - p.cropRight
      const extractHeight = origHeight - p.cropTop - p.cropBottom

      // Calculate object-fit: cover equivalent
      const scaleX = p.width / extractWidth
      const scaleY = p.height / extractHeight
      const scale = Math.max(scaleX, scaleY)
      
      const drawWidth = extractWidth * scale
      const drawHeight = extractHeight * scale
      
      const drawX = p.x + (p.width - drawWidth) / 2
      const drawY = p.y + (p.height - drawHeight) / 2

      ctx.save()
      
      // Setup clipping path for border radius
      ctx.beginPath()
      if (p.borderRadius > 0) {
        if (ctx.roundRect) {
          ctx.roundRect(p.x, p.y, p.width, p.height, p.borderRadius)
        } else {
          // Fallback for older browsers
          ctx.rect(p.x, p.y, p.width, p.height)
        }
      } else {
        ctx.rect(p.x, p.y, p.width, p.height)
      }
      ctx.clip()

      // Draw image
      ctx.drawImage(
        photo,
        extractLeft, extractTop, extractWidth, extractHeight,
        drawX, drawY, drawWidth, drawHeight
      )
      
      ctx.restore()
    } catch (e) {
      console.error(`Failed to load photo for placeholder ${i}:`, e)
    }
  }

  // 2. Draw frame image on top
  try {
    const frameImg = await loadImage(frameImageUrl)
    ctx.drawImage(frameImg, 0, 0, frameConfig.canvasWidth, frameConfig.canvasHeight)
  } catch (e) {
    console.error('Failed to load frame image:', e)
  }
}
