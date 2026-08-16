const axios = require('axios');
const fs = require('fs');
const { Readable } = require('stream');

const buf = Buffer.alloc(10 * 1024 * 1024); // 10MB
let offset = 0;
const stream = new Readable({
  read(size) {
    if (offset >= buf.length) return this.push(null);
    const chunk = buf.subarray(offset, Math.min(offset + 1024 * 1024, buf.length));
    offset += chunk.length;
    setTimeout(() => this.push(chunk), 100);
  }
});

const server = require('http').createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => res.end('ok'));
});

server.listen(3006, async () => {
  console.log('Server running');
  try {
    await axios.post('http://localhost:3006/', stream, {
      headers: { 'Content-Length': buf.length.toString() },
      onUploadProgress: (p) => console.log('Progress:', p.loaded, p.total)
    });
    console.log('Done');
  } catch(e) {
    console.error(e);
  }
  server.close();
});
