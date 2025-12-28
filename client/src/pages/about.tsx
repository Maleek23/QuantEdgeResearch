import { User, Activity, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsDialog } from "@/components/settings-dialog";
import { useState } from "react";
import profileImage from "@assets/malikpic_1760579415191.jpg";

export default function About() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-bold" data-testid="text-app-title">QuantEdge Research</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                data-testid="button-settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6 max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
            <User className="h-8 w-8 text-primary" />
            About the Creator
          </h1>
          <p className="text-muted-foreground">
            Learn more about the developer behind QuantEdge Research
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile Photo */}
              <div className="lg:col-span-1 flex justify-center lg:justify-start">
                <div className="relative">
                  <img 
                    src={profileImage} 
                    alt="Abdulmalik Ajisegiri"
                    className="w-48 h-48 rounded-lg object-cover border-2 border-primary/20"
                    data-testid="img-profile"
                  />
                </div>
              </div>

              {/* Profile Info */}
              <div className="lg:col-span-2 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold" data-testid="text-creator-name">Abdulmalik Ajisegiri</h2>
                  <p className="text-lg text-primary font-medium" data-testid="text-creator-title">Model Risk Engineer @ DTCC</p>
                  <p className="text-sm text-muted-foreground">Dallas Fort-Worth, Texas</p>
                </div>

                <p className="text-muted-foreground leading-relaxed">
                  Systems engineer specializing in AI/ML model validation, risk analytics, and quantitative methods. 
                  Currently leading validation efforts for enterprise AI/ML models at DTCC, with expertise in stress testing, 
                  benchmarking, and model governance following SR 11-7 principles.
                </p>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Education</h3>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>• M.S. Systems Engineering - University of Oklahoma (3.8 GPA)</p>
                      <p>• B.S. Computer Engineering - University of Texas at Arlington</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Certifications</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="text-xs">CISA Certified</Badge>
                      <Badge variant="secondary" className="text-xs">MATLAB Certified</Badge>
                      <Badge variant="secondary" className="text-xs">Simulink Certified</Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Connect</h3>
                    <div className="flex gap-3">
                      <a 
                        href="https://www.linkedin.com/in/malikajisegiri" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                        data-testid="link-linkedin"
                      >
                        LinkedIn
                      </a>
                      <span className="text-muted-foreground">•</span>
                      <a 
                        href="https://github.com/Maleek23" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                        data-testid="link-github"
                      >
                        GitHub
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-muted-border">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Platform Note:</strong> QuantEdge Research is a personal project 
            showcasing quantitative analysis and AI-powered trading research tools. This platform demonstrates 
            advanced technical analysis, multi-timeframe indicators, and intelligent research brief generation for 
            educational purposes.
          </p>
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
