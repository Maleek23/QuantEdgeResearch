import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Target, Brain, Calculator, TrendingUp, Clock, Shield, ChevronRight, Lightbulb, BarChart2, DollarSign, Heart, Scale, Compass } from "lucide-react";
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
    <div className="mb-10">
      <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
        {title}
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {courses.map((course, index) => {
          const Icon = course.icon;
          return (
            <Card 
              key={index}
              className="hover-elevate h-full"
              data-testid={`course-${title.toLowerCase().replace(/\s+/g, '-')}-${index}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {course.level}
                    </Badge>
                  </div>
                </div>
                <CardTitle className="text-base leading-tight">{course.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                  {course.description}
                </p>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Clock className="h-3 w-3" />
                  <span>{course.duration}</span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {course.topics.map((topic, i) => (
                    <Badge key={i} variant="secondary" className="text-xs px-2 py-0.5">
                      {topic}
                    </Badge>
                  ))}
                </div>

                <Button 
                  variant="ghost" 
                  className="w-full justify-between text-sm"
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
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Trading Academy</h1>
              <p className="text-sm text-muted-foreground">
                Free educational resources for traders at every level
              </p>
            </div>
          </div>
        </div>

        {/* Introduction */}
        <div className="glass-card rounded-xl p-5 mb-8">
          <div className="flex items-start gap-4">
            <Lightbulb className="h-6 w-6 text-amber-400 flex-shrink-0 mt-0.5" />
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

        {/* Blog Link */}
        <div className="glass-card rounded-xl p-5 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-start gap-4">
              <BookOpen className="h-6 w-6 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Want More?</h3>
                <p className="text-sm text-muted-foreground">
                  Check out the blog for in-depth articles on specific trading topics.
                </p>
              </div>
            </div>
            <Link href="/blog">
              <Button variant="outline" size="sm" data-testid="button-visit-blog">
                Visit Blog
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="glass-card rounded-xl p-4 border-l-2 border-l-amber-500/50">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
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
