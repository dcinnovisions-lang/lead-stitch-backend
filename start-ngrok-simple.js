const ngrok = require('ngrok');
const fs = require('fs');
const path = require('path');

const authtoken = '35yhapi0Z3f28fvPGNAtYHM3wps_ayzudF1SzCcZiQb1Ti27';

(async function() {
  try {
    console.log('🚀 Starting ngrok tunnel on port 5000...\n');
    
    // Start ngrok with authtoken
    const url = await ngrok.connect({
      addr: 5000,
      authtoken: authtoken,
    });
    
    console.log('✅ ngrok tunnel established!');
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
    
    // Update or add APP_URL
    if (envContent.includes('APP_URL=')) {
      envContent = envContent.replace(/APP_URL=.*/g, `APP_URL=${url}`);
    } else {
      envContent += `\nAPP_URL=${url}\n`;
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Updated .env file with APP_URL');
    console.log(`📋 APP_URL=${url}`);
    console.log('\n⏳ ngrok tunnel is running. Keep this process running.');
    console.log('📧 Email tracking will now work!');
    console.log('\n🛑 Press Ctrl+C to stop ngrok.\n');
    
    // Keep alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping ngrok...');
      await ngrok.disconnect();
      await ngrok.kill();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();

