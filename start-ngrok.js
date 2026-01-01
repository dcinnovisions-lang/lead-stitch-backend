const ngrok = require('ngrok');

(async function() {
  try {
    console.log('🚀 Starting ngrok tunnel on port 5000...');
    const url = await ngrok.connect({
      addr: 5000,
      authtoken: null, // Free tier doesn't require auth token
    });
    
    console.log('✅ ngrok tunnel established!');
    console.log('🌐 Public URL:', url);
    console.log('📋 Add this to your .env file:');
    console.log(`APP_URL=${url}`);
    console.log('\n⏳ Tunnel will stay open. Press Ctrl+C to stop.');
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping ngrok tunnel...');
      await ngrok.disconnect();
      await ngrok.kill();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error starting ngrok:', error.message);
    process.exit(1);
  }
})();

