import { generateSignedUrl, verifySignedUrl } from './src/utils/signedUrls.js';

const token = 'test-token-123';
const file = 'idx_0';

const signedUrl = generateSignedUrl(token, file, 3600);
console.log('Generated Signed URL:', signedUrl);

// Extract params
const url = new URL('http://localhost' + signedUrl);
const exp = url.searchParams.get('exp');
const sig = url.searchParams.get('sig');

console.log('Verify correct signature:', verifySignedUrl(token, file, exp!, sig!));
console.log('Verify tampered signature:', verifySignedUrl(token, file, exp!, sig! + 'a'));
console.log('Verify tampered file:', verifySignedUrl(token, 'idx_1', exp!, sig!));
