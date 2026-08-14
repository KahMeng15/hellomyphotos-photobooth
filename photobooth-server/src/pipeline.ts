import sharp from 'sharp'
import type { OverlayOptions } from 'sharp'
import path from 'path'
import fs from 'fs/promises'
import { config } from './config'
import { logger } from './utils/logger'

export interface ProcessedImage {
  path: string
  size: number
  width: number
  height: number
}

export interface FramePlaceholder {
  index: number
  x: number
  y: number
  width: number
  height: number
  borderRadius: number
}

export interface FrameConfig {
  id: string
  name: string
  disabled: boolean
  canvasWidth: number
  canvasHeight: number
  layering?: 'foreground' | 'background'
  placeholders: FramePlaceholder[]
}

function outputDir(eventDir?: string): string {
  return eventDir || config.storage.photos
}

export async function processSinglePhoto(
  rawPath: string,
  outputName: string,
  eventDir?: string,
  watermarkText?: string
): Promise<ProcessedImage> {
  try {
    const dir = outputDir(eventDir)
    const outputPath = path.join(dir, outputName)

    const rawMetadata = await sharp(rawPath).metadata()
    let frameWidth = rawMetadata.width || 1200
    let frameHeight = rawMetadata.height || 1800

    let pipeline = sharp(rawPath).rotate()

    if (watermarkText) {
      const svgWatermark = Buffer.from(
        `<svg width="${frameWidth}" height="${frameHeight}">
          <text x="20" y="${frameHeight - 20}" font-size="20" fill="white" opacity="0.7"
            font-family="sans-serif">${escapeXml(watermarkText)}</text>
        </svg>`
      )
      pipeline = pipeline.composite([{ input: svgWatermark }])
    }

    await pipeline.webp({ quality: config.imageProcessing.webpQuality, effort: 4 }).toFile(outputPath)

    const stats = await fs.stat(outputPath)
    const metadata = await sharp(outputPath).metadata()

    logger.info(`Processed: ${outputName} (${Math.round(stats.size / 1024)}KB)`)

    return { path: outputPath, size: stats.size, width: metadata.width || 0, height: metadata.height || 0 }
  } catch (error: any) {
    logger.error(`Processing failed: ${error.message}`)
    throw error
  }
}

export async function compileVerticalStrip(
  imagePaths: string[],
  photoCount: number,
  outputName: string,
  eventDir?: string
): Promise<ProcessedImage> {
  try {
    const dir = outputDir(eventDir)
    const outputPath = path.join(dir, outputName)

    const photoWidth = 900
    const photoHeight = 1100
    const padding = 40
    const stripHeight = photoHeight * photoCount + padding * (photoCount + 1)
    const stripWidth = photoWidth + padding * 2

    const composites = await Promise.all(
      imagePaths.map(async (imgPath, idx) => {
        const resizedBuffer = await sharp(imgPath)
          .resize(photoWidth, photoHeight, { fit: 'cover' })
          .toBuffer()
          
        return {
          input: resizedBuffer,
          top: padding + idx * (photoHeight + padding),
          left: padding,
        }
      })
    )

    const strip = await sharp({
      create: {
        width: stripWidth,
        height: stripHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(composites)
      .webp({ quality: config.imageProcessing.stripQuality, effort: 4 })
      .toFile(outputPath)

    logger.info(`Strip created: ${outputName} (${Math.round(strip.size / 1024)}KB)`)

    return { path: outputPath, size: strip.size, width: stripWidth, height: stripHeight }
  } catch (error: any) {
    logger.error(`Strip compilation failed: ${error.message}`)
    throw error
  }
}

export async function generateThumbnail(
  inputPath: string,
  outputName: string,
  eventDir?: string
): Promise<{ path: string }> {
  try {
    const dir = outputDir(eventDir)
    const outputPath = path.join(dir, outputName)

    await sharp(inputPath)
      .resize(config.imageProcessing.thumbnailSize, config.imageProcessing.thumbnailSize, {
        fit: 'inside',
      })
      .webp({ quality: config.imageProcessing.thumbnailQuality, effort: 5 })
      .toFile(outputPath)

    return { path: outputPath }
  } catch (error: any) {
    logger.error(`Thumbnail generation failed: ${error.message}`)
    throw error
  }
}

export async function applyWatermark(
  inputPath: string,
  outputName: string,
  watermarkText: string,
  eventDir?: string
): Promise<ProcessedImage> {
  try {
    const dir = outputDir(eventDir)
    const outputPath = path.join(dir, outputName)
    const metadata = await sharp(inputPath).metadata()
    const w = metadata.width || 1200
    const h = metadata.height || 1800

    const svgWatermark = Buffer.from(
      `<svg width="${w}" height="${h}">
        <text x="20" y="${h - 20}" font-size="20" fill="white" opacity="0.7"
          font-family="sans-serif">${escapeXml(watermarkText)}</text>
      </svg>`
    )

    await sharp(inputPath)
      .composite([{ input: svgWatermark }])
      .webp({ quality: config.imageProcessing.webpQuality, effort: 4 })
      .toFile(outputPath)

    const stats = await fs.stat(outputPath)
    return { path: outputPath, size: stats.size, width: w, height: h }
  } catch (error: any) {
    logger.error(`Watermark failed: ${error.message}`)
    throw error
  }
}

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case "'": return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}

export async function applyFrame(
  rawPaths: string[],
  frameConfig: FrameConfig,
  frameImagePath: string,
  outputBaseName: string,
  outputDir: string
): Promise<{ webp: ProcessedImage; jpeg: ProcessedImage; thumb: ProcessedImage }> {
  if (rawPaths.length !== frameConfig.placeholders.length) {
    throw new Error('Photo count does not match frame placeholder count')
  }

  const canvasWidth = Math.round(frameConfig.canvasWidth)
  const canvasHeight = Math.round(frameConfig.canvasHeight)
  const placeholders = frameConfig.placeholders

  const composites: OverlayOptions[] = []

  for (let i = 0; i < placeholders.length; i++) {
    const p = placeholders[i]
    const rawPath = rawPaths[i]
    
    const pWidth = Math.round(p.width)
    const pHeight = Math.round(p.height)
    const pX = Math.round(p.x)
    const pY = Math.round(p.y)

    let img = sharp(rawPath)
      .rotate()
      .resize(pWidth, pHeight, { fit: 'cover' })

    if (p.borderRadius > 0) {
      const rx = p.borderRadius
      const ry = p.borderRadius
      const svgMask = Buffer.from(
        `<svg width="${pWidth}" height="${pHeight}"><rect x="0" y="0" width="${pWidth}" height="${pHeight}" rx="${rx}" ry="${ry}" fill="#fff" /></svg>`
      )
      img = img.composite([{ input: svgMask, blend: 'dest-in' }])
    }

    const imgBuffer = await img.toBuffer()

    composites.push({
      input: imgBuffer,
      top: pY,
      left: pX
    })
  }

  const resizedFrameBuffer = await sharp(frameImagePath)
    .resize(canvasWidth, canvasHeight, { fit: 'fill' })
    .toBuffer()

  const frameComposite = {
    input: resizedFrameBuffer,
    blend: 'over' as const
  }
  
  if (frameConfig.layering === 'background') {
    composites.unshift(frameComposite)
  } else {
    composites.push(frameComposite)
  }

  let maxW = canvasWidth
  let maxH = canvasHeight
  for (const p of placeholders) {
    if (Math.round(p.width) > maxW) maxW = Math.round(p.width)
    if (Math.round(p.height) > maxH) maxH = Math.round(p.height)
  }

  const compositedBuffer = await sharp({
    create: {
      width: maxW,
      height: maxH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(composites).png().toBuffer()

  const pipeline = sharp(compositedBuffer).extract({ left: 0, top: 0, width: canvasWidth, height: canvasHeight })

  const webpPath = path.join(outputDir, `${outputBaseName}.webp`)
  const jpegPath = path.join(outputDir, `${outputBaseName}.jpg`)
  const thumbPath = path.join(outputDir, `${outputBaseName}_thumb.webp`)

  await fs.mkdir(outputDir, { recursive: true })

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const jpegQuality = config.imageProcessing.framedJpegQuality || 95

  await pipeline.clone().webp({ quality: config.imageProcessing.webpQuality, effort: 4 }).toFile(webpPath)
  await pipeline.clone().flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: jpegQuality }).toFile(jpegPath)
  await pipeline.clone().resize(config.imageProcessing.thumbnailSize, config.imageProcessing.thumbnailSize, { fit: 'inside' }).webp({ quality: config.imageProcessing.thumbnailQuality, effort: 5 }).toFile(thumbPath)

  const webpStats = await fs.stat(webpPath)
  const jpegStats = await fs.stat(jpegPath)
  const thumbStats = await fs.stat(thumbPath)

  return {
    webp: { path: webpPath, size: webpStats.size, width: canvasWidth, height: canvasHeight },
    jpeg: { path: jpegPath, size: jpegStats.size, width: canvasWidth, height: canvasHeight },
    thumb: { path: thumbPath, size: thumbStats.size, width: 0, height: 0 }
  }
}

