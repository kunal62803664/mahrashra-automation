// encryption.js
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Reverse the secret string (matches the obfuscated code's split/reverse/join)
function reverseString(s) {
  return s.split('').reverse().join('');
}

// AES-128-CBC encryption using reversed secret as key and IV
function encryptValue(amount, secret) {
  const rev = reverseString(secret);
  const key = Buffer.from(rev, 'utf8').slice(0, 16); // 16 bytes for AES-128
  const iv = Buffer.from(rev, 'utf8').slice(0, 16);

  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(String(amount), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

function decryptValue(encryptedBase64, secret) {
  const rev = reverseString(secret);
  const key = Buffer.from(rev, 'utf8').slice(0, 16);
  const iv = Buffer.from(rev, 'utf8').slice(0, 16);

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Main function — returns the Base64 ciphertext for given amount
function main(amount) {
  const secret = 'WjTfQcM@H)E&B$y9';    // ORIGINAL secret from obfuscated code
  const plain = amount !== undefined && amount !== null ? String(amount) : '500';
  const ct = encryptValue(plain, secret);
  return ct;
}

export default main;

// If run directly with `node encryption.js [amount]`, print the result
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const amountArg = process.argv[2] ?? '500';
  const ciphertext = main(amountArg);
  console.log('Plaintext:', amountArg);
  console.log('Encrypted (base64):', ciphertext);
  // Optional: show decrypted check
  // console.log('Decrypted check:', decryptValue(ciphertext, 'WjTfQcM@H)E&B$y9'));
}
