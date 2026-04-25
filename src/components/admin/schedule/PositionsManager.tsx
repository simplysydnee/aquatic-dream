import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Position { id: string; name: string; color: string; is_active: boolean; }

export default function PositionsManager({
  open, onOpenChange, onChanged,
}: { open: boolean; onOpenChange: (v: boolean) => void; onChanged: () => void; }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2a5e84");

  const load = async () => {
    const { data } = await supabase.from("shift_positions").select("*").order("name");
    if (data) setPositions(data);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("shift_positions").insert({ name: name.trim(), color });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setName(""); setColor("#2a5e84");
    load(); onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("shift_positions").update({ is_active: false }).eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    load(); onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Positions</DialogTitle>
          <DialogDescription>Color-coded categories for shifts.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {positions.filter((p) => p.is_active).map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded border p-2">
              <span className="inline-block w-4 h-4 rounded" style={{ background: p.color }} />
              <span className="flex-1 text-sm">{p.name}</span>
              <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="border-t pt-3 space-y-2">
          <Label>Add a position</Label>
          <div className="flex gap-2">
            <Input placeholder="e.g. Lifeguard" value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-16 p-1" />
            <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
