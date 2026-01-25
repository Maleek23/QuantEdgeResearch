import { generateQuantIdeas } from './server/quant-ideas-generator';
import { storage } from './server/storage';

(async () => {
  try {
    console.log('🔧 [TEST] Manually triggering quant generation...');
    const ideas = await generateQuantIdeas();
    console.log(`✅ Generated ${ideas.length} quant ideas`);

    for (const idea of ideas.slice(0, 10)) {
      await storage.createTradeIdea(idea);
      console.log(`  ✓ ${idea.symbol} ${idea.direction.toUpperCase()} [${idea.probabilityBand}] - ${idea.confidenceScore}%`);
    }

    console.log(`\n🎉 Successfully created ${Math.min(ideas.length, 10)} trade ideas in database`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
