/**
 * Test script to verify tracking endpoints are accessible
 * Run this after starting ngrok and backend server
 */

const https = require('https');
const http = require('http');

const APP_URL = process.env.APP_URL || 'http://localhost:5000';

console.log('🧪 Testing tracking endpoints...');
console.log('📡 APP_URL:', APP_URL);
console.log('');

// Test pixel endpoint (should return 404 but that's ok - we just want to see if it's accessible)
const testPixelUrl = `${APP_URL}/api/email/track/pixel/test-pixel-id-12345`;
const testLinkUrl = `${APP_URL}/api/email/track/link/test-link-id-12345`;

function testUrl(url, name) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Test Script)'
      },
      timeout: 5000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`✅ ${name}:`);
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   URL: ${url}`);
        console.log(`   Response length: ${data.length} bytes`);
        if (res.statusCode === 200 || res.statusCode === 404) {
          console.log(`   ✅ Endpoint is accessible!`);
        } else {
          console.log(`   ⚠️  Unexpected status code`);
        }
        console.log('');
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log(`❌ ${name}:`);
      console.log(`   URL: ${url}`);
      console.log(`   Error: ${error.message}`);
      console.log(`   ❌ Endpoint is NOT accessible!`);
      console.log('');
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      console.log(`⏱️  ${name}:`);
      console.log(`   URL: ${url}`);
      console.log(`   Error: Request timeout`);
      console.log(`   ❌ Endpoint is NOT accessible!`);
      console.log('');
      resolve();
    });

    req.end();
  });
}

async function runTests() {
  console.log('Testing pixel tracking endpoint...');
  await testUrl(testPixelUrl, 'Pixel Tracking');
  
  console.log('Testing link tracking endpoint...');
  await testUrl(testLinkUrl, 'Link Tracking');
  
  console.log('📋 Summary:');
  console.log('If both endpoints show ✅, your tracking URLs should work.');
  console.log('If they show ❌, check:');
  console.log('  1. Is ngrok running?');
  console.log('  2. Is backend server running?');
  console.log('  3. Is APP_URL in .env set correctly?');
  console.log('  4. Did you restart the backend server after setting APP_URL?');
}

runTests().catch(console.error);


