const fs = require('fs');
const path = require('path');
const http = require('http');

// Wait for ngrok API and get URL
function getNgrokUrl() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 20;
    
    const tryGetUrl = () => {
      attempts++;
      const req = http.get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.tunnels && json.tunnels.length > 0) {
              resolve(json.tunnels[0].public_url);
            } else if (attempts < maxAttempts) {
              setTimeout(tryGetUrl, 1000);
            } else {
              reject(new Error('No tunnels found after ' + maxAttempts + ' attempts'));
            }
          } catch (e) {
            if (attempts < maxAttempts) {
              setTimeout(tryGetUrl, 1000);
            } else {
              reject(e);
            }
          }
        });
      });
      
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(tryGetUrl, 1000);
        } else {
          reject(new Error('Could not connect to ngrok API'));
        }
      });
    };
    
    tryGetUrl();
  });
}

(async () => {
  try {
    console.log('Waiting for ngrok to start...');
    const url = await getNgrokUrl();
    console.log('✅ ngrok URL:', url);
    
    // Update .env
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    } else {
      const examplePath = path.join(__dirname, 'env.example');
      if (fs.existsSync(examplePath)) {
        envContent = fs.readFileSync(examplePath, 'utf8');
      }
    }
    
    // Update APP_URL
    if (envContent.includes('APP_URL=')) {
      envContent = envContent.replace(/APP_URL=.*/g, `APP_URL=${url}`);
    } else {
      envContent += `\nAPP_URL=${url}\n`;
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Updated .env file with APP_URL=' + url);
    console.log('\n📋 Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Send a new campaign (old emails have old tracking URLs)');
    console.log('3. Email tracking will now work!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure ngrok is running: ngrok http 5000');
    process.exit(1);
  }
})();

