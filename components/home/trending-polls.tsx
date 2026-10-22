"use client"

import { useMemo } from "react"
import { Flame } from "lucide-react"
import { PollCard } from "@/components/match/poll-card"
import { useMockData } from "@/hooks/use-mock-data"
import { rankTrendingPolls } from "@/lib/poll-ranking"

/**
 * TrendingPolls
 *
 * Subscribes narrowly to only the polls slice of the store so re-renders are
 * triggered by actual pool/poll mutations rather than any store change.
 *
 * The ranking is recomputed inside useMemo with `polls` as the dependency, so
 * pool and participant changes immediately affect the trending list.
 */
export function TrendingPolls() {
  // Narrow subscription — only re-render when the polls array reference changes.
  const polls = useMockData((state) => state.polls)
  // getMatch is a stable selector function; subscribe to it separately.
  const getMatch = useMockData((state) => state.getMatch)

  // Recompute ranking whenever the polls array changes (pool mutations, new polls, etc.)
  const trendingPolls = useMemo(
    () => rankTrendingPolls(polls),
    [polls],
  )

  return (
    <section className="bg-background py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-10 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Flame className="h-7 w-7 text-gold text-glow-gold animate-pulse" />
            <h2 className="font-display text-3xl md:text-4xl font-black uppercase tracking-wider text-foreground">
              Trending Predictions
            </h2>
            <Flame className="h-7 w-7 text-gold text-glow-gold animate-pulse" />
          </div>

          <p className="text-muted-foreground text-sm uppercase tracking-widest">
            The most popular predictions right now
          </p>

          {/* Decorative divider */}
          <div className="flex items-center justify-center gap-4 pt-1">
            <div className="h-px w-24 bg-gradient-to-r from-transparent to-primary/50" />
            <div className="w-2 h-2 rounded-full bg-primary glow-cyan" />
            <div className="h-px w-24 bg-gradient-to-l from-transparent to-primary/50" />
          </div>
        </div>

        {/* Poll cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {trendingPolls.map((poll, index) => {
            const match = getMatch(poll.matchId)
            if (!match) return null

            return (
              <PollCard
                key={poll.id}
                poll={poll}
                match={match}
                isHottest={index === 0}
                animationDelay={index * 100}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
