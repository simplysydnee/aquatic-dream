import { cn } from "@/lib/utils";
import { useSwimmerModal } from "./SwimmerModalProvider";

interface Props {
  childName: string;
  parentEmail: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Wraps a swimmer name/identifier so clicking it opens the unified
 * Swimmer modal anywhere in the admin app.
 */
export default function SwimmerLink({ childName, parentEmail, className, children }: Props) {
  const { open } = useSwimmerModal();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open({ child_name: childName, parent_email: parentEmail });
      }}
      className={cn(
        "text-left font-medium text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded-sm",
        className,
      )}
    >
      {children || childName}
    </button>
  );
}
