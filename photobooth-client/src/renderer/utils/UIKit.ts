export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize    = 'sm' | 'md' | 'lg'

export function createButton(
  label: string | HTMLElement,
  opts: { variant?: ButtonVariant; size?: ButtonSize; id?: string; onClick?: () => void } = {}
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'ui-btn'
  if (typeof label === 'string') {
    btn.textContent = label
  } else {
    btn.appendChild(label)
  }
  btn.dataset.variant = opts.variant ?? 'secondary'
  btn.dataset.size    = opts.size    ?? 'md'
  if (opts.id) btn.id = opts.id
  if (opts.onClick) btn.addEventListener('click', opts.onClick)
  return btn
}

export function createModal(opts: {
  title?: string
  content: string | HTMLElement
  actions?: HTMLElement[]
  size?: 'sm' | 'md'
  icon?: string
}): { overlay: HTMLDivElement; box: HTMLDivElement; close: () => void } {
  const overlay = document.createElement('div')
  overlay.className = 'ui-modal-overlay'
  
  const box = document.createElement('div')
  box.className = `ui-modal-box ui-modal-${opts.size ?? 'md'}`
  
  if (opts.icon) {
    box.innerHTML += `<div style="margin-bottom: var(--space-4)">${opts.icon}</div>`
  }

  if (opts.title) {
    const title = document.createElement('h2')
    title.className = 'ui-modal-title'
    title.textContent = opts.title
    box.appendChild(title)
  }

  const contentWrap = document.createElement('div')
  contentWrap.className = 'ui-modal-content'
  if (typeof opts.content === 'string') {
    contentWrap.innerHTML = opts.content
  } else {
    contentWrap.appendChild(opts.content)
  }
  box.appendChild(contentWrap)

  if (opts.actions && opts.actions.length > 0) {
    const actionsWrap = document.createElement('div')
    actionsWrap.className = 'ui-modal-actions'
    opts.actions.forEach(a => actionsWrap.appendChild(a))
    box.appendChild(actionsWrap)
  }

  overlay.appendChild(box)
  return { overlay, box, close: () => overlay.remove() }
}

export function createInput(opts: {
  type?: string; placeholder?: string; value?: string; id?: string
}): HTMLInputElement {
  const input = document.createElement('input')
  input.className = 'ui-input'
  Object.assign(input, { type: opts.type ?? 'text', placeholder: opts.placeholder ?? '', value: opts.value ?? '' })
  if (opts.id) input.id = opts.id
  return input
}

export function createSpinner(label?: string): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'ui-spinner-wrap'
  wrap.innerHTML = `
    <div class="ui-spinner"></div>
    ${label ? `<div class="ui-spinner-label">${label}</div>` : ''}
  `
  return wrap
}

export function createStatusBadge(
  status: 'success' | 'error' | 'warning' | 'pending' | 'uploading',
  text: string
): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = `ui-badge ui-badge-${status}`
  badge.textContent = text
  return badge
}

export function createThemeToggle(): HTMLButtonElement {
  const btn = createButton('', { variant: 'ghost', size: 'sm' })
  const isDark = () => document.documentElement.dataset.theme === 'dark' || !document.documentElement.dataset.theme
  
  const update = () => { btn.textContent = isDark() ? '☀️ Light' : '🌙 Dark' }
  
  btn.addEventListener('click', () => {
    document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'
    localStorage.setItem('theme', document.documentElement.dataset.theme)
    update()
  })
  
  // Restore persisted preference
  const saved = localStorage.getItem('theme')
  if (saved) document.documentElement.dataset.theme = saved
  update()
  
  return btn
}
