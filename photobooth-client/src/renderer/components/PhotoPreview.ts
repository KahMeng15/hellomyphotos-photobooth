export class PhotoPreview {
  private container: HTMLElement
  private overlay: HTMLDivElement
  private onRetake: () => void
  private onConfirm: () => void
  private onExit: () => void

  constructor(container: HTMLElement, onRetake: () => void, onConfirm: () => void, onExit: () => void) {
    this.container = container
    this.onRetake = onRetake
    this.onConfirm = onConfirm
    this.onExit = onExit

    this.overlay = document.createElement('div')
    this.overlay.style.cssText = `
      position: absolute; inset: 0; background: rgba(0,0,0,0.9);
      display: none; flex-direction: column; align-items: center;
      justify-content: center; z-index: 20; padding: 2rem;
    `
    this.container.appendChild(this.overlay)
  }

  show(paths: string[]) {
    this.overlay.innerHTML = ''
    this.overlay.style.display = 'flex'

    const title = document.createElement('h2')
    title.textContent = 'Your Photos'
    title.style.cssText = 'font-size: 2rem; font-weight: 700; margin-bottom: 2rem;'
    this.overlay.appendChild(title)

    const grid = document.createElement('div')
    grid.style.cssText = `
      display: grid; grid-template-columns: repeat(${Math.min(paths.length, 2)}, 1fr);
      gap: 1rem; max-width: 800px; width: 100%; margin-bottom: 2rem;
    `

    for (const p of paths) {
      const img = document.createElement('img')
      img.style.cssText = 'width: 100%; border-radius: 8px; aspect-ratio: 3/4; object-fit: cover;'
      img.src = p.startsWith('blob:') || p.startsWith('http') ? p : `file://${p}`
      grid.appendChild(img)
    }

    this.overlay.appendChild(grid)

    const actions = document.createElement('div')
    actions.style.cssText = 'display: flex; gap: 1rem;'

    const retakeBtn = document.createElement('button')
    retakeBtn.textContent = 'Retake'
    retakeBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
      background: #444; color: #fff; border: none; border-radius: 100px;
      cursor: pointer;
    `
    retakeBtn.addEventListener('click', () => {
      this.hide()
      this.onRetake()
    })
    actions.appendChild(retakeBtn)

    const confirmBtn = document.createElement('button')
    confirmBtn.textContent = 'Looks Great!'
    confirmBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
      background: #fff; color: #000; border: none; border-radius: 100px;
      cursor: pointer;
    `
    confirmBtn.addEventListener('click', () => {
      this.hide()
      this.onConfirm()
    })
    actions.appendChild(confirmBtn)

    const exitBtn = document.createElement('button')
    exitBtn.textContent = 'Exit'
    exitBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
      background: transparent; color: #888; border: 1px solid #555; border-radius: 100px;
      cursor: pointer;
    `
    exitBtn.addEventListener('click', () => {
      this.hide()
      this.onExit()
    })
    actions.appendChild(exitBtn)

    this.overlay.appendChild(actions)
  }

  hide() {
    this.overlay.style.display = 'none'
  }
}
