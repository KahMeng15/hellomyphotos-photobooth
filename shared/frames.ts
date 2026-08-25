import fs from 'fs/promises'
import path from 'path'
import { config } from './config'
import { logger } from './logger'

export interface FrameConfig {
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  layout: '1x3' | '1x4' | '2x2' | 'single';
  photoBoxes: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  }[];
  disabled?: boolean;
}

export async function getActiveFrames(eventId: string): Promise<{ id: string, config: FrameConfig, imagePath: string }[]> {
  const framesDir = config.eventFrames(eventId)
  try {
    const frameDirs = await fs.readdir(framesDir)
    const activeFrames: { id: string, config: FrameConfig, imagePath: string }[] = []

    for (const frameId of frameDirs) {
      const configPath = path.join(framesDir, frameId, 'config.json')
      const imagePath = path.join(framesDir, frameId, 'frame.png')
      
      try {
        const configData = await fs.readFile(configPath, 'utf8')
        const frameConfig: FrameConfig = JSON.parse(configData)
        
        if (!frameConfig.disabled) {
          activeFrames.push({ id: frameId, config: frameConfig, imagePath })
        }
      } catch (err: any) {
        logger.warn(`Could not load frame config for ${frameId}: ${err.message}`)
      }
    }
    
    return activeFrames
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [] // No frames dir for this event
    }
    throw err
  }
}
