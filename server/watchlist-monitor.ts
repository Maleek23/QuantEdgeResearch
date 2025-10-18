import { db } from './db';
import { watchlist } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import { fetchStockPrice, fetchCryptoPrice } from './market-api';
import { sendDiscordAlert } from './discord-service';

// Watchlist Price Alert Types
type AlertType = 'entry' | 'stop' | 'target';

interface PriceAlert {
  watchlistId: string;
  symbol: string;
  assetType: string;
  alertType: AlertType;
  currentPrice: number;
  alertPrice: number;
  percentFromTarget: number;
}

/**
 * Main watchlist monitoring function
 * Checks all watchlist items with alerts enabled and sends notifications
 */
export async function monitorWatchlist(): Promise<PriceAlert[]> {
  const triggeredAlerts: PriceAlert[] = [];
  
  try {
    // Fetch all watchlist items with alerts enabled
    const watchlistItems = await db
      .select()
      .from(watchlist)
      .where(eq(watchlist.alertsEnabled, true));
    
    if (watchlistItems.length === 0) {
      console.log('📊 Watchlist Monitor: No items with alerts enabled');
      return [];
    }
    
    console.log(`📊 Watchlist Monitor: Checking ${watchlistItems.length} items...`);
    
    // Check each watchlist item
    for (const item of watchlistItems) {
      try {
        // Fetch current price based on asset type
        let currentPrice: number | null = null;
        
        if (item.assetType === 'crypto') {
          const data = await fetchCryptoPrice(item.symbol);
          currentPrice = data?.currentPrice || null;
        } else {
          const data = await fetchStockPrice(item.symbol);
          currentPrice = data?.currentPrice || null;
        }
        
        if (!currentPrice) {
          console.log(`⚠️ Watchlist Monitor: Could not fetch price for ${item.symbol}`);
          continue;
        }
        
        // Check if we should send alerts (cooldown: 1 hour minimum between alerts)
        const shouldSendAlert = !item.lastAlertSent || 
          (Date.now() - new Date(item.lastAlertSent).getTime()) > (60 * 60 * 1000); // 1 hour cooldown
        
        if (!shouldSendAlert) {
          continue; // Skip this item - still in cooldown period
        }
        
        // Check entry alert (buying opportunity - price dropped to target)
        if (item.entryAlertPrice && currentPrice <= item.entryAlertPrice) {
          const alert: PriceAlert = {
            watchlistId: item.id,
            symbol: item.symbol,
            assetType: item.assetType,
            alertType: 'entry',
            currentPrice,
            alertPrice: item.entryAlertPrice,
            percentFromTarget: ((currentPrice - item.entryAlertPrice) / item.entryAlertPrice) * 100,
          };
          
          triggeredAlerts.push(alert);
          await sendWatchlistAlert(item, alert);
          continue; // Only send one alert per check to avoid spam
        }
        
        // Check stop loss alert
        if (item.stopAlertPrice && currentPrice <= item.stopAlertPrice) {
          const alert: PriceAlert = {
            watchlistId: item.id,
            symbol: item.symbol,
            assetType: item.assetType,
            alertType: 'stop',
            currentPrice,
            alertPrice: item.stopAlertPrice,
            percentFromTarget: ((currentPrice - item.stopAlertPrice) / item.stopAlertPrice) * 100,
          };
          
          triggeredAlerts.push(alert);
          await sendWatchlistAlert(item, alert);
          continue; // Only send one alert per check to avoid spam
        }
        
        // Check profit target alert
        if (item.targetAlertPrice && currentPrice >= item.targetAlertPrice) {
          const alert: PriceAlert = {
            watchlistId: item.id,
            symbol: item.symbol,
            assetType: item.assetType,
            alertType: 'target',
            currentPrice,
            alertPrice: item.targetAlertPrice,
            percentFromTarget: ((currentPrice - item.targetAlertPrice) / item.targetAlertPrice) * 100,
          };
          
          triggeredAlerts.push(alert);
          await sendWatchlistAlert(item, alert);
        }
        
      } catch (error) {
        console.error(`❌ Watchlist Monitor: Error checking ${item.symbol}:`, error);
      }
    }
    
    if (triggeredAlerts.length > 0) {
      console.log(`🔔 Watchlist Monitor: ${triggeredAlerts.length} alerts triggered!`);
    }
    
    return triggeredAlerts;
    
  } catch (error) {
    console.error('❌ Watchlist Monitor: Fatal error:', error);
    return [];
  }
}

/**
 * Send alert notification via Discord
 */
async function sendWatchlistAlert(item: any, alert: PriceAlert): Promise<void> {
  try {
    // Update alert tracking
    await db
      .update(watchlist)
      .set({
        lastAlertSent: new Date().toISOString(),
        alertCount: (item.alertCount || 0) + 1,
      })
      .where(eq(watchlist.id, item.id));
    
    // Send Discord notification if enabled
    if (item.discordAlertsEnabled) {
      await sendDiscordAlert({
        symbol: alert.symbol,
        assetType: alert.assetType,
        alertType: alert.alertType,
        currentPrice: alert.currentPrice,
        alertPrice: alert.alertPrice,
        percentFromTarget: alert.percentFromTarget,
        notes: item.notes || 'Watchlist alert triggered',
      });
    }
    
    console.log(`✅ Watchlist Alert Sent: ${alert.symbol} ${alert.alertType.toUpperCase()} - $${alert.currentPrice.toFixed(2)}`);
    
  } catch (error) {
    console.error(`❌ Failed to send watchlist alert for ${alert.symbol}:`, error);
  }
}

/**
 * Start the watchlist monitoring loop
 * Checks every 5 minutes by default
 */
export function startWatchlistMonitor(intervalMinutes: number = 5): NodeJS.Timeout {
  console.log(`🚀 Starting Watchlist Monitor (interval: ${intervalMinutes} minutes)`);
  
  // Run immediately on start
  monitorWatchlist();
  
  // Then run on interval
  const interval = setInterval(() => {
    monitorWatchlist();
  }, intervalMinutes * 60 * 1000);
  
  return interval;
}
