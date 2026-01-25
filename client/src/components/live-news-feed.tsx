import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, ExternalLink, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  symbols?: string[];
  sentiment?: string;
}

export function LiveNewsFeed() {
  const { data: newsData, isLoading } = useQuery<{ articles: NewsItem[] }>({
    queryKey: ["/api/news"],
    refetchInterval: 300000,
  });

  const articles = newsData?.articles?.slice(0, 5) || [];

  return (
    <Card className="h-full" data-testid="news-feed">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          Breaking News
        </CardTitle>
        <Link href="/discover">
          <span className="text-xs text-primary hover:underline cursor-pointer">View All</span>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent news available
          </p>
        ) : (
          articles.map((article) => (
            <a
              key={article.id || article.title}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
              data-testid={`news-article-${article.id}`}
            >
              <div className="p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                    {article.title}
                  </h4>
                  <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground">{article.source}</span>
                  <span className="text-muted-foreground">·</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : "Recently"}
                  </div>
                </div>
                {article.symbols && article.symbols.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {article.symbols.slice(0, 3).map((symbol) => (
                      <span 
                        key={symbol} 
                        className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                      >
                        {symbol}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </a>
          ))
        )}
      </CardContent>
    </Card>
  );
}
