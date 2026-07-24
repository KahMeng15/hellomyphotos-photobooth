const fs = require('fs')

// 1. Update db.ts
let dbCode = fs.readFileSync('src/db.ts', 'utf8')
if (!dbCode.includes('regenerateSessionShareId')) {
  dbCode = dbCode.replace(
    "export function getPhotoSessionByShareId(shareId: string)",
    "export function regenerateSessionShareId(sessionId: string) {\n  const newShareId = generateId(8)\n  db.prepare('UPDATE photo_sessions SET share_id = ? WHERE id = ?').run(newShareId, sessionId)\n  return newShareId\n}\n\nexport function getPhotoSessionByShareId(shareId: string)"
  )
  fs.writeFileSync('src/db.ts', dbCode)
}

// 2. Update admin.ts
let adminCode = fs.readFileSync('src/routes/admin.ts', 'utf8')
if (!adminCode.includes('reset-link')) {
  adminCode = adminCode.replace(
    "import {",
    "import {\n  regenerateSessionShareId,"
  )
  adminCode = adminCode.replace(
    "router.post('/events/:id/end', async (req: Request, res: Response) => {",
    "router.post('/events/:eventId/sessions/:sessionId/reset-link', async (req: Request, res: Response) => {\n    try {\n      const newShareId = regenerateSessionShareId(req.params.sessionId)\n      res.json({ shareId: newShareId })\n    } catch (err) {\n      res.status(500).json({ error: 'Failed to reset link' })\n    }\n  })\n\n  router.post('/events/:id/end', async (req: Request, res: Response) => {"
  )
  fs.writeFileSync('src/routes/admin.ts', adminCode)
}

// 3. Update SessionViewer.vue
let vueCode = fs.readFileSync('frontend/src/components/SessionViewer.vue', 'utf8')
if (!vueCode.includes('resetShareLink')) {
  vueCode = vueCode.replace(
    '<button @click="copyShareLink" class="btn-action">\n            {{ linkCopied ? \'Copied!\' : \'Copy Share Link\' }}\n          </button>',
    '<button @click="copyShareLink" class="btn-action">\n            {{ linkCopied ? \'Copied!\' : \'Copy Share Link\' }}\n          </button>\n          <button @click="resetShareLink" class="btn-action btn-danger" style="margin-left: 0.5rem;" :disabled="resettingLink">\n            {{ resettingLink ? \'Resetting...\' : \'Reset Link\' }}\n          </button>'
  )
  vueCode = vueCode.replace(
    "const linkCopied = ref(false)",
    "const linkCopied = ref(false)\nconst resettingLink = ref(false)"
  )
  vueCode = vueCode.replace(
    "async function copyShareLink() {",
    "async function resetShareLink() {\n  if (!confirm('Are you sure you want to reset the share link? The old link will stop working immediately.')) return\n  resettingLink.value = true\n  try {\n    const { data } = await axios.post(`/api/admin/events/${props.session.eventId}/sessions/${props.session.sessionId}/reset-link`)\n    if (data.shareId) {\n      (props.session as any).share_id = data.shareId\n      // Regenerate the share url for display if needed\n    }\n  } catch (err) {\n    shareError.value = 'Failed to reset link'\n  }\n  resettingLink.value = false\n}\n\nasync function copyShareLink() {"
  )
  fs.writeFileSync('frontend/src/components/SessionViewer.vue', vueCode)
}

console.log('Done')
