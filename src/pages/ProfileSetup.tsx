import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { X, Plus } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { toast } from "@/hooks/use-toast";

const QUICK_SKILLS = [
  "AI/ML", "Development", "Design", "Marketing", "Writing",
  "Video", "Photography", "Community", "Product", "Research",
  "Music", "Coding", "Data Science", "UI/UX", "Coaching",
  "Content Creation", "DevOps", "Social Media",
];

const TOTAL_STEPS = 3;

export default function ProfileSetup() {
  const [step, setStep]                   = useState(0);
  const navigate = useNavigate();
  const { updateUser, completeProfileSetup } = useUser();
  const [name, setName]                   = useState("");
  const [location, setLocation]           = useState("");
  const [bio, setBio]                     = useState("");
  const [building, setBuilding]           = useState("");
  const [haveSkills, setHaveSkills]       = useState<string[]>([]);
  const [wantSkills, setWantSkills]       = useState<string[]>([]);
  const [available, setAvailable]         = useState(true);
  const [github, setGithub]               = useState("");
  const [website, setWebsite]             = useState("");
  const [twitter, setTwitter]             = useState("");
  const [customHaveSkill, setCustomHaveSkill] = useState("");
  const [customWantSkill, setCustomWantSkill] = useState("");
  const [finishing, setFinishing]         = useState(false);

  const toggleSkill = (skill: string, list: string[], setList: (s: string[]) => void) =>
    setList(list.includes(skill) ? list.filter(s => s !== skill) : [...list, skill]);

  const addCustomSkill = (val: string, list: string[], setList: (s: string[]) => void, setVal: (v: string) => void) => {
    const trimmed = val.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setList([...list, trimmed]);
    setVal("");
  };

  // Saves profile data + marks profile_complete = true, then navigates to feed
  const finish = async () => {
    setFinishing(true);
    try {
      const initials = name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      await updateUser({
        name: name.trim(),
        avatar: initials,
        location: location.trim(),
        bio: bio.trim(),
        project: building.trim(),
        skills: haveSkills,
        lookingFor: wantSkills,
        github: github.trim(),
        website: website.trim(),
        twitter: twitter.trim(),
        openToCollab: available,
      });
      // Mark profile setup as done — this is what gates the /setup redirect
      await completeProfileSetup();
      navigate("/feed");
    } finally {
      setFinishing(false);
    }
  };

  // Skip to feed — still marks profile_complete so user isn't re-routed to /setup on next login
  const skipToFeed = async () => {
    setFinishing(true);
    try {
      if (name.trim()) {
        const initials = name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        await updateUser({
          name: name.trim(),
          avatar: initials,
          location: location.trim(),
          bio: bio.trim(),
          project: building.trim(),
          skills: haveSkills,
          lookingFor: wantSkills,
          github: github.trim(),
          website: website.trim(),
          twitter: twitter.trim(),
          openToCollab: available,
        });
      }
      await completeProfileSetup();
      navigate("/feed");
    } finally {
      setFinishing(false);
    }
  };

  const next = async () => {
    if (step === 0) {
      if (!name.trim()) return;
      if (!location.trim()) { toast({ title: "Location is required", variant: "destructive" }); return; }
      if (!bio.trim()) { toast({ title: "Bio is required", variant: "destructive" }); return; }
    }
    if (step === 1 && haveSkills.length === 0) {
      toast({ title: "Please add at least one skill", variant: "destructive" }); return;
    }
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      await finish();
    }
  };

  const stepLabels = ["Basic info", "Skills", "Links"];

  const steps = [
    // ── Step 1: Basic info ───────────────────────────────────
    <div className="space-y-5" key="s1">
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Full name <span className="text-destructive">*</span>
        </label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Builder" className="h-11" />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Location <span className="text-destructive">*</span></label>
        <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco, CA" className="h-11" />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Bio <span className="text-destructive">*</span></label>
        <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the community a bit about yourself..." rows={3} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-foreground">What are you working on?</label>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <Input value={building} onChange={e => setBuilding(e.target.value)} placeholder="A ceramics shop, a podcast, an app…" className="h-11" />
      </div>
    </div>,

    // ── Step 2: Skills ───────────────────────────────────────
    <div className="space-y-7" key="s2">
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Skills I have</label>
        <p className="text-xs text-muted-foreground mb-3">Pick what applies — or add your own</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_SKILLS.map(s => (
            <Badge key={s} variant={haveSkills.includes(s) ? "default" : "outline"}
              className="cursor-pointer transition-all hover:scale-105"
              onClick={() => toggleSkill(s, haveSkills, setHaveSkills)}>
              {s}{haveSkills.includes(s) && <X className="h-3 w-3 ml-1" />}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={customHaveSkill} onChange={e => setCustomHaveSkill(e.target.value)}
            placeholder="Add a custom skill…" className="h-9 text-sm"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(customHaveSkill, haveSkills, setHaveSkills, setCustomHaveSkill); }}} />
          <Button type="button" size="sm" variant="outline" className="h-9 px-3 gap-1 shrink-0"
            onClick={() => addCustomSkill(customHaveSkill, haveSkills, setHaveSkills, setCustomHaveSkill)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {haveSkills.filter(s => !QUICK_SKILLS.includes(s)).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {haveSkills.filter(s => !QUICK_SKILLS.includes(s)).map(s => (
              <Badge key={s} variant="default" className="cursor-pointer text-xs"
                onClick={() => toggleSkill(s, haveSkills, setHaveSkills)}>
                {s} <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Skills I'm looking for</label>
        <p className="text-xs text-muted-foreground mb-3">What kind of collaborator do you need?</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_SKILLS.map(s => (
            <Badge key={s} variant={wantSkills.includes(s) ? "default" : "outline"}
              className="cursor-pointer transition-all hover:scale-105"
              onClick={() => toggleSkill(s, wantSkills, setWantSkills)}>
              {s}{wantSkills.includes(s) && <X className="h-3 w-3 ml-1" />}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={customWantSkill} onChange={e => setCustomWantSkill(e.target.value)}
            placeholder="Add a custom skill…" className="h-9 text-sm"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(customWantSkill, wantSkills, setWantSkills, setCustomWantSkill); }}} />
          <Button type="button" size="sm" variant="outline" className="h-9 px-3 gap-1 shrink-0"
            onClick={() => addCustomSkill(customWantSkill, wantSkills, setWantSkills, setCustomWantSkill)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {wantSkills.filter(s => !QUICK_SKILLS.includes(s)).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {wantSkills.filter(s => !QUICK_SKILLS.includes(s)).map(s => (
              <Badge key={s} variant="default" className="cursor-pointer text-xs"
                onClick={() => toggleSkill(s, wantSkills, setWantSkills)}>
                {s} <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>,

    // ── Step 3: Availability + social links ──────────────────
    <div className="space-y-5" key="s3">
      <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
        <div>
          <p className="font-medium text-foreground">Open to collaboration</p>
          <p className="text-sm text-muted-foreground">Let others know you're available to team up</p>
        </div>
        <Switch checked={available} onCheckedChange={setAvailable} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Social links</p>
          <span className="text-xs text-muted-foreground">All optional</span>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">GitHub</label>
          <Input value={github} onChange={e => setGithub(e.target.value)} placeholder="github.com/username" className="h-11" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Website</label>
          <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="yoursite.com" className="h-11" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Twitter / X</label>
          <Input value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="@handle" className="h-11" />
        </div>
      </div>
    </div>,
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-1">Set up your profile</h1>
        <p className="text-muted-foreground text-center text-sm mb-2">
          {stepLabels[step]} · Step {step + 1} of {TOTAL_STEPS}
        </p>

        <div className="h-1.5 bg-secondary rounded-full mb-8 overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 h-11" disabled={finishing}>
              Back
            </Button>
          )}
          <Button
            onClick={next}
            disabled={(step === 0 && (!name.trim() || !location.trim() || !bio.trim())) || (step === 1 && haveSkills.length === 0) || finishing}
            className="flex-1 h-11 font-semibold"
          >
            {finishing ? "Saving…" : step === TOTAL_STEPS - 1 ? "Complete setup" : "Continue"}
          </Button>
        </div>

        {step === 1 && (
          <button onClick={() => setStep(2)} className="w-full mt-3 text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
            Skip for now
          </button>
        )}
        {step === 2 && (
          <button
            onClick={skipToFeed}
            disabled={finishing}
            className="w-full mt-3 text-center text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Skip to feed
          </button>
        )}
      </div>
    </div>
  );
}
