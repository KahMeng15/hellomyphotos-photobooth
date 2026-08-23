import crypto from 'crypto';
const sig1 = 'ac9618e2c3fa742784cc13491c996b2fd520871f7a9df88cef097d3e74d18c34'
const sig2 = 'bc9618e2c3fa742784cc13491c996b2fd520871f7a9df88cef097d3e74d18c34'

const b1 = Buffer.from(sig1, 'hex');
const b2 = Buffer.from(sig2, 'hex');

console.log(b1.length, b2.length)
try {
  console.log(crypto.timingSafeEqual(b1, b2));
} catch (e) {
  console.log('Error:', e.message);
}
