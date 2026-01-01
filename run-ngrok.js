const ngrok = require('ngrok');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting ngrok...\n');

// First, ensure authtoken is configured
try {
  execSync('ngrok config add-authtoken 35yhapi0Z3f28fvPGNAtYHM3wps_ayzudF1SzCcZiQb1Ti27', { stdio: 'ignore' });
} catch (e) {
  // Authtoken might already be set, that's okay
}

ngrok.connect({
  addr: 5000,
})
.then(url => {
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
  
  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping ngrok...');
    await ngrok.disconnect();
    await ngrok.kill();
    process.exit(0);
  });
})
.catch(error => {
  console.error('❌ Error starting ngrok:', error.message);
  if (error.message.includes('authtoken')) {
    console.error('\n💡 The authtoken might be invalid. Please check:');
    console.error('   https://dashboard.ngrok.com/get-started/your-authtoken');
  }
  process.exit(1);
});

