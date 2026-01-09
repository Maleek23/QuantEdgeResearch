import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-2xl font-bold text-white tracking-tight">QUANT EDGE</span>
            <span className="text-neutral-600">|</span>
            <span className="text-sm font-medium text-neutral-500 tracking-widest">LABS</span>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-[#141414] border border-neutral-800 rounded-xl p-10">
          
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-white mb-2" data-testid="text-invite-title">
              You're Invited
            </h1>
            <p className="text-neutral-500 text-sm">
              Join the beta of our quantitative trading platform.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-3 mb-8 border-t border-neutral-800 pt-6">
            {[
              "AI-powered analysis",
              "Quantitative signals", 
              "Chart pattern detection",
              "Trading journal"
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3 text-neutral-400 text-sm">
                <span className="text-cyan-400">+</span>
                {feature}
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <Button 
            onClick={handleAcceptInvite}
            className="w-full h-12 bg-cyan-400 hover:bg-cyan-300 text-black font-semibold rounded-lg"
            data-testid="button-accept-invite"
          >
            Accept Invitation
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-neutral-600 text-xs mt-6">
          For educational and research purposes only.
        </p>
      </div>
    </div>
  );
}
