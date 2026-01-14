#!/usr/bin/env node

/**
 * API Keys Health Check Script
 * Tests all your API keys to see which ones are configured and working
 */

import 'dotenv/config';

const tests = [];

// Helper to test if key exists and is not placeholder
function isConfigured(key) {
  return key &&
         key !== 'your_' + key.toLowerCase().replace('_', '') + '_here' &&
         !key.includes('your_') &&
         !key.includes('_xxx') &&
         !key.includes('price_xxx');
}

// Test Tradier API
async function testTradier() {
  const key = process.env.TRADIER_API_KEY;
  if (!isConfigured(key)) {
    return { name: 'Tradier (Stock/Options Data)', status: '❌', message: 'Not configured' };
  }

  try {
    const url = process.env.TRADIER_USE_SANDBOX === 'true'
      ? 'https://sandbox.tradier.com/v1/markets/quotes?symbols=SPY'
      : 'https://api.tradier.com/v1/markets/quotes?symbols=SPY';

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      const price = data?.quotes?.quote?.last || 'N/A';
      return {
        name: 'Tradier (Stock/Options Data)',
        status: '✅',
        message: `Working! SPY: $${price} (${process.env.TRADIER_USE_SANDBOX === 'true' ? 'SANDBOX' : 'LIVE'})`
      };
    } else {
      return { name: 'Tradier (Stock/Options Data)', status: '❌', message: `HTTP ${response.status}: ${response.statusText}` };
    }
  } catch (error) {
    return { name: 'Tradier (Stock/Options Data)', status: '❌', message: error.message };
  }
}

// Test OpenAI
async function testOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!isConfigured(key)) {
    return { name: 'OpenAI (AI Trade Analysis)', status: '❌', message: 'Not configured' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });

    if (response.ok) {
      return { name: 'OpenAI (AI Trade Analysis)', status: '✅', message: 'Working!' };
    } else {
      const data = await response.json();
      return { name: 'OpenAI (AI Trade Analysis)', status: '❌', message: data.error?.message || `HTTP ${response.status}` };
    }
  } catch (error) {
    return { name: 'OpenAI (AI Trade Analysis)', status: '❌', message: error.message };
  }
}

// Test Alpha Vantage
async function testAlphaVantage() {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!isConfigured(key)) {
    return { name: 'Alpha Vantage (Historical Data)', status: '❌', message: 'Not configured' };
  }

  try {
    const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${key}`);
    if (response.ok) {
      const data = await response.json();
      if (data['Global Quote']) {
        return { name: 'Alpha Vantage (Historical Data)', status: '✅', message: 'Working!' };
      } else if (data['Note']) {
        return { name: 'Alpha Vantage (Historical Data)', status: '⚠️', message: 'Rate limit reached (5 calls/min)' };
      } else {
        return { name: 'Alpha Vantage (Historical Data)', status: '❌', message: 'Invalid response' };
      }
    }
    return { name: 'Alpha Vantage (Historical Data)', status: '❌', message: `HTTP ${response.status}` };
  } catch (error) {
    return { name: 'Alpha Vantage (Historical Data)', status: '❌', message: error.message };
  }
}

// Test Stripe
function testStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!isConfigured(key)) {
    return { name: 'Stripe (Payments)', status: '❌', message: 'Not configured' };
  }

  const isTest = key.includes('test');
  return {
    name: 'Stripe (Payments)',
    status: '✅',
    message: `Configured (${isTest ? 'TEST mode' : 'LIVE mode'})`
  };
}

// Test Anthropic
function testAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!isConfigured(key)) {
    return { name: 'Anthropic (Claude AI)', status: '❌', message: 'Not configured' };
  }
  return { name: 'Anthropic (Claude AI)', status: '✅', message: 'Configured (not tested - async)' };
}

// Test Gemini
function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!isConfigured(key)) {
    return { name: 'Google Gemini (AI)', status: '❌', message: 'Not configured' };
  }
  return { name: 'Google Gemini (AI)', status: '✅', message: 'Configured (not tested - async)' };
}

// Test Resend
function testResend() {
  const key = process.env.RESEND_API_KEY;
  if (!isConfigured(key)) {
    return { name: 'Resend (Email Service)', status: '❌', message: 'Not configured' };
  }
  return { name: 'Resend (Email Service)', status: '✅', message: 'Configured (not tested - async)' };
}

// Test Discord
function testDiscord() {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!isConfigured(webhook)) {
    return { name: 'Discord Webhooks', status: '❌', message: 'Not configured' };
  }
  return { name: 'Discord Webhooks', status: '✅', message: 'Configured' };
}

// Test Google OAuth
function testGoogleOAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!isConfigured(clientId) || !isConfigured(clientSecret)) {
    return { name: 'Google OAuth (Sign In)', status: '❌', message: 'Not configured' };
  }
  return { name: 'Google OAuth (Sign In)', status: '✅', message: 'Configured' };
}

// Test Database
function testDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return { name: 'Database (PostgreSQL)', status: '❌', message: 'Not configured' };
  }
  return { name: 'Database (PostgreSQL)', status: '✅', message: 'Configured (Neon)' };
}

// Main test runner
async function runTests() {
  console.log('\n🔍 Testing QuantEdge API Configuration...\n');
  console.log('='.repeat(70));
  console.log('\n');

  // Critical APIs (async tests)
  console.log('🎯 CRITICAL APIS (Required for core features):\n');

  const criticalTests = [
    testDatabase(),
    await testTradier(),
    await testOpenAI(),
    await testAlphaVantage(),
  ];

  criticalTests.forEach(result => {
    console.log(`${result.status} ${result.name.padEnd(35)} ${result.message}`);
  });

  // Optional APIs (sync tests)
  console.log('\n\n💰 PAYMENT & SUBSCRIPTIONS (Optional):\n');

  const paymentTests = [
    testStripe(),
  ];

  paymentTests.forEach(result => {
    console.log(`${result.status} ${result.name.padEnd(35)} ${result.message}`);
  });

  console.log('\n\n🤖 ADDITIONAL AI SERVICES (Optional):\n');

  const aiTests = [
    testAnthropic(),
    testGemini(),
  ];

  aiTests.forEach(result => {
    console.log(`${result.status} ${result.name.padEnd(35)} ${result.message}`);
  });

  console.log('\n\n📧 NOTIFICATIONS (Optional):\n');

  const notificationTests = [
    testResend(),
    testDiscord(),
  ];

  notificationTests.forEach(result => {
    console.log(`${result.status} ${result.name.padEnd(35)} ${result.message}`);
  });

  console.log('\n\n🔐 AUTHENTICATION (Optional):\n');

  const authTests = [
    testGoogleOAuth(),
  ];

  authTests.forEach(result => {
    console.log(`${result.status} ${result.name.padEnd(35)} ${result.message}`);
  });

  // Summary
  const allTests = [...criticalTests, ...paymentTests, ...aiTests, ...notificationTests, ...authTests];
  const working = allTests.filter(t => t.status === '✅').length;
  const total = allTests.length;
  const percentage = Math.round((working / total) * 100);

  console.log('\n');
  console.log('='.repeat(70));
  console.log(`\n📊 SUMMARY: ${working}/${total} services configured (${percentage}%)\n`);

  if (percentage < 30) {
    console.log('⚠️  WARNING: Very few services configured. Platform won\'t function properly.');
    console.log('📖 See API_SETUP_GUIDE.md for setup instructions.\n');
  } else if (percentage < 60) {
    console.log('⚠️  NOTICE: Core services configured, but missing optional features.');
    console.log('📖 See API_SETUP_GUIDE.md to enable more features.\n');
  } else {
    console.log('✅ GOOD: Most services configured! Platform should work well.\n');
  }

  console.log('💡 NEXT STEPS:');
  console.log('   1. Fix any ❌ critical services (Tradier, OpenAI)');
  console.log('   2. Restart server: npm run dev');
  console.log('   3. Test platform: http://localhost:3000');
  console.log('   4. Login with code: 0065\n');
}

runTests().catch(console.error);
