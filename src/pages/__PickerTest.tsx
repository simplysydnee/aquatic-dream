// TEMPORARY test harness for SessionPicker — used to verify wrong-age-group fix.
// DELETE after Playwright verification.
import { useSearchParams } from "react-router-dom";
import SessionPicker from "@/components/swim-enrollment/SessionPicker";
import { SwimLevel } from "@/components/swim-enrollment/types";

const PickerTest = () => {
  const [params] = useSearchParams();
  const level = (params.get("level") || "white") as SwimLevel;
  const age = parseInt(params.get("age") || "4", 10);
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="text-xs text-muted-foreground mb-4">level={level} · age={age}</div>
      <SessionPicker
        level={level}
        childAge={age}
        onSelect={() => {}}
        onBack={() => {}}
      />
    </div>
  );
};

export default PickerTest;
