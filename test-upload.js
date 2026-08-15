const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch'); // or use undici if node 18+ native fetch

async function run() {
  const form = new FormData();
  form.append('sessionId', 'session_test_123');
  form.append('photoCount', '1');
  form.append('photos', fs.createReadStream('photobooth-server/storage/photos/evt_1784549590164_5020/60b2cab2-5c44-4536-97c6-6917283eaf73.jpg'));
  
  try {
    const response = await fetch('http://localhost:3000/api/booth/upload', {
      method: 'POST',
      body: form,
      headers: {
        'X-Booth-OTP': '626036',
        ...form.getHeaders()
      }
    });
    
    console.log(response.status);
    console.log(await response.text());
  } catch (err) {
    console.error(err);
  }
}
run();
