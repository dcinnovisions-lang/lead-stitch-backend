const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('🚀 Starting ngrok...\n');

// Start ngrok process
const ngrok = spawn('ngrok', ['http', '5000'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let ngrokOutput = '';

ngrok.stdout.on('data', (data) => {
  const output = data.toString();
  ngrokOutput += output;
  process.stdout.write(output);
});

ngrok.stderr.on('data', (data) => {
  const output = data.toString();
  ngrokOutput += output;
  process.stderr.write(output);
});

// Wait for ngrok to start and get URL from API
function getNgrokUrl() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 30;
    
    const tryGetUrl = () => {
      attempts++;
      
      const req = http.get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.tunnels && json.tunnels.length > 0 && json.tunnels[0].public_url) {
              resolve(json.tunnels[0].public_url);
            } else if (attempts < maxAttempts) {
              setTimeout(tryGetUrl, 1000);
            } else {
              reject(new Error('No tunnels found'));
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
      
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(tryGetUrl, 1000);
        } else {
          reject(new Error('Timeout connecting to ngrok API'));
        }
      });
    };
    
    // Start trying after a short delay
    setTimeout(tryGetUrl, 3000);
  });
}

// Get URL and update .env
getNgrokUrl()
  .then(url => {
    console.log('\n✅ ngrok tunnel established!');
    console.log('🌐 Public URL:', url);
    console.log('');
    
    // Update .env file
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
    console.log('✅ Updated .env file!');
    console.log(`📋 APP_URL=${url}`);
    console.log('\n⏳ Keep this window open! ngrok is running.');
    console.log('📧 Email tracking is now enabled!');
    console.log('\n📋 Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Send a NEW campaign (old emails have old tracking URLs)');
    console.log('\n🛑 Press Ctrl+C to stop ngrok.\n');
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Make sure ngrok is installed and authtoken is configured:');
    console.log('   ngrok config add-authtoken YOUR_TOKEN');
    ngrok.kill();
    process.exit(1);
  });

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping ngrok...');
  ngrok.kill();
  process.exit(0);
});

ngrok.on('close', (code) => {
  console.log(`\nngrok process exited with code ${code}`);
  process.exit(code);
});

