import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Instructor {
  id: string;
  name: string;
  is_active: boolean;
}

interface Props {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  /** When the dialog opens, force a refresh of the list. */
  refreshKey?: unknown;
}

const InstructorPicker = ({
  value,
  onChange,
  placeholder = "Instructor (optional)",
  refreshKey,
}: Props) => {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("instructors")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (!cancelled) setInstructors((data as Instructor[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const selected = value?.trim() || "";
  const matchesActive = instructors.some(
    (i) => i.name.toLowerCase() === selected.toLowerCase(),
  );
  const isLegacy = selected && !matchesActive;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-sm font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {selected ? (
              <span className="truncate">
                {selected}
                {isLegacy && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    (inactive)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[60]" align="start">
        <Command>
          <CommandInput placeholder="Search instructor…" className="text-xs h-8" />
          <CommandList>
            <CommandEmpty>No instructors found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs text-muted-foreground"
              >
                <Check
                  className={cn(
                    "mr-2 h-3.5 w-3.5",
                    !selected ? "opacity-100" : "opacity-0",
                  )}
                />
                — No instructor —
              </CommandItem>
              {instructors.map((inst) => {
                const isSelected = inst.name.toLowerCase() === selected.toLowerCase();
                return (
                  <CommandItem
                    key={inst.id}
                    value={inst.name}
                    onSelect={() => {
                      onChange(inst.name);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {inst.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {isLegacy && (
              <CommandGroup heading="Currently assigned">
                <CommandItem
                  value={`__legacy__${selected}`}
                  onSelect={() => setOpen(false)}
                  className="text-xs text-muted-foreground"
                >
                  <Check className="mr-2 h-3.5 w-3.5 opacity-100" />
                  {selected} <span className="ml-1 text-[10px]">(inactive — pick a new one to replace)</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default InstructorPicker;
