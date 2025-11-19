import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, Calendar, Clock, TrendingUp, Brain, Target, BarChart3, ArrowRight } from "lucide-react";
import { format } from "date-fns";

export default function Blog() {
  const articles = [
    {
      id: 1,
      icon: Brain,
      title: "How AI is Revolutionizing Day Trading",
      excerpt: "Explore how artificial intelligence is transforming the way traders analyze markets, identify opportunities, and manage risk in real-time.",
      category: "AI Trading",
      date: new Date("2025-01-15"),
      readTime: "8 min read",
      featured: true,
    },
    {
      id: 2,
      icon: Target,
      title: "The Power of Quantitative Trading Strategies",
      excerpt: "Dive deep into proven quantitative strategies like RSI(2) mean reversion and VWAP institutional flow that consistently outperform the market.",
      category: "Quantitative Analysis",
      date: new Date("2025-01-10"),
      readTime: "12 min read",
      featured: true,
    },
    {
      id: 3,
      icon: BarChart3,
      title: "Understanding Risk-Reward Ratios",
      excerpt: "Master the fundamentals of risk management with a comprehensive guide to calculating and optimizing your risk-reward ratios.",
      category: "Risk Management",
      date: new Date("2025-01-05"),
      readTime: "6 min read",
      featured: false,
    },
    {
      id: 4,
      icon: TrendingUp,
      title: "Market Timing: Finding the Perfect Entry",
      excerpt: "Learn how time-of-day analysis and market session patterns can significantly improve your entry timing and overall win rate.",
      category: "Trading Psychology",
      date: new Date("2024-12-28"),
      readTime: "10 min read",
      featured: false,
    },
    {
      id: 5,
      icon: Brain,
      title: "Dual-Engine Trading: Combining AI and Quant Signals",
      excerpt: "Discover how combining AI contextual analysis with quantitative signals creates high-conviction trading opportunities.",
      category: "Platform Features",
      date: new Date("2024-12-20"),
      readTime: "9 min read",
      featured: false,
    },
    {
      id: 6,
      icon: Target,
      title: "Options Trading 101: Calls, Puts, and Delta",
      excerpt: "A beginner-friendly introduction to options trading, covering the basics of calls, puts, and how to interpret delta values.",
      category: "Options Trading",
      date: new Date("2024-12-15"),
      readTime: "15 min read",
      featured: false,
    },
  ];

  const featuredArticles = articles.filter(a => a.featured);
  const regularArticles = articles.filter(a => !a.featured);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Newspaper className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Blog</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Trading insights, market analysis, and platform updates
          </p>
        </div>

        {/* Featured Articles */}
        {featuredArticles.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Featured Articles</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {featuredArticles.map((article, index) => {
                const Icon = article.icon;
                return (
                  <div
                    key={article.id}
                    className="gradient-border-card card-tilt"
                    data-testid={`featured-article-${index}`}
                  >
                    <Card className="border-0 bg-transparent h-full">
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center spotlight">
                            <Icon className="h-6 w-6 text-primary" />
                          </div>
                          <Badge variant="secondary" className="neon-accent">
                            Featured
                          </Badge>
                        </div>
                        <CardTitle className="text-2xl mb-2">{article.title}</CardTitle>
                        <Badge variant="outline" className="w-fit mb-2">
                          {article.category}
                        </Badge>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                          {article.excerpt}
                        </p>
                        
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span>{format(article.date, 'MMM d, yyyy')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            <span>{article.readTime}</span>
                          </div>
                        </div>

                        <Button 
                          variant="outline" 
                          className="w-full"
                          disabled
                          data-testid={`button-read-article-${article.id}`}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Coming Soon
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Articles */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Recent Articles</h2>
          <div className="space-y-4">
            {regularArticles.map((article, index) => {
              const Icon = article.icon;
              return (
                <Card key={article.id} className="hover-elevate" data-testid={`article-${index}`}>
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-12 gap-6 items-center">
                      <div className="md:col-span-1">
                        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center spotlight">
                          <Icon className="h-7 w-7 text-primary" />
                        </div>
                      </div>
                      <div className="md:col-span-8">
                        <Badge variant="outline" className="mb-2">{article.category}</Badge>
                        <h3 className="text-xl font-bold mb-2">{article.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {article.excerpt}
                        </p>
                      </div>
                      <div className="md:col-span-3 flex md:flex-col gap-3 md:items-end">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{format(article.date, 'MMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{article.readTime}</span>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled
                          data-testid={`button-read-${article.id}`}
                        >
                          Coming Soon
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Newsletter Signup CTA */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardContent className="p-8 text-center">
            <Newspaper className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">Stay Updated</h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Get the latest trading insights, platform updates, and market analysis delivered to your inbox
            </p>
            <Button disabled data-testid="button-subscribe-newsletter">
              Subscribe to Newsletter (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
