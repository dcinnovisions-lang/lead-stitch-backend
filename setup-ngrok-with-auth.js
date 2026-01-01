const ngrok = require('ngrok');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async function() {
  try {
    console.log('🔐 ngrok requires authentication. Let\'s set it up...\n');
    
    // Try to use authtoken from environment or use the one provided
    const authtoken = process.env.NGROK_AUTHTOKEN || '35yhapi0Z3f28fvPGNAtYHM3wps_ayzudF1SzCcZiQb1Ti27';
    
    // Set authtoken if provided
    if (authtoken) {
      try {
        const { execSync } = require('child_process');
        execSync(`ngrok config add-authtoken ${authtoken}`, { stdio: 'ignore' });
        console.log('✅ ngrok authtoken configured');
      } catch (error) {
        // Authtoken might already be set, that's okay
        console.log('ℹ️  Using existing ngrok configuration');
      }
    }
    
    console.log('\n🚀 Starting ngrok tunnel on port 5000...');
    
    // Start ngrok
    const url = await ngrok.connect({
      addr: 5000,
    });
    
    console.log('\n✅ ngrok tunnel established!');
    console.log('🌐 Public URL:', url);
    
    // Read .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    } else {
      // Create from example if .env doesn't exist
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
    
    // Write back to .env
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('\n✅ Updated .env file with APP_URL');
    console.log(`📋 APP_URL=${url}`);
    console.log('\n⏳ ngrok tunnel is running. Keep this process running.');
    console.log('📧 Email tracking will now work from external machines!');
    console.log('\n⚠️  Note: The tunnel URL changes each time you restart ngrok.');
    console.log('⚠️  You will need to update APP_URL and restart the server if you restart ngrok.');
    console.log('\n🛑 Press Ctrl+C to stop ngrok when done.');
    
    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping ngrok tunnel...');
      await ngrok.disconnect();
      await ngrok.kill();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('authtoken') || error.message.includes('4018')) {
      console.error('\n💡 ngrok requires authentication. Please:');
      console.error('1. Sign up: https://dashboard.ngrok.com/signup');
      console.error('2. Get authtoken: https://dashboard.ngrok.com/get-started/your-authtoken');
      console.error('3. Run: ngrok config add-authtoken YOUR_AUTHTOKEN');
      console.error('4. Then run this script again');
    }
    process.exit(1);
  }
})();

