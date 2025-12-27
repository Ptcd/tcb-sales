const https = require('https');
const fs = require('fs');
const path = require('path');

// Try to load CRON_SECRET from .env.vercel if it exists
let cronSecret = process.env.CRON_SECRET;
if (!cronSecret) {
  const envVercelPath = path.join(__dirname, '..', '.env.vercel');
  if (fs.existsSync(envVercelPath)) {
    const envContent = fs.readFileSync(envVercelPath, 'utf8');
    const match = envContent.match(/CRON_SECRET=(.+)/);
    if (match) {
      cronSecret = match[1].trim();
    }
  }
}

const url = 'https://outreach-system-r7jxrmt8e-colins-projects-3347229e.vercel.app/api/cron/generate-daily-summaries';

const headers = {
  'Content-Type': 'application/json',
};

if (cronSecret) {
  headers['Authorization'] = `Bearer ${cronSecret}`;
}

const options = {
  method: 'POST',
  headers: headers,
};

console.log('Triggering daily summaries cron job...');
console.log(`URL: ${url}`);
if (cronSecret) {
  console.log('Using CRON_SECRET for authentication');
} else {
  console.log('⚠️  No CRON_SECRET found');
  console.log('\nTo trigger this manually, you have a few options:');
  console.log('1. Set CRON_SECRET in Vercel environment variables and run this script again');
  console.log('2. Get a Vercel bypass token from: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation');
  console.log('3. Trigger it manually from the Vercel dashboard');
  console.log('\nAttempting request anyway...\n');
}

const req = https.request(url, options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    if (res.statusCode === 200 || res.statusCode === 201) {
      try {
        const json = JSON.parse(data);
        console.log('✅ Success!');
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('Response:', data.substring(0, 500));
      }
    } else if (res.statusCode === 401) {
      console.log('❌ Authentication required');
      console.log('\nThe deployment has Vercel protection enabled.');
      console.log('Please either:');
      console.log('1. Set CRON_SECRET in Vercel project settings');
      console.log('2. Get a bypass token and add it to the URL');
      console.log('3. Trigger manually from Vercel dashboard');
    } else {
      console.log('Error response:', data.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

req.end();

