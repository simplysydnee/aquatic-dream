import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import LevelBadge from "@/components/LevelBadge";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import { SKILL_KIND_LABELS, type SkillKind } from "@/components/staff/staffTypes";

const LEVEL_ORDER: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];

interface SkillRow {
  id: string;
  swim_level: string;
  position: number;
  kind: SkillKind;
  name: string;
  success_goal: string | null;
  learning_activities: string[] | null;
  is_active: boolean;
}

interface CurriculumRow {
  equipment: string[];
  review: string[];
}

/** Editable list of free text rows backed by a text[] column. */
const StringListEditor = ({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) => {
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 space-y-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input
              value={value}
              onChange={(e) => {
                const next = [...values];
                next[index] = e.target.value;
                onChange(next);
              }}
              className="h-9 text-sm"
            />
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(index, -1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(index, 1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
          <Plus className="mr-1 h-4 w-4" />
          Add row
        </Button>
      </div>
    </div>
  );
};

const clean = (values: string[]): string[] => values.map((v) => v.trim()).filter(Boolean);

const LevelEditor = ({ level }: { level: SwimLevel }) => {
  const { toast } = useToast();
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumRow>({ equipment: [], review: [] });
  const [loading, setLoading] = useState(true);
  const [savingCurriculum, setSavingCurriculum] = useState(false);
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);
  const [swappingId, setSwappingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [skillRes, curRes] = await Promise.all([
      supabase
        .from("skill_definitions")
        .select("id, swim_level, position, kind, name, success_goal, learning_activities, is_active")
        .eq("swim_level", level)
        .order("position", { ascending: true }),
      supabase.from("level_curriculum").select("equipment, review").eq("swim_level", level).maybeSingle(),
    ]);
    if (skillRes.error) toast({ title: "Could not load skills", description: skillRes.error.message, variant: "destructive" });
    setSkills((skillRes.data ?? []) as SkillRow[]);
    const cur = curRes.data as { equipment: string[] | null; review: string[] | null } | null;
    setCurriculum({ equipment: cur?.equipment ?? [], review: cur?.review ?? [] });
    setLoading(false);
  }, [level, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchSkill = (id: string, patch: Partial<SkillRow>) =>
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const saveCurriculum = async () => {
    setSavingCurriculum(true);
    const { error } = await supabase.rpc("admin_update_level_curriculum", {
      p_swim_level: level,
      p_equipment: clean(curriculum.equipment),
      p_review: clean(curriculum.review),
    });
    setSavingCurriculum(false);
    if (error) {
      toast({ title: "Not saved", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Equipment and review saved" });
  };

  const saveSkill = async (skill: SkillRow) => {
    setSavingSkillId(skill.id);
    const { error } = await supabase.rpc("admin_update_skill", {
      p_skill_id: skill.id,
      p_name: skill.name.trim(),
      p_success_goal: skill.success_goal?.trim() ?? "",
      p_learning_activities: clean(skill.learning_activities ?? []),
      p_is_active: skill.is_active,
    });
    setSavingSkillId(null);
    if (error) {
      toast({ title: "Not saved", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Saved ${skill.name.trim()}` });
  };

  const swap = async (index: number, delta: number) => {
    const other = skills[index + delta];
    const current = skills[index];
    if (!other || !current) return;
    setSwappingId(current.id);
    const { error } = await supabase.rpc("admin_swap_skill_positions", {
      p_skill_a: current.id,
      p_skill_b: other.id,
    });
    setSwappingId(null);
    if (error) {
      toast({ title: "Order not changed", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LevelBadge level={level} size={40} />
            <h2 className="text-lg font-semibold">{LEVEL_GROUP_NAMES[level]} equipment and review</h2>
          </div>
          <Button size="sm" disabled={savingCurriculum} onClick={() => void saveCurriculum()}>
            {savingCurriculum && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save equipment and review
          </Button>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <StringListEditor
            label="Equipment"
            values={curriculum.equipment}
            onChange={(equipment) => setCurriculum((prev) => ({ ...prev, equipment }))}
          />
          <StringListEditor
            label="Review"
            values={curriculum.review}
            onChange={(review) => setCurriculum((prev) => ({ ...prev, review }))}
          />
        </div>
      </Card>

      {skills.map((skill, index) => (
        <Card key={skill.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {SKILL_KIND_LABELS[skill.kind]} · position {skill.position}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Kind and position are structural and not editable here.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Active</span>
              <Switch checked={skill.is_active} onCheckedChange={(v) => patchSkill(skill.id, { is_active: v })} />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={index === 0 || swappingId !== null}
                onClick={() => void swap(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={index === skills.length - 1 || swappingId !== null}
                onClick={() => void swap(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skill name</p>
              <Input
                value={skill.name}
                onChange={(e) => patchSkill(skill.id, { name: e.target.value })}
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Success goal</p>
              <Textarea
                value={skill.success_goal ?? ""}
                onChange={(e) => patchSkill(skill.id, { success_goal: e.target.value })}
                rows={3}
                className="mt-1 text-sm"
              />
            </div>
            <StringListEditor
              label="Learning activities"
              values={skill.learning_activities ?? []}
              onChange={(next) => patchSkill(skill.id, { learning_activities: next })}
            />
          </div>

          <div className="mt-3 flex justify-end">
            <Button size="sm" disabled={savingSkillId === skill.id} onClick={() => void saveSkill(skill)}>
              {savingSkillId === skill.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save skill
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};

const CurriculumAdmin = () => {
  const [level, setLevel] = useState<SwimLevel>("white");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Curriculum</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The five levels and the six skills in each level are fixed. Adding or removing skills would break the 3 of 6
          and 6 of 6 milestone thresholds and level advancement. Only wording and ordering are editable here.
        </p>
      </div>

      <Tabs value={level} onValueChange={(v) => setLevel(v as SwimLevel)}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {LEVEL_ORDER.map((lvl) => (
            <TabsTrigger key={lvl} value={lvl} className="gap-2">
              <LevelBadge level={lvl} size={20} />
              {LEVEL_GROUP_NAMES[lvl]}
            </TabsTrigger>
          ))}
        </TabsList>
        {LEVEL_ORDER.map((lvl) => (
          <TabsContent key={lvl} value={lvl} className="mt-4">
            {level === lvl && <LevelEditor level={lvl} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default CurriculumAdmin;
