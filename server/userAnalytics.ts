import { storage } from './storage';
import { logger } from './logger';
import type { UserActivityType, InsertUserActivityEvent, InsertPageView } from '@shared/schema';

export interface ActivityContext {
  userId: string;
  sessionId?: string;
  device?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface PageViewData {
  path: string;
  referrer?: string;
  timeOnPage?: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

class UserAnalyticsService {
  private activityBuffer: InsertUserActivityEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 10000; // Flush every 10 seconds
  private readonly BUFFER_SIZE = 50; // Flush when buffer reaches 50 items

  constructor() {
    this.startFlushInterval();
  }

  private startFlushInterval() {
    this.flushInterval = setInterval(() => {
      this.flushActivities();
    }, this.FLUSH_INTERVAL_MS);
  }

  private async flushActivities() {
    if (this.activityBuffer.length === 0) return;

    const toFlush = [...this.activityBuffer];
    this.activityBuffer = [];

    try {
      for (const activity of toFlush) {
        await storage.createUserActivityEvent(activity);
      }
      logger.debug(`[ANALYTICS] Flushed ${toFlush.length} activity events`);
    } catch (error) {
      logger.error('[ANALYTICS] Failed to flush activities', { error });
      this.activityBuffer.push(...toFlush);
    }
  }

  async trackActivity(
    activityType: UserActivityType,
    context: ActivityContext,
    metadata?: Record<string, any>,
    description?: string
  ) {
    const event: InsertUserActivityEvent = {
      userId: context.userId,
      sessionId: context.sessionId,
      activityType,
      description,
      metadata: metadata || null,
      device: context.device,
    };

    this.activityBuffer.push(event);

    if (this.activityBuffer.length >= this.BUFFER_SIZE) {
      await this.flushActivities();
    }

    await this.updateDailySummary(context.userId, activityType);
  }

  async trackPageView(context: ActivityContext, data: PageViewData) {
    try {
      const pageView: InsertPageView = {
        userId: context.userId,
        sessionId: context.sessionId,
        path: data.path,
        referrer: data.referrer,
        timeOnPage: data.timeOnPage,
        userAgent: context.userAgent,
        device: context.device,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
      };

      await storage.createPageView(pageView);
      await this.incrementDailyPageViews(context.userId);
    } catch (error) {
      logger.error('[ANALYTICS] Failed to track page view', { error, path: data.path });
    }
  }

  private async updateDailySummary(userId: string, activityType: UserActivityType) {
    const today = new Date().toISOString().split('T')[0];

    try {
      let summary = await storage.getOrCreateDailySummary(userId, today);

      const updates: Record<string, number> = {};
      
      switch (activityType) {
        case 'view_trade_idea':
          updates.ideasViewed = (summary.ideasViewed || 0) + 1;
          break;
        case 'generate_idea':
          updates.ideasGenerated = (summary.ideasGenerated || 0) + 1;
          break;
        case 'view_chart':
          updates.chartsViewed = (summary.chartsViewed || 0) + 1;
          break;
        case 'export_pdf':
          updates.pdfsExported = (summary.pdfsExported || 0) + 1;
          break;
        case 'journal_entry':
          updates.journalEntries = (summary.journalEntries || 0) + 1;
          break;
        case 'run_scanner':
          updates.scannersRun = (summary.scannersRun || 0) + 1;
          break;
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateDailySummary(summary.id, updates);
      }
    } catch (error) {
      logger.error('[ANALYTICS] Failed to update daily summary', { error, userId });
    }
  }

  private async incrementDailyPageViews(userId: string) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const summary = await storage.getOrCreateDailySummary(userId, today);
      await storage.updateDailySummary(summary.id, {
        pageViews: (summary.pageViews || 0) + 1,
      });
    } catch (error) {
      logger.error('[ANALYTICS] Failed to increment page views', { error, userId });
    }
  }

  async trackSession(userId: string, sessionId: string, durationSeconds: number) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const summary = await storage.getOrCreateDailySummary(userId, today);
      await storage.updateDailySummary(summary.id, {
        totalSessions: (summary.totalSessions || 0) + 1,
        totalTimeSeconds: (summary.totalTimeSeconds || 0) + durationSeconds,
      });
    } catch (error) {
      logger.error('[ANALYTICS] Failed to track session', { error, userId });
    }
  }

  async getUserAnalytics(userId: string, days: number = 30) {
    const summaries = await storage.getUserAnalyticsSummaries(userId, days);
    const recentActivities = await storage.getActivityEvents(userId, 100);

    const totals = summaries.reduce((acc, s) => ({
      pageViews: acc.pageViews + (s.pageViews || 0),
      ideasViewed: acc.ideasViewed + (s.ideasViewed || 0),
      ideasGenerated: acc.ideasGenerated + (s.ideasGenerated || 0),
      chartsViewed: acc.chartsViewed + (s.chartsViewed || 0),
      pdfsExported: acc.pdfsExported + (s.pdfsExported || 0),
      journalEntries: acc.journalEntries + (s.journalEntries || 0),
      scannersRun: acc.scannersRun + (s.scannersRun || 0),
      totalSessions: acc.totalSessions + (s.totalSessions || 0),
      totalTimeSeconds: acc.totalTimeSeconds + (s.totalTimeSeconds || 0),
    }), {
      pageViews: 0,
      ideasViewed: 0,
      ideasGenerated: 0,
      chartsViewed: 0,
      pdfsExported: 0,
      journalEntries: 0,
      scannersRun: 0,
      totalSessions: 0,
      totalTimeSeconds: 0,
    });

    return {
      totals,
      dailyStats: summaries,
      recentActivities,
      period: `${days} days`,
    };
  }

  async getTopUsers(limit: number = 20) {
    return storage.getTopUsersByActivity(limit);
  }

  async getActivityBreakdown(hours: number = 24) {
    return storage.getActivityStats(hours);
  }

  shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    return this.flushActivities();
  }
}

export const userAnalytics = new UserAnalyticsService();

export function parseDevice(userAgent?: string): string {
  if (!userAgent) return 'unknown';
  
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet/i.test(userAgent)) return 'tablet';
  if (/iPad|iPhone|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export function extractUTMParams(url: string): { source?: string; medium?: string; campaign?: string } {
  try {
    const urlObj = new URL(url, 'http://localhost');
    return {
      source: urlObj.searchParams.get('utm_source') || undefined,
      medium: urlObj.searchParams.get('utm_medium') || undefined,
      campaign: urlObj.searchParams.get('utm_campaign') || undefined,
    };
  } catch {
    return {};
  }
}
