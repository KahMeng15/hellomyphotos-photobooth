const fs = require('fs');

let content = fs.readFileSync('frontend/src/views/ShareView.vue', 'utf8');

// Move button and wrap in share-content
const oldHTML = `<template v-else-if="session">
      <header class="share-header">
        <h1>{{ session.eventName || 'hellomyphotos' }}</h1>
        <p class="subtitle">here are your photos</p>
        <button @click="downloadAll" class="btn-download-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download All
        </button>
      </header>

      <div class="photo-grid">
        <div v-for="(photo, i) in session.photos" :key="photo.id" class="photo-card">
          <img :src="photo.thumbnail || photo.url" :alt="'Photo'" loading="lazy" @click="openPhoto(i)" />
          <a :href="downloadUrl(photo.id)" class="download-btn" download>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download JPEG
          </a>
        </div>
      </div>`;

const newHTML = `<template v-else-if="session">
      <div class="share-content">
        <header class="share-header">
          <h1>{{ session.eventName || 'hellomyphotos' }}</h1>
          <p class="subtitle">here are your photos</p>
        </header>

        <div class="photo-grid">
          <div v-for="(photo, i) in session.photos" :key="photo.id" class="photo-card">
            <img :src="photo.thumbnail || photo.url" :alt="'Photo'" loading="lazy" @click="openPhoto(i)" />
            <a :href="downloadUrl(photo.id)" class="download-btn" download>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download JPEG
            </a>
          </div>
        </div>

        <div class="actions-wrapper">
          <button @click="downloadAll" class="btn-download-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download All
          </button>
        </div>
      </div>`;

content = content.replace(oldHTML, newHTML);

// Close share-content wrapper logic - wait, oldHTML didn't include footer, so share-content wrapper will just end before footer naturally if I put it in the HTML above! Wait, no!
// Let me verify if `<div class="share-content">` is properly closed. Yes, I added `</div>` at the end of newHTML. So it wraps the header, photo-grid, and the new actions-wrapper. This leaves the footer outside.

// Add CSS
const oldCSS = `.share-page {
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}`;

const newCSS = `.share-page {
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}

.share-content {
  flex: 1;
}

.actions-wrapper {
  text-align: center;
  padding: 1rem;
  margin-bottom: 2rem;
}`;

content = content.replace(oldCSS, newCSS);

// Also remove margin-top from btn-download-all since we wrapped it
content = content.replace(/margin-top: 1rem;/g, 'margin-top: 0;');

fs.writeFileSync('frontend/src/views/ShareView.vue', content);
console.log('done');
