import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, Calendar, Clock, TrendingUp, Brain, Target, BarChart3, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { SEOHead } from "@/components/seo-head";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BlogPost } from "@shared/schema";

export default function Blog() {
  const { data: articles = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/blog"],
  });

  const featuredArticles = articles.slice(0, 2);
  const regularArticles = articles.slice(2);

  const getIcon = (category: string) => {
    switch (category) {
      case "AI Trading": return Brain;
      case "Quantitative Analysis": return Target;
      case "Risk Management": return BarChart3;
      case "Trading Psychology": return TrendingUp;
      case "Platform Features": return Brain;
      case "Options Trading": return Target;
      default: return Newspaper;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <SEOHead pageKey="blog" />
        <div className="container mx-auto max-w-7xl">
          <div className="mb-8">
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-6 w-96" />
          </div>
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <SEOHead pageKey="blog" />
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

        {articles.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">Coming Soon</p>
          </div>
        ) : (
          <>
            {/* Featured Articles */}
            {featuredArticles.length > 0 && (
              <div className="mb-12">
                <h2 className="text-2xl font-bold mb-6">Featured Articles</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {featuredArticles.map((article, index) => {
                    const Icon = getIcon(article.category);
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
                                <span>{article.publishedAt ? format(new Date(article.publishedAt), 'MMM d, yyyy') : 'Draft'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                <span>8 min read</span>
                              </div>
                            </div>

                            <Link href={`/blog/${article.slug}`}>
                              <Button 
                                variant="outline" 
                                className="w-full"
                                data-testid={`button-read-article-${article.id}`}
                              >
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Read Article
                              </Button>
                            </Link>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Articles */}
            {regularArticles.length > 0 && (
              <div className="mb-12">
                <h2 className="text-2xl font-bold mb-6">Recent Articles</h2>
                <div className="space-y-4">
                  {regularArticles.map((article, index) => {
                    const Icon = getIcon(article.category);
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
                                <span>{article.publishedAt ? format(new Date(article.publishedAt), 'MMM d, yyyy') : 'Draft'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>6 min read</span>
                              </div>
                              <Link href={`/blog/${article.slug}`}>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  data-testid={`button-read-${article.id}`}
                                >
                                  Read Article
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Newsletter Signup CTA */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardContent className="p-8 text-center">
            <Newspaper className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">Stay Updated</h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Get the latest trading insights, platform updates, and market analysis delivered to your inbox
            </p>
            <Button variant="glass" disabled data-testid="button-subscribe-newsletter">
              Subscribe to Newsletter (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
