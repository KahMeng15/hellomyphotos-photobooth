const basePath = '/snapsync';

interface SessionPhoto {
  id: string
  url: string
  thumbnail: string | null
  size: number
  frameId?: string
  frameName?: string
  downloadUrl?: string
}

interface SessionData {
  sessionId: string
  photoCount: number
  frameName: string | null
  createdAt: string
  expiresAt?: string | null
  photos: SessionPhoto[]
  organizer?: string
  contactInfo?: string
  eventName?: string
}

const $ = (id: string) => document.getElementById(id)!;
const $$ = (sel: string) => document.querySelectorAll(sel);

let sessionData: SessionData | null = null;
let currentPhotoIdx = 0;
let animationPhotos: SessionPhoto[] = [];
let heroInterval: number | null = null;
let heroIndex = 0;

async function init() {
  const parts = window.location.pathname.split('/');
  let token = parts.pop();
  if (!token) token = parts.pop(); // handle trailing slash

  if (!token) {
    $('loader').classList.add('hidden');
    $('error').classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`${basePath}/api/share/${token}`);
    const data = await res.json();

    $('loader').classList.add('hidden');

    if (data.expired) {
      $('expired').classList.remove('hidden');
      return;
    }

    if (data.error) {
      $('error').classList.remove('hidden');
      return;
    }

    sessionData = data;
    render(token);

    // Analytics ping
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('ref') === 'qr' ? 'qr' : 'direct';
    fetch(`${basePath}/api/share/${token}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source })
    }).catch(() => {});
  } catch (err) {
    console.error(err);
    $('loader').classList.add('hidden');
    $('error').classList.remove('hidden');
  }
}

function render(token: string) {
  $('content').classList.remove('hidden');
  $('footer').classList.remove('hidden');

  $('event-name').textContent = sessionData!.eventName || 'hellomyphotos';
  
  if (sessionData!.organizer) {
    if (sessionData!.contactInfo) {
      const link = $('contact-link');
      link.textContent = sessionData!.organizer;
      link.classList.remove('hidden');
      link.onclick = (e) => { e.preventDefault(); $('contact-modal').classList.add('active'); };
      $('contact-info-text').textContent = sessionData!.contactInfo;
    } else {
      $('organizer-text').textContent = sessionData!.organizer;
    }
  }

  const groups: Record<string, SessionPhoto[]> = {};
  for (const p of sessionData!.photos) {
    const fid = p.frameId || 'unframed';
    if (!groups[fid]) groups[fid] = [];
    groups[fid].push(p);
  }
  for (const fid in groups) {
    if (groups[fid].length >= 2) {
      animationPhotos = groups[fid];
      break;
    }
  }
  if (animationPhotos.length < 2) animationPhotos = sessionData!.photos;

  if (animationPhotos.length >= 2) {
    $('hero-preview').classList.remove('hidden');
    updateHero();
    heroInterval = window.setInterval(() => {
      heroIndex = (heroIndex + 1) % animationPhotos.length;
      updateHero();
    }, 500);
  }

  const grid = $('photo-grid');
  sessionData!.photos.forEach((photo, i) => {
    const thumbUrl = photo.thumbnail || photo.url;
    
    const card = document.createElement('div');
    card.className = 'photo-card';
    
    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-img-wrap';
    imgWrap.onclick = () => openLightbox(i);

    const blur = document.createElement('div');
    blur.className = 'blur-bg';
    blur.style.backgroundImage = `url(${thumbUrl})`;
    
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.loading = 'lazy';
    img.onload = () => img.classList.add('loaded');

    imgWrap.appendChild(blur);
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);

    const btn = document.createElement('a');
    btn.className = 'download-btn';
    btn.download = '';
    const dlUrl = photo.downloadUrl || '#';
    const sep = dlUrl.includes('?') ? '&' : '?';
    btn.href = dlUrl + sep + 'download=1';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download JPEG`;
    card.appendChild(btn);

    grid.appendChild(card);
  });

  if (sessionData!.expiresAt) {
    const d = new Date(sessionData!.expiresAt);
    $('expiry-text').textContent = `Link expires on ${d.toLocaleString()}`;
  }

  $('download-all-btn').onclick = () => {
    const a = document.createElement('a');
    a.href = `${basePath}/api/share/${token}/download-all`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
}

function updateHero() {
  const p = animationPhotos[heroIndex];
  if (!p) return;
  const url = p.thumbnail || p.url;
  $('hero-blur').style.backgroundImage = `url(${url})`;
  $('hero-img').setAttribute('src', url);
}

function openLightbox(idx: number) {
  currentPhotoIdx = idx;
  $('lightbox').classList.add('active');
  updateLightbox();
}

function updateLightbox() {
  const p = sessionData!.photos[currentPhotoIdx];
  const thumbUrl = p.thumbnail || p.url;
  
  $('lb-blur').style.backgroundImage = `url(${thumbUrl})`;
  
  const thumb = $('lb-thumb') as HTMLImageElement;
  thumb.src = thumbUrl;
  thumb.classList.remove('thumb-hidden');

  const img = $('lb-img') as HTMLImageElement;
  img.classList.remove('lb-loaded');
  img.onload = () => {
    img.classList.add('lb-loaded');
    thumb.classList.add('thumb-hidden');
  };
  img.src = p.url;

  $('lb-prev').style.display = currentPhotoIdx > 0 ? 'block' : 'none';
  $('lb-next').style.display = currentPhotoIdx < sessionData!.photos.length - 1 ? 'block' : 'none';
}

$('lb-close').onclick = () => $('lightbox').classList.remove('active');
$('modal-close').onclick = () => $('contact-modal').classList.remove('active');
$('lb-prev').onclick = (e) => { e.stopPropagation(); if (currentPhotoIdx > 0) { currentPhotoIdx--; updateLightbox(); } };
$('lb-next').onclick = (e) => { e.stopPropagation(); if (currentPhotoIdx < sessionData!.photos.length - 1) { currentPhotoIdx++; updateLightbox(); } };

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    $('lightbox').classList.remove('active');
    $('contact-modal').classList.remove('active');
  } else if ($('lightbox').classList.contains('active')) {
    if (e.key === 'ArrowLeft' && currentPhotoIdx > 0) {
      currentPhotoIdx--; updateLightbox();
    } else if (e.key === 'ArrowRight' && currentPhotoIdx < sessionData!.photos.length - 1) {
      currentPhotoIdx++; updateLightbox();
    }
  }
});

init();
