import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Target, Brain, Calculator, TrendingUp, Clock, Shield, ChevronRight, Lightbulb, BarChart2, DollarSign, Heart, Scale, Compass, FileText } from "lucide-react";
import { Link } from "wouter";

export default function Academy() {
  const fundamentals = [
    {
      icon: Brain,
      title: "What is Technical Analysis?",
      description: "Understanding how price patterns, volume, and indicators help identify potential market movements. Learn the basics of reading charts.",
      level: "Beginner",
      duration: "12 min read",
      topics: ["Price Action", "Chart Patterns", "Volume Analysis"],
    },
    {
      icon: BarChart2,
      title: "Common Chart Patterns",
      description: "Learn to recognize head and shoulders, double tops/bottoms, triangles, and other patterns that traders use to anticipate price moves.",
      level: "Beginner",
      duration: "18 min read",
      topics: ["Reversal Patterns", "Continuation Patterns", "Breakouts"],
    },
    {
      icon: Calculator,
      title: "Understanding Moving Averages",
      description: "Explore simple, exponential, and weighted moving averages. Learn how traders use them to identify trends and potential entry points.",
      level: "Beginner",
      duration: "15 min read",
      topics: ["SMA vs EMA", "Crossovers", "Support/Resistance"],
    },
  ];

  const riskManagement = [
    {
      icon: Shield,
      title: "Position Sizing Fundamentals",
      description: "The most important skill in trading. Learn the 1-2% rule, how to calculate position size, and why risking too much destroys accounts.",
      level: "Beginner",
      duration: "20 min read",
      topics: ["The 2% Rule", "Risk Per Trade", "Account Preservation"],
    },
    {
      icon: Target,
      title: "Setting Stop Losses",
      description: "Where to place stops, why most traders place them wrong, and techniques for protecting profits while giving trades room to work.",
      level: "Intermediate",
      duration: "22 min read",
      topics: ["Stop Placement", "Trailing Stops", "Mental Stops"],
    },
    {
      icon: Scale,
      title: "Risk-Reward Ratios Explained",
      description: "Why a 1:2 risk-reward ratio means you can be wrong 60% of the time and still profit. The math behind consistent trading.",
      level: "Beginner",
      duration: "15 min read",
      topics: ["R:R Calculation", "Win Rate Math", "Expectancy"],
    },
  ];

  const psychology = [
    {
      icon: Heart,
      title: "Trading Psychology Basics",
      description: "Fear, greed, FOMO, and revenge trading. Understanding the emotional traps that cause most traders to fail and how to avoid them.",
      level: "Beginner",
      duration: "25 min read",
      topics: ["Fear of Missing Out", "Revenge Trading", "Overconfidence"],
    },
    {
      icon: Lightbulb,
      title: "Building a Trading Plan",
      description: "Why trading without a plan is gambling. How to create rules for entries, exits, position sizing, and when to step away.",
      level: "Intermediate",
      duration: "30 min read",
      topics: ["Entry Rules", "Exit Rules", "Daily Limits"],
    },
    {
      icon: Compass,
      title: "Developing Discipline",
      description: "The difference between knowing what to do and actually doing it. Practical techniques for following your rules consistently.",
      level: "Intermediate",
      duration: "20 min read",
      topics: ["Journaling", "Pre-Trade Checklist", "Post-Trade Review"],
    },
  ];

  const options = [
    {
      icon: DollarSign,
      title: "Options 101: Calls and Puts",
      description: "What options are, how they work, and the basic mechanics of buying calls and puts. No jargon, just clear explanations.",
      level: "Beginner",
      duration: "20 min read",
      topics: ["Call Options", "Put Options", "Premium & Strike"],
    },
    {
      icon: TrendingUp,
      title: "The Greeks: Delta, Theta, Gamma",
      description: "How options prices change based on time, volatility, and price movement. Essential knowledge for any options trader.",
      level: "Intermediate",
      duration: "28 min read",
      topics: ["Delta", "Theta Decay", "Implied Volatility"],
    },
    {
      icon: Clock,
      title: "Time Decay and Expiration",
      description: "Why options lose value over time, how to use this to your advantage, and common mistakes around expiration dates.",
      level: "Intermediate",
      duration: "18 min read",
      topics: ["Theta", "Expiration Selection", "Weekend Decay"],
    },
  ];

  const renderCourseSection = (title: string, courses: typeof fundamentals) => (
    <div className="mb-12">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        Course Module
      </p>
      <h2 className="text-xl font-semibold mb-6">
        {title}
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course, index) => {
          const Icon = course.icon;
          return (
            <Card 
              key={index}
              className="glass-card hover-elevate h-full border-slate-700/50"
              data-testid={`course-${title.toLowerCase().replace(/\s+/g, '-')}-${index}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <Badge variant="outline" className="text-xs border-slate-700">
                    {course.level}
                  </Badge>
                </div>
                <CardTitle className="text-base leading-tight">{course.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {course.description}
                </p>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">{course.duration}</span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {course.topics.map((topic, i) => (
                    <Badge key={i} variant="secondary" className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-400 border-purple-500/30">
                      {topic}
                    </Badge>
                  ))}
                </div>

                <Button 
                  variant="ghost" 
                  className="w-full justify-between text-sm hover-elevate"
                  disabled
                >
                  Read Article
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Learning Center
          </p>
          <div className="flex items-center gap-4 mb-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold" data-testid="text-page-title">Trading Academy</h1>
              <p className="text-sm text-muted-foreground">
                Free educational resources for traders at every level
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links to Other Resources */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Link href="/technical-guide">
            <Card className="glass-card hover-elevate h-full border-slate-700/50 cursor-pointer" data-testid="link-technical-guide">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">Technical Guide</h3>
                  <p className="text-xs text-muted-foreground">Indicator reference</p>
                </div>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/trading-rules">
            <Card className="glass-card hover-elevate h-full border-slate-700/50 cursor-pointer" data-testid="link-trading-rules">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">Trading Rules</h3>
                  <p className="text-xs text-muted-foreground">Risk management</p>
                </div>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/blog">
            <Card className="glass-card hover-elevate h-full border-slate-700/50 cursor-pointer" data-testid="link-blog">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">Blog</h3>
                  <p className="text-xs text-muted-foreground">Market insights</p>
                </div>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Introduction */}
        <div className="glass-card rounded-xl p-6 mb-8 border border-slate-700/50">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
              <Lightbulb className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Learn at Your Own Pace</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                These articles cover fundamental concepts that apply to any trading approach. 
                Whether you trade stocks, options, crypto, or futures—understanding these principles 
                will help you make better decisions and manage risk effectively.
              </p>
            </div>
          </div>
        </div>

        {/* Course Sections */}
        {renderCourseSection("Technical Analysis Basics", fundamentals)}
        {renderCourseSection("Risk Management", riskManagement)}
        {renderCourseSection("Trading Psychology", psychology)}
        {renderCourseSection("Options Trading", options)}

        {/* Disclaimer */}
        <div className="glass-card rounded-xl p-5 border border-slate-700/50 border-l-2 border-l-amber-500/50">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Educational Disclaimer</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This content is for educational purposes only and does not constitute financial advice. 
                Trading involves substantial risk of loss. Past performance does not guarantee future results. 
                Always do your own research and consider your financial situation before trading.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
