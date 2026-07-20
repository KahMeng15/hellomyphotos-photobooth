import sharp from 'sharp'
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

function outputDir(eventDir?: string): string {
  return eventDir || config.storage.photos
}

export async function processSinglePhoto(
  rawPath: string,
  frameName: string | null,
  outputName: string,
  eventDir?: string,
  watermarkText?: string
): Promise<ProcessedImage> {
  try {
    const dir = outputDir(eventDir)
    const framePath = frameName
      ? path.join(config.storage.frames, frameName)
      : null
    const outputPath = path.join(dir, outputName)

    const rawMetadata = await sharp(rawPath).metadata()
    let frameWidth = rawMetadata.width || 1200
    let frameHeight = rawMetadata.height || 1800

    if (framePath) {
      try {
        const frameMetadata = await sharp(framePath).metadata()
        frameWidth = frameMetadata.width || 1200
        frameHeight = frameMetadata.height || 1800
      } catch {
        logger.warn(`Frame not found: ${framePath}, using default dimensions`)
      }
    }

    let pipeline = sharp(rawPath).rotate()

    if (framePath) {
      try {
        pipeline = pipeline.composite([{ input: framePath, blend: 'over' }])
      } catch (err: any) {
        logger.warn(`Frame composite failed: ${err.message}`)
      }
    }

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

    const composites = imagePaths.map((imgPath, idx) => ({
      input: imgPath,
      top: padding + idx * (photoHeight + padding),
      left: padding,
    }))

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
