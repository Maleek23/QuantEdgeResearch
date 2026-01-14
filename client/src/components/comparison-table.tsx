import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

export function ComparisonTable() {
  const features = [
    { name: "Multi-Engine Analysis", quantEdge: true, tradingView: false, benzinga: false, finviz: false },
    { name: "ML Predictions", quantEdge: true, tradingView: false, benzinga: false, finviz: false },
    { name: "AI Consensus (Multi-LLM)", quantEdge: true, tradingView: false, benzinga: true, finviz: false },
    { name: "Options Flow Data", quantEdge: true, tradingView: false, benzinga: true, finviz: false },
    { name: "Performance Tracking", quantEdge: true, tradingView: false, benzinga: false, finviz: false },
    { name: "Paper Trading", quantEdge: true, tradingView: true, benzinga: false, finviz: false },
    { name: "Auto-Scanners", quantEdge: true, tradingView: true, benzinga: false, finviz: true },
    { name: "Win Rate Analytics", quantEdge: true, tradingView: false, benzinga: false, finviz: false },
    { name: "Discord Alerts", quantEdge: true, tradingView: false, benzinga: true, finviz: false },
  ];

  const competitors = [
    { name: "Quant Edge", highlight: true, price: "$39/mo" },
    { name: "TradingView", highlight: false, price: "$49/mo" },
    { name: "Benzinga Pro", highlight: false, price: "$99/mo" },
    { name: "Finviz Elite", highlight: false, price: "$40/mo" },
  ];

  return (
    <section className="py-12 lg:py-20 bg-slate-900/30">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-medium uppercase tracking-wider text-cyan-400 mb-2">
            Platform Comparison
          </p>
          <h2 className="text-2xl lg:text-3xl font-bold mb-3">More Features. Better Price.</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            See how Quant Edge Labs stacks up against other trading platforms
          </p>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block max-w-5xl mx-auto overflow-hidden rounded-xl border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left p-4 bg-slate-950">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Feature</span>
                  </th>
                  {competitors.map((comp, idx) => (
                    <th key={idx} className={`p-4 text-center ${comp.highlight ? 'bg-cyan-500/5 border-x-2 border-cyan-500/30' : 'bg-slate-950'}`}>
                      <div className="text-sm font-semibold mb-1">{comp.name}</div>
                      <div className={`text-xs font-mono ${comp.highlight ? 'text-cyan-400' : 'text-muted-foreground'}`}>
                        {comp.price}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature, idx) => (
                  <motion.tr
                    key={idx}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.05 }}
                    className="border-b border-slate-800/50"
                  >
                    <td className="p-4 text-sm bg-slate-950/50">
                      {feature.name}
                    </td>
                    <td className="p-4 text-center bg-cyan-500/5 border-x-2 border-cyan-500/30">
                      {feature.quantEdge ? (
                        <Check className="h-5 w-5 text-cyan-400 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-slate-600 mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center bg-slate-950/50">
                      {feature.tradingView ? (
                        <Check className="h-5 w-5 text-slate-400 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-slate-700 mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center bg-slate-950/50">
                      {feature.benzinga ? (
                        <Check className="h-5 w-5 text-slate-400 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-slate-700 mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center bg-slate-950/50">
                      {feature.finviz ? (
                        <Check className="h-5 w-5 text-slate-400 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-slate-700 mx-auto" />
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4 max-w-md mx-auto">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.05 }}
              className="glass-card rounded-lg p-4 border border-slate-800"
            >
              <div className="font-semibold text-sm mb-3">{feature.name}</div>
              <div className="grid grid-cols-4 gap-2">
                {competitors.map((comp, compIdx) => (
                  <div key={compIdx} className="text-center">
                    <div className="text-[10px] text-muted-foreground mb-1 truncate">{comp.name}</div>
                    {(compIdx === 0 && feature.quantEdge) ||
                     (compIdx === 1 && feature.tradingView) ||
                     (compIdx === 2 && feature.benzinga) ||
                     (compIdx === 3 && feature.finviz) ? (
                      <Check className={`h-4 w-4 mx-auto ${comp.highlight ? 'text-cyan-400' : 'text-slate-400'}`} />
                    ) : (
                      <X className="h-4 w-4 text-slate-700 mx-auto" />
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
