import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FloatingBubblesBackground } from "@/components/floating-bubbles-background";
import { CheckCircle, Sparkles, ArrowRight, Brain, TrendingUp, LineChart, Target } from "lucide-react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

export default function InviteWelcome() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get("code") || params.get("invite") || "";
    setInviteCode(code);
  }, [search]);

  const handleAcceptInvite = () => {
    if (inviteCode) {
      navigate(`/join-beta?code=${inviteCode}`);
    } else {
      navigate("/join-beta");
    }
  };

  const features = [
    { icon: Brain, label: "AI-Powered Analysis", desc: "Claude, GPT-4, Gemini" },
    { icon: TrendingUp, label: "Quantitative Signals", desc: "RSI, VWAP, ADX" },
    { icon: LineChart, label: "Chart Recognition", desc: "Real-time patterns" },
    { icon: Target, label: "Risk Management", desc: "Position sizing tools" },
  ];

  return (
    <div className="min-h-screen bg-[#050b16] flex items-center justify-center p-4 overflow-hidden">
      <FloatingBubblesBackground />
      
      <div className="relative z-10 w-full max-w-2xl">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <img 
              src={quantEdgeLabsLogoUrl} 
              alt="Quant Edge Labs" 
              className="h-20 w-20 object-contain drop-shadow-[0_0_30px_rgba(0,212,255,0.5)]" 
            />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-2">
            <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-cyan-500 bg-clip-text text-transparent">QUANT EDGE</span>
          </h1>
          <p className="text-2xl font-semibold text-blue-400 tracking-[0.3em] mb-4">LABS</p>
          <p className="text-slate-400 text-lg">Multiple Engines, One Edge</p>
        </div>

        {/* Invite Card */}
        <Card className="bg-[#0a1525]/90 border-cyan-500/20 backdrop-blur-xl shadow-2xl shadow-cyan-500/10">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4">
              <Badge className="bg-gradient-to-r from-cyan-500/20 to-cyan-400/10 text-cyan-300 border-cyan-500/30 px-4 py-2 text-sm font-medium">
                <Sparkles className="w-4 h-4 mr-2" />
                Exclusive Beta Access
              </Badge>
            </div>
            <CardTitle className="text-3xl text-white" data-testid="text-invite-title">
              You've Been Invited!
            </CardTitle>
            <CardDescription className="text-slate-400 text-base mt-2">
              Welcome to the future of quantitative trading research. Your exclusive access awaits.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
                >
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <feature.icon className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{feature.label}</p>
                    <p className="text-xs text-slate-500">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* What You Get */}
            <div className="pt-4 border-t border-slate-700/50">
              <p className="text-center text-sm text-slate-400 mb-4">Your beta access includes:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Full Platform Access", "Priority Support", "Early Features", "Discord Community"].map((item, idx) => (
                  <Badge key={idx} variant="outline" className="border-slate-600 text-slate-300 gap-1">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    {item}
                  </Badge>
                ))}
              </div>
            </div>

            {/* CTA Button */}
            <Button 
              onClick={handleAcceptInvite}
              size="lg"
              className="w-full bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-bold hover:from-cyan-400 hover:to-cyan-300 h-14 text-lg shadow-lg shadow-cyan-500/25"
              data-testid="button-accept-invite"
            >
              Accept Your Invitation
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>

            {/* Disclaimer */}
            <p className="text-center text-xs text-slate-500">
              By accepting, you agree this platform is for educational and research purposes only.
              <br />Past performance is not indicative of future results.
            </p>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-slate-500">
            Questions? Join our{" "}
            <a 
              href="https://discord.gg/3QF8QEKkYq" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline"
            >
              Discord community
            </a>
          </p>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-slate-500 hover:text-slate-300"
            onClick={() => navigate("/")}
            data-testid="button-back-home"
          >
            Learn more about the platform
          </Button>
        </div>
      </div>
    </div>
  );
}
