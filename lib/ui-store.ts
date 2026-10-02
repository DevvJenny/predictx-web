/**
 * Re-export of hooks/use-ui-store for backwards-compatibility.
 * Some components import from "@/lib/ui-store" while others use "@/hooks/use-ui-store".
 * Both paths now resolve to the same store instance.
 */
export { useUIStore } from "@/hooks/use-ui-store";
