import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Target, Brain, Calculator, TrendingUp, Clock, Shield, ExternalLink } from "lucide-react";

export default function Academy() {
  const courses = [
    {
      icon: Brain,
      title: "Understanding AI Trading Signals",
      description: "Learn how our AI engines analyze market data, news sentiment, and technical patterns to generate high-probability research patterns.",
      level: "Beginner",
      duration: "15 min read",
      topics: ["AI Analysis", "Market Context", "Signal Interpretation"],
    },
    {
      icon: Calculator,
      title: "Quantitative Trading Fundamentals",
      description: "Dive into the proven quantitative strategies that power our engine: RSI(2) mean reversion, VWAP institutional flow, and volume spike early entry.",
      level: "Intermediate",
      duration: "25 min read",
      topics: ["RSI Strategy", "VWAP Analysis", "Volume Signals"],
    },
    {
      icon: Target,
      title: "Risk Management Essentials",
      description: "Master position sizing, stop-loss placement, and risk-reward ratios. Learn how to protect your capital while maximizing returns.",
      level: "Beginner",
      duration: "20 min read",
      topics: ["Position Sizing", "R:R Ratios", "Stop Loss"],
    },
    {
      icon: TrendingUp,
      title: "Reading Research Briefs Like a Pro",
      description: "Understand confidence scores, probability bands, entry/exit levels, and how to evaluate which signals align with your strategy.",
      level: "Beginner",
      duration: "18 min read",
      topics: ["Confidence Scores", "Entry/Exit Levels", "Signal Quality"],
    },
    {
      icon: Clock,
      title: "Timing Your Trades",
      description: "Learn about optimal entry windows, time-of-day performance patterns, and how to use our timing intelligence system for better execution.",
      level: "Intermediate",
      duration: "22 min read",
      topics: ["Entry Timing", "Market Sessions", "Performance Heatmaps"],
    },
    {
      icon: Shield,
      title: "Options Trading Basics",
      description: "Introduction to options strategies, delta targeting, premium vs. stock price analysis, and how to interpret our options signals.",
      level: "Advanced",
      duration: "30 min read",
      topics: ["Call/Put Options", "Delta Analysis", "Options Pricing"],
    },
  ];

  const resources = [
    {
      title: "Trading Psychology",
      description: "Emotional discipline and maintaining consistency in your trading approach",
      link: "#",
    },
    {
      title: "Technical Analysis Glossary",
      description: "Common terms and indicators used in quantitative trading",
      link: "#",
    },
    {
      title: "Platform User Guide",
      description: "Complete guide to using all features of the QuantEdge platform",
      link: "#",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <GraduationCap className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Academy</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Learn the fundamentals of AI-powered and quantitative trading
          </p>
        </div>

        {/* Courses Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Trading Courses</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course, index) => {
              const Icon = course.icon;
              return (
                <div
                  key={index}
                  className="gradient-border-card card-tilt"
                  data-testid={`course-${index}`}
                >
                  <Card className="border-0 bg-transparent h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center spotlight">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {course.level}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{course.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                        {course.description}
                      </p>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                        <Clock className="h-3 w-3" />
                        <span>{course.duration}</span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {course.topics.map((topic, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {topic}
                          </Badge>
                        ))}
                      </div>

                      <Button 
                        variant="outline" 
                        className="w-full"
                        disabled
                        data-testid={`button-start-course-${index}`}
                      >
                        <BookOpen className="h-4 w-4 mr-2" />
                        Coming Soon
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        {/* Additional Resources */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Additional Resources</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {resources.map((resource, index) => (
              <Card key={index} className="hover-elevate" data-testid={`resource-${index}`}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    {resource.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {resource.description}
                  </p>
                  <Button variant="outline" size="sm" disabled>
                    <ExternalLink className="h-3 w-3 mr-2" />
                    Coming Soon
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Educational Content Disclaimer</h3>
                <p className="text-sm text-muted-foreground">
                  All educational content is for informational purposes only and should not be considered financial advice. 
                  Trading involves substantial risk of loss. Past performance does not guarantee future results.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
