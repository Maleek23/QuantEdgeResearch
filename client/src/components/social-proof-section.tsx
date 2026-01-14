import { Check, Users, TrendingUp, Zap } from "lucide-react";
import { motion } from "framer-motion";

export function SocialProofSection() {
  const metrics = [
    { icon: Users, value: "500+", label: "Active Traders", color: "cyan" },
    { icon: TrendingUp, value: "12,847", label: "Trades Tracked", color: "green" },
    { icon: Zap, value: "67%", label: "Avg Win Rate", color: "purple" },
  ];

  const testimonials = [
    {
      quote: "Finally a platform that actually tracks results. No more guessing if signals work.",
      author: "Mike T.",
      role: "Day Trader",
      verified: true
    },
    {
      quote: "The 6-engine system caught me a 140% runner I would've missed. Worth every penny.",
      author: "Sarah K.",
      role: "Options Trader",
      verified: true
    },
    {
      quote: "Best research tool I've used. Clean UI, real data, transparent performance.",
      author: "James L.",
      role: "Swing Trader",
      verified: true
    }
  ];

  return (
    <section className="py-12 lg:py-20 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16 max-w-4xl mx-auto">
          {metrics.map((metric, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="glass-card rounded-xl p-6 text-center border border-slate-800/50"
            >
              <div className={`h-12 w-12 rounded-xl bg-${metric.color}-500/10 flex items-center justify-center mx-auto mb-3`}>
                <metric.icon className={`h-6 w-6 text-${metric.color}-400`} />
              </div>
              <div className="text-3xl font-bold font-mono tabular-nums mb-1">{metric.value}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{metric.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="text-center mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-cyan-400 mb-2">
            Trusted by Traders
          </p>
          <h2 className="text-2xl lg:text-3xl font-bold">Real Results. Real Feedback.</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {testimonials.map((testimonial, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15 }}
              className="glass-card rounded-xl p-6 border border-slate-800/50 hover-elevate"
            >
              <div className="mb-4">
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="h-4 w-4 fill-cyan-400" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">"{testimonial.quote}"</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{testimonial.author}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
                {testimonial.verified && (
                  <div className="flex items-center gap-1 text-cyan-400">
                    <Check className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-medium">Verified</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
