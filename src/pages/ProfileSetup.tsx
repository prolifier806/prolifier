import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { X, Plus, Camera, MapPin } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { SKILL_CATEGORIES } from "@/lib/skills";
import { LOCATIONS } from "@/lib/locations";

const TOTAL_STEPS = 3;
const MAX_SKILLS = 3;

export default function ProfileSetup() {
  const [step, setStep]     = useState(0);
  const navigate            = useNavigate();
  const { user, updateUser, completeProfileSetup } = useUser();

  const [name, setName]         = useState(user.name || "");
  const [location, setLocation] = useState("");
  const [bio, setBio]           = useState("");
  const [building, setBuilding] = useState("");
  const [skills, setSkills]     = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [github, setGithub]     = useState("");
  const [website, setWebsite]   = useState("");
  const [twitter, setTwitter]   = useState("");
  const [finishing, setFinishing] = useState(false);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationDrop, setShowLocationDrop] = useState(false);

  const handleLocationInput = (val: string) => {
    setLocation(val);
    if (val.trim().length >= 1) {
      const lower = val.toLowerCase();
      const filtered = LOCATIONS.filter(l => l.toLowerCase().includes(lower)).slice(0, 8);
      setLocationSuggestions(filtered);
      setShowLocationDrop(filtered.length > 0);
    } else {
      setShowLocationDrop(false);
    }
  };

  const toggleSkill = (s: string) => {
    if (skills.includes(s)) {
      setSkills(prev => prev.filter(x => x !== s));
    } else if (skills.length < MAX_SKILLS) {
      setSkills(prev => [...prev, s]);
    }
  };

  const addCustomSkill = () => {
    const val = customSkillInput.trim();
    if (val && !skills.includes(val) && skills.length < MAX_SKILLS) {
      setSkills(prev => [...prev, val]);
    }
    setCustomSkillInput("");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await (supabase as any).storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploadingAvatar(false);
      return;
    }
    const { data } = (supabase as any).storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploadingAvatar(false);
  };

  const buildPayload = () => {
    const initials = name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return {
      name: name.trim(), avatar: initials,
      avatarUrl,
      location: location.trim(), bio: bio.trim(), project: building.trim(),
      skills, lookingFor: [], roles: [],
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
    if (step === 1 && skills.length === 0) {
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
    // ── Step 1: Basic info ────────────────────────────────────
    <div className="space-y-5" key="s1">
      <div className="flex flex-col items-center gap-2 mb-2">
        <div className="relative">
          <div className={`h-20 w-20 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold text-white shrink-0 ${!avatarUrl ? "bg-primary" : ""}`}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              : <span>{name ? name.trim().split(" ").map((w: string) => w[0]).join("").slice(0,2).toUpperCase() || "?" : "?"}</span>}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute bottom-0 right-0 h-7 w-7 bg-primary rounded-full flex items-center justify-center shadow-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5 text-white" />
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        <p className="text-xs text-muted-foreground">
          {uploadingAvatar ? "Uploading…" : avatarUrl ? "Tap to change photo" : "Add profile photo (optional)"}
        </p>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Full name <span className="text-destructive">*</span>
        </label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Builder" className="h-11" maxLength={50} />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Location <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={location}
            onChange={e => handleLocationInput(e.target.value)}
            onFocus={() => { if (locationSuggestions.length > 0) setShowLocationDrop(true); }}
            onBlur={() => setTimeout(() => setShowLocationDrop(false), 150)}
            placeholder="Select your country"
            className="h-11 pl-9"
          />
          {showLocationDrop && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {locationSuggestions.map(loc => (
                <button
                  key={loc}
                  type="button"
                  onMouseDown={() => { setLocation(loc); setShowLocationDrop(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-secondary transition-colors"
                >
                  {loc}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Bio <span className="text-destructive">*</span>
        </label>
        <Textarea value={bio}
          onChange={e => {
            const raw = e.target.value;
            const words = raw.trim() ? raw.trim().split(/\s+/) : [];
            setBio(words.length > 120 ? words.slice(0, 120).join(" ") : raw);
          }}
          placeholder="Tell the community a bit about yourself..." rows={3} />
        <p className="text-xs text-muted-foreground text-right mt-1">
          {bio.trim() ? bio.trim().split(/\s+/).length : 0}/120 words
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-foreground">What are you working on?</label>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <Input value={building} onChange={e => setBuilding(e.target.value)} placeholder="A ceramics shop, a podcast, an app…" className="h-11" maxLength={150} />
      </div>
    </div>,

    // ── Step 2: Skills (max 3) ────────────────────────────────
    <div className="space-y-4" key="s2">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-foreground">Skills & Expertise</label>
          <span className={`text-xs font-medium ${skills.length >= MAX_SKILLS ? "text-primary" : "text-muted-foreground"}`}>
            {skills.length}/{MAX_SKILLS} selected
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Pick up to {MAX_SKILLS} — these will show on your posts</p>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {SKILL_CATEGORIES.map(s => {
              const selected = skills.includes(s);
              const maxed = !selected && skills.length >= MAX_SKILLS;
              return (
                <Badge key={s}
                  variant={selected ? "default" : "outline"}
                  className={`cursor-pointer transition-all ${maxed ? "opacity-40 cursor-not-allowed" : "hover:scale-105"}`}
                  onClick={() => toggleSkill(s)}
                >
                  {s}{selected && <X className="h-3 w-3 ml-1" />}
                </Badge>
              );
            })}
            {skills.filter(s => !(SKILL_CATEGORIES as readonly string[]).includes(s)).map(s => (
              <Badge key={s} variant="default" className="cursor-pointer gap-1 transition-all hover:scale-105"
                onClick={() => setSkills(prev => prev.filter(x => x !== s))}>
                {s} <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
          {skills.length < MAX_SKILLS && (
            <div className="flex gap-2">
              <Input placeholder="Other skill…" value={customSkillInput}
                onChange={e => setCustomSkillInput(e.target.value)} className="h-9 text-sm"
                maxLength={20}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); } }} />
              <Button type="button" size="sm" variant="outline" className="h-9 px-3 shrink-0 gap-1" onClick={addCustomSkill}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          )}
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
          <div
            className="h-full bg-primary rounded-full transition-all duration-400"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {steps[step]}
          </div>

        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 h-11" disabled={finishing}>
              Back
            </Button>
          )}
          <Button
            onClick={next}
            disabled={(step === 0 && (!name.trim() || !location.trim() || !bio.trim())) || (step === 1 && skills.length === 0) || finishing}
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
