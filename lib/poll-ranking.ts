import type { Poll } from "@/lib/mock-data";

export function rankTrendingPolls(polls: readonly Poll[]): Poll[] {
  return polls
    .filter((poll) => poll.status === "active")
    .sort((a, b) => {
      const aPool = a.yesPool + a.noPool;
      const bPool = b.yesPool + b.noPool;
      const popularityDiff = bPool * b.participants - aPool * a.participants;

      return popularityDiff || bPool - aPool || a.id.localeCompare(b.id);
    })
    .slice(0, 6);
}