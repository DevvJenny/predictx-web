import { LoadingSpinner } from "@/components/shared/loading-spinner";

export function RouteLoading() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <LoadingSpinner size="lg" label="Loading..." />
    </main>
  );
}