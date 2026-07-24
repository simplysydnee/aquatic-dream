import { useClosureSchedule } from "@/hooks/useClosureSchedule";

interface Props {
  className?: string;
  title?: string;
}

const INTRO =
  "Aquatic Dreams is closed for winter break and all major holidays. Posted closure dates for your season:";

export default function ClosureScheduleNote({ className, title }: Props) {
  const { closureSchedule, loading } = useClosureSchedule();
  if (loading) return null;
  return (
    <div className={className}>
      {title && (
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[#1a3a8a]">
          {title}
        </h3>
      )}
      <p className="text-sm text-[#1a3a8a]">{INTRO}</p>
      <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-[#1a3a8a]/90">
        {closureSchedule}
      </pre>
    </div>
  );
}
