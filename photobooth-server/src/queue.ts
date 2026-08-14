import { EventEmitter } from 'events'
import { config } from './config'
import { logger } from './utils/logger'

interface QueueJob {
  id: string
  type: 'process-photo' | 'generate-thumbnail' | 'compile-strip' | 'apply-watermark'
  data: any
  priority: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  createdAt: Date
  completedAt?: Date
}

class AsyncJobQueue extends EventEmitter {
  private queue: QueueJob[] = []
  private activeCount = 0
  private maxConcurrent: number

  constructor(maxConcurrent = config.imageProcessing.maxConcurrent) {
    super()
    this.maxConcurrent = maxConcurrent
  }

  enqueue(job: Omit<QueueJob, 'status' | 'createdAt'>): void {
    const newJob: QueueJob = {
      ...job,
      status: 'pending',
      createdAt: new Date(),
    }

    this.queue.push(newJob)
    this.queue.sort((a, b) => b.priority - a.priority)
    this.emit('enqueued', newJob)
    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent) return

    const job = this.queue.find((j) => j.status === 'pending')
    if (!job) return

    job.status = 'processing'
    this.activeCount++
    this.emit('processing', job)

    try {
      const result = await this.executeJob(job)
      job.status = 'completed'
      job.completedAt = new Date()
      this.emit('completed', job, result)
      logger.info(`Job completed: ${job.id} (${job.type})`)
    } catch (error: any) {
      job.status = 'failed'
      job.error = error.message
      this.emit('failed', job, error)
      logger.error(`Job failed: ${job.id} (${job.type}): ${error.message}`)
    } finally {
      this.activeCount--
      this.emit('done', job)
      this.processNext()
    }
  }

  private async executeJob(job: QueueJob): Promise<any> {
    const {
      processSinglePhoto,
      generateThumbnail,
      compileVerticalStrip,
      applyWatermark,
    } = await import('./pipeline')

    switch (job.type) {
      case 'process-photo':
        return processSinglePhoto(
          job.data.rawPath,
          job.data.outputName,
          job.data.eventDir,
          job.data.watermarkText
        )

      case 'generate-thumbnail':
        return generateThumbnail(job.data.inputPath, job.data.outputName, job.data.eventDir)

      case 'compile-strip':
        return compileVerticalStrip(
          job.data.imagePaths,
          job.data.photoCount,
          job.data.outputName,
          job.data.eventDir
        )

      case 'apply-watermark':
        return applyWatermark(
          job.data.inputPath,
          job.data.outputName,
          job.data.watermarkText,
          job.data.eventDir
        )

      default:
        throw new Error(`Unknown job type: ${job.type}`)
    }
  }

  get depth(): number {
    return this.queue.filter((j) => j.status === 'pending' || j.status === 'processing').length
  }

  get stats() {
    return {
      depth: this.depth,
      active: this.activeCount,
      pending: this.queue.filter((j) => j.status === 'pending').length,
      completed: this.queue.filter((j) => j.status === 'completed').length,
      failed: this.queue.filter((j) => j.status === 'failed').length,
      total: this.queue.length,
    }
  }

  clearCompleted(): void {
    this.queue = this.queue.filter(
      (j) => j.status === 'pending' || j.status === 'processing'
    )
  }
}

export const jobQueue = new AsyncJobQueue()
