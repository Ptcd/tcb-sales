#!/usr/bin/env node

/**
 * Script to manually trigger the governance weekly summary email
 */

const https = require('https');

const url = process.env.VERCEL_URL || 'https://outreach-system-40c79ratd-colins-projects-3347229e.vercel.app';
const endpoint = `${url}/api/cron/governance-weekly-summary`;

console.log('📧 Triggering governance weekly summary email...');
console.log(`Endpoint: ${endpoint}\n`);

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const req = https.request(endpoint, options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Success! Weekly summary email triggered.');
      try {
        const response = JSON.parse(data);
        console.log(`Response: ${response.message || 'Email sent successfully'}`);
      } catch (e) {
        console.log('Response:', data);
      }
    } else {
      console.error(`❌ Error: Status ${res.statusCode}`);
      console.error('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  process.exit(1);
});

req.end();

