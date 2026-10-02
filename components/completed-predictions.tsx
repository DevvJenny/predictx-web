"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Calendar, CheckCircle, Coins, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "./shared/empty-state";
import { GamingButton } from "./shared/gaming-button";
import { useStaking } from "@/hooks/use-staking";
import { calculateCompletedPayout } from "@/lib/calculations";
import { PLATFORM_FEE } from "@/lib/calculations";

export function CompletedPredictions() {
  const completedStakes = useStaking((s) => s.completedStakes());
  const claimStake = useStaking((s) => s.claimStake);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (completedStakes.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="w-10 h-10" />}
        title="No Completed Predictions"
        description="Your resolved stakes will appear here once a poll is settled."
      />
    );
  }

  const wonStakes = completedStakes.filter((s) => s.outcome === "won");
  const totalProfit = completedStakes.reduce((sum, s) => sum + (s.profit ?? 0), 0);
  const totalStaked = completedStakes.reduce((sum, s) => sum + s.amount, 0);
  const winRate = completedStakes.length > 0
    ? (wonStakes.length / completedStakes.length) * 100
    : 0;

  async function handleClaim(stakeId: string) {
    setClaiming(stakeId);
    setConfirmId(null);
    try {
      await claimStake(stakeId);
      toast.success("Winnings Claimed! 🎉", {
        description: "Your net payout has been credited to your wallet in XLM.",
      });
    } catch (err) {
      toast.error("Claim failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border clip-corner p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total P/L</div>
          <div
            className={`font-display text-2xl font-black ${totalProfit > 0 ? "text-success" : "text-accent"} ${totalProfit > 0 ? "text-glow-green" : ""}`}
          >
            {totalProfit > 0 ? "+" : ""}${totalProfit.toFixed(0)}
          </div>
        </div>
        <div className="bg-surface border border-border clip-corner p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Win Rate</div>
          <div className="font-display text-2xl font-black text-primary text-glow-cyan">{winRate.toFixed(0)}%</div>
        </div>
        <div className="bg-surface border border-border clip-corner p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total ROI</div>
          <div className={`font-display text-2xl font-black ${totalProfit > 0 ? "text-success" : "text-accent"}`}>
            {totalStaked > 0 ? ((totalProfit / totalStaked) * 100).toFixed(0) : "0"}%
          </div>
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        {completedStakes.map((stake) => {
          const won = stake.outcome === "won";
          const gross = stake.grossPayout ?? (stake.profit != null && won ? stake.amount + stake.profit / (1 - PLATFORM_FEE) : stake.amount);
          const winningsOnly = gross - stake.amount;
          const fee = won ? winningsOnly * PLATFORM_FEE : 0;
          const netPayout = won ? gross - fee : 0;
          const isConfirming = confirmId === stake.id;
          const isClaiming = claiming === stake.id;

          return (
            <div
              key={stake.id}
              className={`bg-surface border-2 clip-corner-lg p-5 transition-all ${won ? "border-success/30 hover:border-success/50" : "border-accent/30 hover:border-accent/50"}`}
            >
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {won ? (
                      <div className="flex items-center gap-2 px-2 py-1 bg-success/20 text-success rounded text-xs font-bold uppercase">
                        <TrendingUp className="h-3 w-3" />
                        WON
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-1 bg-accent/20 text-accent rounded text-xs font-bold uppercase">
                        <TrendingDown className="h-3 w-3" />
                        LOST
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">{stake.matchName}</div>
                  </div>
                  <h3 className="font-bold text-foreground">{stake.question}</h3>
                </div>

                {/* Claim / Claimed button for won stakes */}
                {won && (
                  <div className="flex flex-col items-end gap-2">
                    {stake.claimed ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success border border-success/30 rounded text-xs font-bold uppercase">
                        <CheckCircle className="h-3 w-3" />
                        Claimed
                      </div>
                    ) : isConfirming ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-3 py-1.5 text-xs border border-border text-muted-foreground rounded uppercase hover:border-primary transition-colors"
                        >
                          Cancel
                        </button>
                        <GamingButton
                          variant="success"
                          size="sm"
                          loading={isClaiming}
                          onClick={() => handleClaim(stake.id)}
                        >
                          <CheckCircle className="h-3 w-3" />
                          Confirm Claim
                        </GamingButton>
                      </div>
                    ) : (
                      <GamingButton
                        variant="gold"
                        size="sm"
                        onClick={() => setConfirmId(stake.id)}
                      >
                        <Coins className="h-3 w-3" />
                        Claim Winnings
                      </GamingButton>
                    )}
                  </div>
                )}
              </div>

              {/* Fee breakdown for won stakes */}
              {won && !stake.claimed && (
                <div className="mb-4 p-3 bg-gold/5 border border-gold/20 rounded text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Gross share</span>
                    <span className="font-mono text-foreground">${gross.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Platform fee (5%)</span>
                    <span className="font-mono text-accent">−${fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-gold/20 pt-1">
                    <span className="text-gold">Net payout</span>
                    <span className="font-mono text-gold">${netPayout.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Your Side</div>
                  <div
                    className={`text-sm font-bold uppercase ${stake.side === "yes" ? "text-success" : "text-accent"}`}
                  >
                    {stake.side}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Outcome</div>
                  <div className="text-sm font-bold uppercase text-foreground">{stake.outcome}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Stake</div>
                  <div className="text-sm font-mono font-bold">${stake.amount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Net Payout</div>
                  <div className={`text-sm font-mono font-bold ${won ? "text-gold" : "text-muted-foreground"}`}>
                    {won ? `$${netPayout.toFixed(2)}` : "$0"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">P/L</div>
                  <div className={`text-sm font-mono font-bold ${(stake.profit ?? 0) > 0 ? "text-success" : "text-accent"}`}>
                    {(stake.profit ?? 0) > 0 ? "+" : ""}${(stake.profit ?? 0).toFixed(0)}{" "}
                    ({(stake.roi ?? 0).toFixed(0)}%)
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
