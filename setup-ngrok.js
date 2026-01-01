const ngrok = require('ngrok');
const fs = require('fs');
const path = require('path');

(async function() {
  try {
    console.log('🚀 Starting ngrok tunnel on port 5000...');
    
    // Start ngrok
    const url = await ngrok.connect({
      addr: 5000,
    });
    
    console.log('✅ ngrok tunnel established!');
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
    console.log('✅ Updated .env file with APP_URL');
    console.log('\n📋 Your .env file now contains:');
    console.log(`APP_URL=${url}`);
    console.log('\n⏳ ngrok tunnel is running. Keep this process running.');
    console.log('📧 Email tracking will now work from external machines!');
    console.log('\n⚠️  Note: The tunnel URL changes each time you restart ngrok.');
    console.log('⚠️  You will need to update APP_URL and restart the server if you restart ngrok.');
    
    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping ngrok tunnel...');
      await ngrok.disconnect();
      await ngrok.kill();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('authtoken')) {
      console.error('\n💡 Tip: You may need to sign up for a free ngrok account at https://ngrok.com/');
      console.error('   Then run: ngrok config add-authtoken YOUR_TOKEN');
    }
    process.exit(1);
  }
})();

