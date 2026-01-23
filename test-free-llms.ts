/**
 * Test script to verify all FREE LLM providers are working
 */

import 'dotenv/config';
import { getValidationServiceStatus, quickValidation } from './server/multi-llm-validation';

async function testFreeLLMs() {
  console.log('\n🔍 Testing FREE LLM Providers...\n');

  // Check which providers are configured
  const status = getValidationServiceStatus();

  console.log('📊 Provider Status:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  status.providers.forEach(provider => {
    const icon = provider.available ? '✅' : '❌';
    console.log(`${icon} ${provider.name.padEnd(30)} | ${provider.freeLimit}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📈 Total Available: ${status.totalAvailable}/6 providers`);
  console.log(`💰 Total Cost: ${status.totalCost}\n`);

  if (status.recommendedProviders.length > 0) {
    console.log('💡 Recommendations:');
    status.recommendedProviders.forEach(rec => console.log(`   - ${rec}`));
    console.log('');
  }

  // Test quick validation with a sample trade idea
  if (status.totalAvailable > 0) {
    console.log('🧪 Testing Quick Validation...\n');

    const testIdea = {
      symbol: 'AAPL',
      direction: 'long' as const,
      entryPrice: 180.5,
      targetPrice: 195.0,
      stopLoss: 175.0,
      confidenceScore: 75,
      analysis: 'Strong technical breakout above resistance with increasing volume',
      source: 'test'
    };

    try {
      const result = await quickValidation(testIdea, 'Test market conditions');
      console.log(`✅ Validation successful!`);
      console.log(`   Provider: ${result.provider.toUpperCase()}`);
      console.log(`   Approved: ${result.approved ? '✅ YES' : '❌ NO'}`);
      console.log(`   Confidence: ${result.confidence}%`);
      console.log(`   Response Time: ${result.responseTime}ms`);
      console.log(`   Free: ${result.isFree ? '✅ YES' : '❌ NO'}`);
      console.log(`   Reasoning: ${result.reasoning}`);
      if (result.warnings.length > 0) {
        console.log(`   Warnings: ${result.warnings.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Validation failed:', error);
    }
  } else {
    console.log('⚠️  No providers available for testing. Add API keys to test validation.');
  }

  console.log('\n✅ Test complete!\n');
}

// Run the test
testFreeLLMs().catch(console.error);
