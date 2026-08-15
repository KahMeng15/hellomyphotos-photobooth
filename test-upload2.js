const fs = require('fs');

async function run() {
  const form = new FormData();
  form.append('sessionId', 'session_test_123');
  form.append('photoCount', '1');
  
  const buffer = fs.readFileSync('photobooth-server/storage/photos/evt_1784549590164_5020/60b2cab2-5c44-4536-97c6-6917283eaf73.jpg');
  const blob = new Blob([buffer]);
  form.append('photos', blob, 'test.jpg');
  
  try {
    const response = await fetch('http://localhost:3000/api/booth/upload', {
      method: 'POST',
      body: form,
      headers: {
        'X-Booth-OTP': '626036'
      }
    });
    
    console.log(response.status);
    console.log(await response.text());
  } catch (err) {
    console.error(err);
  }
}
run();
