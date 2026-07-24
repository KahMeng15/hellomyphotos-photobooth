const fs = require('fs')

// 1. Update EventControlPanel.vue
let panelCode = fs.readFileSync('frontend/src/components/EventControlPanel.vue', 'utf8')
panelCode = panelCode.replace(
  "import { ref, onMounted, computed, onUnmounted } from 'vue'",
  "import { ref, onMounted, computed, onUnmounted } from 'vue'\nimport { useRoute, useRouter } from 'vue-router'"
)
panelCode = panelCode.replace(
  "const emit = defineEmits(['close', 'retry'])",
  "const emit = defineEmits(['close', 'retry'])\nconst route = useRoute()\nconst router = useRouter()"
)
panelCode = panelCode.replace(
  "const showSettingsModal = ref(false)\nconst showEventSettingsModal = ref(false)",
  `const showSettingsModal = computed({
  get: () => route.query.modal === 'booth',
  set: (val) => {
    const q = { ...route.query }; if(val) q.modal='booth'; else delete q.modal;
    router.replace({ query: q })
  }
})
const showEventSettingsModal = computed({
  get: () => route.query.modal === 'event',
  set: (val) => {
    const q = { ...route.query }; if(val) q.modal='event'; else delete q.modal;
    router.replace({ query: q })
  }
})`
)
fs.writeFileSync('frontend/src/components/EventControlPanel.vue', panelCode)

// 2. Update EventDetailView.vue
let detailCode = fs.readFileSync('frontend/src/views/EventDetailView.vue', 'utf8')
detailCode = detailCode.replace(
  "import { ref, onMounted, onUnmounted, computed } from 'vue'",
  "import { ref, onMounted, onUnmounted, computed, watch } from 'vue'"
)
detailCode = detailCode.replace(
  "const event = ref<any>(null)",
  `
watch(() => route.query.session, (sessionId) => {
  if (sessionId) {
    const session = photoSessions.value.find((s: any) => s.sessionId === sessionId)
    if (session && photosStore.selectedSession?.sessionId !== sessionId) {
      photosStore.selectSession(session)
    }
  } else {
    if (photosStore.selectedSession) {
      photosStore.clearSelection()
    }
  }
})

watch(() => photosStore.selectedSession, (session) => {
  const query = { ...route.query }
  if (session) {
    query.session = session.sessionId
  } else {
    delete query.session
  }
  if (route.query.session !== query.session) {
    router.replace({ query })
  }
})

const event = ref<any>(null)`
)

detailCode = detailCode.replace(
  "photoSessions.value = data.sessions.filter((s: any) => s.archived)",
  `photoSessions.value = data.sessions.filter((s: any) => s.archived)
    if (route.query.session) {
      const session = photoSessions.value.find((s: any) => s.sessionId === route.query.session)
      if (session && !photosStore.selectedSession) photosStore.selectSession(session)
    }`
)

detailCode = detailCode.replace(
  "photoSessions.value = data.sessions",
  `photoSessions.value = data.sessions
    if (route.query.session) {
      const session = photoSessions.value.find((s: any) => s.sessionId === route.query.session)
      if (session && !photosStore.selectedSession) photosStore.selectSession(session)
    }`
)

fs.writeFileSync('frontend/src/views/EventDetailView.vue', detailCode)
console.log('Done')
