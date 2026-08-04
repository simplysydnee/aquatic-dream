import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { AgeGateKind, ProgramKey } from "@/lib/programEligibility";

interface Props {
  kind: AgeGateKind;
  /** Plain-language description of the held spot, when one is being released. */
  holdReleaseNotice?: string | null;
  switching?: boolean;
  onSwitch: (target: ProgramKey) => void;
  onBackToPrograms?: () => void;
}

/**
 * A hard block, not a hint. Public /join only: the swimmer's date of birth does
 * not match the program they picked, so the only way forward is a switch.
 */
const AgeGatePanel = ({ kind, holdReleaseNotice, switching, onSwitch, onBackToPrograms }: Props) => {
  const adultInKids = kind === "adult_in_kids";

  return (
    <div className="rounded-lg border-2 border-[#F58B76] bg-[#F58B76]/5 p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-[#1a3a8a]">
        {adultInKids ? "Adult Swim is the right fit" : "Adult Swim is for 18 and over"}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-[#2a5e84]">
        {adultInKids
          ? "Swimmers 18 and over enroll in Adult Swim. It is $140 a month instead of $200, runs Tuesday evenings at 7:15, and is a small group of two adults."
          : "Adult Swim is for swimmers 18 and over. Swimmers under 18 join Private Swim for one on one coaching, or Small Group with no more than three swimmers matched by level."}
      </p>

      {holdReleaseNotice && (
        <p className="mt-3 rounded-md bg-white/70 p-3 text-sm text-[#2a5e84]">
          {holdReleaseNotice}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {adultInKids ? (
          <Button
            type="button"
            disabled={switching}
            onClick={() => onSwitch("adult_group")}
            className="h-12 w-full bg-[#F58B76] text-white hover:bg-[#F58B76]/90 sm:w-auto"
          >
            {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Switch to Adult Swim"}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              disabled={switching}
              onClick={() => onSwitch("private")}
              className="h-12 w-full bg-[#F58B76] text-white hover:bg-[#F58B76]/90 sm:w-auto"
            >
              {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Switch to Private Swim"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={switching}
              onClick={() => onSwitch("kid_group")}
              className="h-12 w-full border-[#2a5e84]/30 text-[#1a3a8a] hover:bg-[#2a5e84]/5 sm:w-auto"
            >
              Switch to Small Group
            </Button>
          </>
        )}
      </div>

      {onBackToPrograms && (
        <button
          type="button"
          onClick={onBackToPrograms}
          className="mt-4 text-sm font-medium text-[#2a5e84] underline underline-offset-2 hover:text-[#1a3a8a]"
        >
          Back to programs
        </button>
      )}
    </div>
  );
};

export default AgeGatePanel;
