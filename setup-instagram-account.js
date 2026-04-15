/**
 * Setup Instagram Account for Outreach
 *
 * This script will:
 * 1. Save your Instagram session cookie to settings
 * 2. Create an account record in the accounts table
 * 3. Test sending a DM via Apify
 */

const { createClient } = require('@supabase/supabase-js');
const { ApifyClient } = require('apify-client');
const readline = require('readline');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const apifyToken = process.env.APIFY_API_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);
const apifyClient = new ApifyClient({ token: apifyToken });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('\n🎯 Instagram Account Setup for Outreach\n');
  console.log('This will configure your @dclancy05 Instagram account for automated DMs.\n');

  // Step 1: Get session cookie
  console.log('📋 STEP 1: Get Your Instagram Session Cookie');
  console.log('   1. Open Chrome → instagram.com (logged in as @dclancy05)');
  console.log('   2. Press F12 → Application → Cookies → instagram.com');
  console.log('   3. Find "sessionid" and copy the value\n');

  const sessionId = await question('Paste your sessionid cookie here: ');

  if (!sessionId || sessionId.length < 20) {
    console.error('\n❌ Invalid sessionid. Please try again.');
    process.exit(1);
  }

  console.log('\n✅ Session cookie received!');

  // Step 2: Save to database
  console.log('\n💾 STEP 2: Saving to database...');

  // Update settings
  const { error: settingsError } = await supabase
    .from('settings')
    .update({ setting_value: sessionId })
    .eq('setting_name', 'instagram_session_id');

  if (settingsError) {
    console.error('❌ Failed to save to settings:', settingsError.message);
  } else {
    console.log('✅ Saved session cookie to settings');
  }

  // Create account record if it doesn't exist
  const accountId = `ig_${Date.now()}`;
  const { error: accountError } = await supabase
    .from('accounts')
    .insert({
      account_id: accountId,
      platform: 'instagram',
      display_name: 'Dylan Instagram (@dclancy05)',
      username: 'dclancy05',
      session_cookie: sessionId,
      daily_limit: 30,
      sends_today: 0,
      status: 'active',
      notes: 'Primary Instagram account for outreach',
    });

  if (accountError) {
    if (accountError.code === '23505') {
      console.log('ℹ️  Account already exists, updating...');
      await supabase
        .from('accounts')
        .update({ session_cookie: sessionId })
        .eq('username', 'dclancy05')
        .eq('platform', 'instagram');
      console.log('✅ Updated existing account');
    } else {
      console.error('❌ Failed to create account:', accountError.message);
    }
  } else {
    console.log('✅ Created Instagram account record');
  }

  // Step 3: Test DM sending
  console.log('\n🧪 STEP 3: Test DM Sending');
  const shouldTest = await question('\nWould you like to send a test DM? (yes/no): ');

  if (shouldTest.toLowerCase() === 'yes' || shouldTest.toLowerCase() === 'y') {
    const targetUsername = await question('Target username (default: dclancy05): ') || 'dclancy05';
    const testMessage = await question('Test message (default: "Test from automation system"): ') || 'Test from automation system';

    console.log('\n🚀 Sending test DM via Apify...');
    console.log('   Target:', targetUsername);
    console.log('   Message:', testMessage);
    console.log('');

    try {
      const run = await apifyClient
        .actor('am_production/instagram-direct-messages-dms-automation')
        .call({
          sessionId: sessionId,
          usernames: [targetUsername],
          message: testMessage,
          delayBetweenMessages: 30,
        }, {
          waitSecs: 180,
        });

      console.log('\n✅ Actor run completed!');
      console.log('   Status:', run.status);
      console.log('   Run ID:', run.id);
      console.log('\n   View at: https://console.apify.com/actors/runs/' + run.id);

      // Get results
      if (run.defaultDatasetId) {
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        if (items.length > 0) {
          console.log('\n📊 Results:');
          console.log(JSON.stringify(items[0], null, 2));
        }
      }

      console.log('\n🎉 Test DM sent successfully!');
      console.log('   Check your Instagram DMs to verify.');

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      console.error('\nThis could mean:');
      console.error('  - Invalid session cookie (it may have expired)');
      console.error('  - Instagram rate limits');
      console.error('  - Invalid username');
      console.error('\nCheck the Apify console for details.');
    }
  }

  console.log('\n✅ Setup Complete!');
  console.log('\nYour Instagram account is now configured for outreach.');
  console.log('You can now send DMs via:');
  console.log('  - AutoBot (using configured automations)');
  console.log('  - Apify fallback (automatic when AutoBot fails)');
  console.log('  - Direct Apify calls (for testing)');

  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Setup failed:', error.message);
  process.exit(1);
});
