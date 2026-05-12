import { cn } from "@/lib/utils";
import { useSwimmerModal } from "./SwimmerModalProvider";

interface Props {
  childName: string;
  parentEmail: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Wraps a swimmer name/identifier so clicking (or tapping on touch devices)
 * opens the unified Swimmer modal anywhere in the admin app.
 *
 * NOTE on touch devices: Radix Dialog/Sheet primitives capture the first
 * `pointerdown` for outside-click detection, which can swallow taps on
 * nested triggers. We open on `onPointerDown` (with stopPropagation) so the
 * tap reliably opens the modal on iPad/tablet, and keep `onClick` as a
 * keyboard / synthesized-click fallback (guarded so we don't double-open).
 */
export default function SwimmerLink({ childName, parentEmail, className, children }: Props) {
  const { open } = useSwimmerModal();

  const handleOpen = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    open({ child_name: childName, parent_email: parentEmail });
  };

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        // Only intercept primary pointer (touch / left-click). Let other
        // pointer types fall through to default click handling.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        handleOpen(e);
      }}
      onClick={(e) => {
        // Fallback for keyboard activation; pointerdown already handled
        // mouse + touch. Guard prevents double-open by checking pointerType.
        if ((e.nativeEvent as PointerEvent).pointerType) return;
        handleOpen(e);
      }}
      className={cn(
        "text-left font-medium text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded-sm cursor-pointer touch-manipulation",
        className,
      )}
    >
      {children || childName}
    </button>
  );
}
