import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { toast } from "@/hooks/use-toast";
import { SKILL_CATEGORIES, ROLE_OPTIONS, MAX_ROLES } from "@/lib/skills";

const TOTAL_STEPS = 3;

export default function ProfileSetup() {
  const [step, setStep]     = useState(0);
  const navigate            = useNavigate();
  const { updateUser, completeProfileSetup } = useUser();

  const [name, setName]         = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio]           = useState("");
  const [building, setBuilding] = useState("");
  const [roles, setRoles]       = useState<string[]>([]);
  const [haveSkills, setHaveSkills] = useState<string[]>([]);
  const [wantSkills, setWantSkills] = useState<string[]>([]);
  const [available, setAvailable]   = useState(true);
  const [github, setGithub]         = useState("");
  const [website, setWebsite]       = useState("");
  const [twitter, setTwitter]       = useState("");
  const [finishing, setFinishing]   = useState(false);

  const toggleSkill = (skill: string, list: string[], setList: (s: string[]) => void) =>
    setList(list.includes(skill) ? list.filter(s => s !== skill) : [...list, skill]);

  const toggleRole = (role: string) => {
    if (roles.includes(role)) {
      setRoles(prev => prev.filter(r => r !== role));
    } else if (roles.length < MAX_ROLES) {
      setRoles(prev => [...prev, role]);
    }
  };

  const buildPayload = () => {
    const initials = name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return {
      name: name.trim(), avatar: initials,
      location: location.trim(), bio: bio.trim(), project: building.trim(),
      skills: haveSkills, lookingFor: wantSkills, roles,
      github: github.trim(), website: website.trim(), twitter: twitter.trim(),
      openToCollab: available,
    };
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await updateUser(buildPayload());
      await completeProfileSetup();
      navigate("/feed");
    } finally {
      setFinishing(false);
    }
  };

  const skipToFeed = async () => {
    setFinishing(true);
    try {
      if (name.trim()) await updateUser(buildPayload());
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
      toast({ title: "Please select at least one skill", variant: "destructive" }); return;
    }
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      await finish();
    }
  };

  const stepLabels = ["Basic info", "Skills", "Links"];

  const steps = [
    // ── Step 1: Basic info + Role ────────────────────────────
    <div className="space-y-5" key="s1">
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Full name <span className="text-destructive">*</span>
        </label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Builder" className="h-11" />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Location <span className="text-destructive">*</span>
        </label>
        <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco, CA" className="h-11" />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Bio <span className="text-destructive">*</span>
        </label>
        <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the community a bit about yourself..." rows={3} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-foreground">What are you working on?</label>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <Input value={building} onChange={e => setBuilding(e.target.value)} placeholder="A ceramics shop, a podcast, an app…" className="h-11" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">Your role</label>
          <span className="text-xs text-muted-foreground">Pick up to {MAX_ROLES} · Optional</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map(r => {
            const selected = roles.includes(r);
            const maxed = !selected && roles.length >= MAX_ROLES;
            return (
              <Badge key={r}
                variant={selected ? "default" : "outline"}
                className={`cursor-pointer transition-all ${maxed ? "opacity-40 cursor-not-allowed" : "hover:scale-105"}`}
                onClick={() => toggleRole(r)}
              >
                {r}{selected && <X className="h-3 w-3 ml-1" />}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>,

    // ── Step 2: Skills ───────────────────────────────────────
    <div className="space-y-7" key="s2">
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Skills I have</label>
        <p className="text-xs text-muted-foreground mb-3">Select your areas of expertise</p>
        <div className="flex flex-wrap gap-2">
          {SKILL_CATEGORIES.map(s => (
            <Badge key={s}
              variant={haveSkills.includes(s) ? "default" : "outline"}
              className="cursor-pointer transition-all hover:scale-105"
              onClick={() => toggleSkill(s, haveSkills, setHaveSkills)}
            >
              {s}{haveSkills.includes(s) && <X className="h-3 w-3 ml-1" />}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">Skills I'm looking for</label>
        <p className="text-xs text-muted-foreground mb-3">What kind of collaborator do you need?</p>
        <div className="flex flex-wrap gap-2">
          {SKILL_CATEGORIES.map(s => (
            <Badge key={s}
              variant={wantSkills.includes(s) ? "default" : "outline"}
              className="cursor-pointer transition-all hover:scale-105"
              onClick={() => toggleSkill(s, wantSkills, setWantSkills)}
            >
              {s}{wantSkills.includes(s) && <X className="h-3 w-3 ml-1" />}
            </Badge>
          ))}
        </div>
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
          <button onClick={skipToFeed} disabled={finishing}
            className="w-full mt-3 text-center text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
            Skip to feed
          </button>
        )}
      </div>
    </div>
  );
}
