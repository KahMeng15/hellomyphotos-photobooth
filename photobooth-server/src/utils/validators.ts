export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255)
}

export function isValidPhotoCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 4
}

export function isValidCountdown(seconds: number): boolean {
  return Number.isInteger(seconds) && seconds >= 3 && seconds <= 10
}

export function sanitizeEventName(name: string): string {
  return name.replace(/[<>&'"]/g, '').trim().substring(0, 100)
}

export function validateFrameName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp)$/i.test(name)
}
