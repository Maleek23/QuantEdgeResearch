import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, Shield, Scale } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative pt-6">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Last updated: October 21, 2025
              </p>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            Educational Research Platform Only
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-semibold text-foreground">
            QuantEdge Research is an EDUCATIONAL and RESEARCH platform. It is NOT financial advice.
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>All research briefs are for educational purposes and research demonstration only</li>
            <li>We are not licensed financial advisors, brokers, or investment professionals</li>
            <li>Past performance does not guarantee future results</li>
            <li>Trading involves substantial risk of loss and is not suitable for everyone</li>
            <li>You are solely responsible for your own trading decisions</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Acceptance of Terms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            By accessing or using QuantEdge Research, you agree to be bound by these Terms of Service 
            and our Privacy Policy. If you do not agree to these terms, do not use this platform.
          </p>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the platform 
            after changes constitutes acceptance of the modified terms.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>QuantEdge Research provides:</p>
          <ul className="list-disc list-inside space-y-2">
            <li>Quantitative analysis and technical indicator signals</li>
            <li>AI-powered research brief generation (educational demonstration)</li>
            <li>Market data aggregation from public sources</li>
            <li>Performance tracking and analytics tools</li>
            <li>Risk calculation and position sizing tools</li>
            <li>Educational resources about trading strategies</li>
          </ul>
          <p className="font-semibold text-foreground mt-4">
            These services are provided "AS IS" without warranties of any kind.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Responsibilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>You agree to:</p>
          <ul className="list-disc list-inside space-y-2">
            <li>Provide accurate information when creating an account</li>
            <li>Keep your account credentials secure and confidential</li>
            <li>Use the platform only for lawful purposes</li>
            <li>Not attempt to circumvent security measures or access unauthorized data</li>
            <li>Not use automated tools to scrape or harvest data from the platform</li>
            <li>Not redistribute or resell our research briefs or analysis</li>
            <li>Conduct your own due diligence before making any trading decisions</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disclaimer of Warranties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            WE MAKE NO GUARANTEES ABOUT:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>Accuracy of market data, prices, or analysis</li>
            <li>Profitability of any research patterns or strategies</li>
            <li>Availability or uptime of the platform</li>
            <li>Compatibility with your specific use case</li>
            <li>Freedom from errors, bugs, or security vulnerabilities</li>
          </ul>
          <p className="text-xs mt-4">
            Market data may be delayed or inaccurate. Always verify prices with your broker 
            before executing trades.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limitation of Liability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>We are not liable for any trading losses you incur</li>
            <li>We are not liable for data loss, service interruptions, or technical failures</li>
            <li>We are not liable for indirect, consequential, or punitive damages</li>
            <li>Our total liability shall not exceed the amount you paid for premium services (if any)</li>
          </ul>
          <p className="text-amber-500 text-xs mt-4">
            ⚠️ You assume all risk when using this platform for trading research.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Intellectual Property
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            The QuantEdge platform UI, design, and educational content are the intellectual property 
            of QuantEdge Research. Our quantitative algorithms and signal weights are proprietary.
          </p>
          <p>
            You may not copy, reproduce, or redistribute our proprietary code or algorithms without 
            explicit written permission.
          </p>
          <p className="text-xs mt-4">
            We may open-source certain UI components and educational materials, which will be 
            clearly marked with appropriate licenses.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Termination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            We reserve the right to suspend or terminate your access to the platform at any time, 
            with or without notice, for:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>Violation of these Terms of Service</li>
            <li>Fraudulent, abusive, or illegal activity</li>
            <li>Security threats or attempted unauthorized access</li>
            <li>Any reason at our sole discretion</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardContent className="pt-6 space-y-2 text-sm">
          <p className="font-semibold">Contact & Governing Law</p>
          <p className="text-muted-foreground">
            These terms are governed by applicable laws. For questions or concerns, 
            contact us through our Discord community or support channels.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            By using QuantEdge Research, you acknowledge that you have read, understood, 
            and agree to be bound by these Terms of Service.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
