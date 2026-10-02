"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MOCK_STAKES, STORAGE_KEYS, type Stake } from "@/lib/mock-data";
import {
	calculatePotentialWinnings,
	type WinningsCalculation,
} from "@/lib/calculations";
import { XLM_USD_RATE } from "@/lib/constants";
import { useMockData } from "@/hooks/use-mock-data";
import { useWallet, type TransactionReceipt } from "@/hooks/use-wallet";
import { useTransactions } from "@/hooks/use-transactions";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";

interface StakingState {
	/**
	 * All stakes ever recorded (across all wallets + seed data).
	 * Consumers should call the wallet-scoped selectors below instead of
	 * reading this array directly.
	 */
	stakes: Stake[];

	/** Stakes belonging to the currently connected wallet. */
	activeStakes: () => Stake[];
	pendingStakes: () => Stake[];
	completedStakes: () => Stake[];

	placeStake: (
		pollId: string,
		matchId: string,
		matchName: string,
		question: string,
		side: "yes" | "no",
		amount: number,
	) => Promise<{ stake: Stake; receipt: TransactionReceipt }>;
	calculateWinnings: (
		amount: number,
		side: "yes" | "no",
		yesPool: number,
		noPool: number,
	) => WinningsCalculation;

	/**
	 * Claim winnings for a won, unclaimed stake.
	 * Applies the 5% platform fee, credits XLM to the wallet, and records
	 * a "claim" transaction.
	 */
	claimStake: (stakeId: string) => Promise<void>;

	/** Remove all stakes that belong to the given wallet address.
	 *  Called on disconnect so the next wallet starts with a clean slate. */
	clearWalletStakes: (address: string) => void;
}

/** Return only stakes that belong to the connected wallet. */
function walletStakes(stakes: Stake[]): Stake[] {
	const address = useWallet.getState().address;
	if (!address) return [];
	return stakes.filter((s) => s.wallet === address);
}

export const useStaking = create<StakingState>()(
	persist(
		(set, get) => ({
			// Seed data is included so the demo wallet (SEED_WALLET) shows history
			// on first load.  Other wallets will see an empty list because their
			// address won't match any seed record.
			stakes: MOCK_STAKES,

			activeStakes: () =>
				walletStakes(get().stakes).filter((s) => s.status === "active"),
			pendingStakes: () =>
				walletStakes(get().stakes).filter(
					(s) => s.status === "pending_resolution",
				),
			completedStakes: () =>
				walletStakes(get().stakes).filter((s) => s.status === "completed"),

			placeStake: async (
				pollId,
				matchId,
				matchName,
				question,
				side,
				amount,
			) => {
				const walletState = useWallet.getState();

				// Calls the wallet's simulated Stellar transaction
				const receipt = await walletState.sendTransaction(
					amount,
					`Staked $${amount} on "${question}" – ${side.toUpperCase()}`,
				);

				// Update the poll pool in mock data store, passing the wallet
				// address so participants counts distinct wallets only
				const walletAddress = useWallet.getState().address ?? undefined;
				useMockData.getState().updatePollPool(pollId, side, amount, walletAddress);

				const stake: Stake = {
					id: `stake-${receipt.hash.slice(0, 8)}`,
					pollId,
					matchId,
					matchName,
					question,
					side,
					amount,
					status: "active",
					// Scope the stake to the wallet that placed it
					wallet: walletState.address,
				};

				set((s) => ({ stakes: [...s.stakes, stake] }));

				// Analytics — no wallet address or seeds
				const poll = useMockData.getState().getPoll(pollId);
				trackEvent({
					name: "stake_placed",
					pollCategory: poll?.category ?? "other",
					matchId,
					side,
					amountUSD: amount,
				});

				return { stake, receipt };
			},

			calculateWinnings: (amount, side, yesPool, noPool) =>
				calculatePotentialWinnings(amount, side, yesPool, noPool),

			claimStake: async (stakeId) => {
				const stake = get().stakes.find((s) => s.id === stakeId);
				if (!stake) throw new Error("Stake not found");
				if (stake.outcome !== "won") throw new Error("Stake is not a winner");
				if (stake.claimed) throw new Error("Already claimed");

				const walletState = useWallet.getState();
				if (!walletState.isConnected || !walletState.address) {
					throw new Error("Wallet not connected");
				}

				// Gross payout: use stored grossPayout if present, else fall back
				// to amount + profit (which is net, so reverse-engineer gross)
				const gross = stake.grossPayout
					? stake.grossPayout
					: stake.profit != null
						? stake.amount + stake.profit / (1 - 0.05) // approximate
						: stake.amount;

				// Apply 5% platform fee to winnings only (not the original stake)
				const winnings = gross - stake.amount;
				const fee = winnings * 0.05;
				const netPayout = gross - fee; // stake + net winnings

				// Convert USD → XLM and credit the wallet
				const xlmAmount = netPayout / XLM_USD_RATE;
				walletState.updateBalance(xlmAmount);

				// Mark the stake as claimed
				set((s) => ({
					stakes: s.stakes.map((sk) =>
						sk.id === stakeId ? { ...sk, claimed: true } : sk,
					),
				}));

				// Record a "claim" transaction
				useTransactions.getState().addTransaction({
					type: "claim",
					amount: netPayout,
					amountXLM: xlmAmount,
					description: `Claimed winnings from "${stake.question}" (net after 5% fee)`,
					timestamp: new Date().toISOString(),
					status: "confirmed",
				});
			},

			clearWalletStakes: (address: string) =>
				set((s) => ({
					stakes: s.stakes.filter((stake) => stake.wallet !== address),
				})),
		}),
		{ name: STORAGE_KEYS.stakes },
	),
);
