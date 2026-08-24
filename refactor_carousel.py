import os

filepath = 'photobooth-client/src/renderer/components/FrameCarousel.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Replace constructor body
replacement1 = """  constructor(container: HTMLElement, onChange: (frameId: string | null) => void) {
    this.container = container
    this.onChange = onChange

    this.carouselEl = document.createElement('div')
    this.carouselEl.className = 'ui-carousel'
    container.appendChild(this.carouselEl)
  }"""

start1 = content.find("  constructor(container: HTMLElement")
end1 = content.find("  async loadFrames(")

if start1 != -1 and end1 != -1:
    content = content[:start1] + replacement1 + "\n\n" + content[end1:]

# Replace render method
replacement2 = """  private render() {
    this.carouselEl.innerHTML = ''

    const noneBtn = document.createElement('button')
    noneBtn.textContent = 'No Frame'
    noneBtn.className = 'ui-frame-btn'
    if (this.selectedId === null) noneBtn.dataset.active = 'true'
    noneBtn.addEventListener('click', () => {
      this.selectedId = null
      this.onChange(null)
      this.render()
    })
    this.carouselEl.appendChild(noneBtn)

    for (const frame of this.frames) {
      const btn = document.createElement('button')
      btn.textContent = frame.name
      btn.className = 'ui-frame-btn'
      if (this.selectedId === frame.id) btn.dataset.active = 'true'
      btn.addEventListener('click', () => {
        this.selectedId = frame.id
        this.onChange(frame.id)
        this.render()
      })
      this.carouselEl.appendChild(btn)
    }
  }
}"""

start2 = content.find("  private render() {")
end2 = content.find("}\n") # end of class

if start2 != -1:
    content = content[:start2] + replacement2 + "\n"

with open(filepath, 'w') as f:
    f.write(content)

print("FrameCarousel refactored.")
