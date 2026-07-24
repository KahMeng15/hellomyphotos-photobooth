const fs = require('fs');

let content = fs.readFileSync('frontend/src/views/ShareView.vue', 'utf8');

// Update openPhoto(photo) to openPhoto(i)
content = content.replace(
  /<div v-for="photo in session\.photos" :key="photo\.id" class="photo-card">/g,
  `<div v-for="(photo, i) in session.photos" :key="photo.id" class="photo-card">`
);
content = content.replace(
  /@click="openPhoto\(photo\)"/g,
  `@click="openPhoto(i)"`
);

// Update lightbox HTML
const oldLightbox = `<div v-if="selectedPhoto" class="lightbox" @click.self="selectedPhoto = null">
        <button class="lightbox-close" @click="selectedPhoto = null">✕</button>
        <img :src="selectedPhoto.url" alt="Photo" class="lightbox-img" />
        <a :href="downloadUrl(selectedPhoto.id)" class="lightbox-download" download>
          Download JPEG
        </a>
      </div>`;

const newLightbox = `<div v-if="selectedPhotoIndex !== null" class="lightbox" @click.self="selectedPhotoIndex = null">
        <button class="lightbox-close" @click="selectedPhotoIndex = null">✕</button>
        
        <button v-if="selectedPhotoIndex > 0" class="lightbox-nav-btn lightbox-prev" @click.stop="prevPhoto">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <img :src="session.photos[selectedPhotoIndex].url" alt="Photo" class="lightbox-img" />

        <button v-if="selectedPhotoIndex < session.photos.length - 1" class="lightbox-nav-btn lightbox-next" @click.stop="nextPhoto">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        <a :href="downloadUrl(session.photos[selectedPhotoIndex].id)" class="lightbox-download" download @click.stop>
          Download JPEG
        </a>
      </div>`;

content = content.replace(oldLightbox, newLightbox);

// Update Vue script state
content = content.replace(
  /const selectedPhoto = ref<SessionPhoto \| null>\(null\)/g,
  `const selectedPhotoIndex = ref<number | null>(null)`
);

// Update functions
content = content.replace(
  /function openPhoto\(photo: SessionPhoto\) \{\s*selectedPhoto.value = photo\s*\}/g,
  `function openPhoto(index: number) {
  selectedPhotoIndex.value = index
}

function nextPhoto() {
  if (selectedPhotoIndex.value !== null && session.value && selectedPhotoIndex.value < session.value.photos.length - 1) {
    selectedPhotoIndex.value++
  }
}

function prevPhoto() {
  if (selectedPhotoIndex.value !== null && selectedPhotoIndex.value > 0) {
    selectedPhotoIndex.value--
  }
}`
);

// Add CSS for nav buttons
const newCSS = `.lightbox-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: white;
  padding: 1rem;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 1010;
}
.lightbox-nav-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}
.lightbox-prev { left: 2rem; }
.lightbox-next { right: 2rem; }

@media (max-width: 640px) {
  .lightbox-prev { left: 0.5rem; padding: 0.5rem; }
  .lightbox-next { right: 0.5rem; padding: 0.5rem; }
}

.lightbox-img {`;

content = content.replace(/\.lightbox-img \{/, newCSS);

fs.writeFileSync('frontend/src/views/ShareView.vue', content);
console.log('done');
