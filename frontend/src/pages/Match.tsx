import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, ChevronLeft, ChevronRight,
  X, Check, Send, Shuffle, Settings2,
} from "lucide-react";
import Layout from "@/components/Layout";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/context/UserContext";
import { toast } from "@/hooks/use-toast";

/*
  ══════════════════════════════════════════════════════════════════
  SQL — run once in Supabase SQL editor:

  CREATE TABLE IF NOT EXISTS match_profiles (
    id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    skills_have     text[] NOT NULL DEFAULT '{}',
    skills_need     text[] NOT NULL DEFAULT '{}',
    commitment      text,
    experience_level text,
    idea_status     text,
    location_pref   text,
    startup_stage   text,
    equity_pref     text,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
  );

  ALTER TABLE match_profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "mp_select" ON match_profiles FOR SELECT USING (true);
  CREATE POLICY "mp_insert" ON match_profiles FOR INSERT WITH CHECK (auth.uid() = id);
  CREATE POLICY "mp_update" ON match_profiles FOR UPDATE USING (auth.uid() = id);
  CREATE POLICY "mp_delete" ON match_profiles FOR DELETE USING (auth.uid() = id);

  Also run this to refresh the schema cache:
  NOTIFY pgrst, 'reload schema';
  ══════════════════════════════════════════════════════════════════
*/

// ── Skill categories ──────────────────────────────────────────────────────────
const SKILL_CATS: Record<string, string[]> = {
  Engineering:  ["Frontend", "Backend", "Full Stack", "Mobile", "AI/ML", "Data/Analytics", "DevOps/Cloud", "Blockchain", "Cybersecurity", "Embedded/IoT"],
  Design:       ["UI/UX", "Graphic Design", "Branding", "Motion/Animation", "3D/AR/VR", "Illustration", "Video Editing", "Photography"],
  Product:      ["Product Management", "Strategy", "User Research", "Agile/Scrum", "Business Analysis"],
  Business:     ["Marketing", "Sales", "Growth Hacking", "Operations", "Finance/Accounting", "Legal/Compliance", "Fundraising"],
  Content:      ["Content Writing", "Copywriting", "Social Media", "SEO/SEM", "Community Building", "Video Production", "Podcasting"],
  Creative:     ["Music Production", "Game Design", "AR/VR Development", "No-Code/Low-Code"],
};

// ── Option lists ──────────────────────────────────────────────────────────────
const COMMITMENT     = ["Exploring", "Part-time", "Full-time"] as const;
const EXPERIENCE     = ["Beginner", "Intermediate", "Experienced"] as const;
const IDEA_STATUS    = ["I have an idea", "Exploring ideas", "No idea yet"] as const;
const LOC_PREF       = ["Same country", "Nearby timezone", "Open to anywhere"] as const;
const STARTUP_STAGES = ["Idea", "MVP", "Traction", "Scaling", "Not started"] as const;
const EQUITY_PREFS   = ["Open to discuss", "Equal split", "Flexible"] as const;

const FORM_STEPS = [
  { title: "What are you building?",   sub: "Tell potential co-founders what you're working on",        optional: false },
  { title: "Skills you HAVE",          sub: "Select up to 8 — what you bring to the table",             optional: false },
  { title: "Skills you NEED",          sub: "Select up to 8 — what you're looking for in a co-founder", optional: false },
  { title: "Commitment level",         sub: "How much time can you dedicate?",                           optional: false },
  { title: "Experience level",         sub: "How experienced are you overall?",                          optional: false },
  { title: "Idea status",              sub: "Where are you in the idea phase?",                          optional: false },
  { title: "Location preference",      sub: "Who do you want to collaborate with?",                      optional: false },
  { title: "Startup stage",            sub: "What stage is your project at?",                            optional: true  },
  { title: "Equity preference",        sub: "What's your equity approach?",                              optional: true  },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface MatchData {
  skills_have:      string[];
  skills_need:      string[];
  commitment:       string;
  experience_level: string;
  idea_status:      string;
  location_pref:    string;
  startup_stage?:   string;
  equity_pref?:     string;
}

interface MatchProfile extends MatchData {
  id:        string;
  name:      string;
  username?: string;
  avatar:    string;
  avatarUrl?: string;
  color:     string;
  location?: string;
  bio?:      string;
  project?:  string;
}

// ── Match scoring (deterministic — random only for final tiebreak) ────────────
function skillMatchCount(me: MatchData, other: MatchProfile): number {
  return me.skills_need.filter(s => other.skills_have.includes(s)).length
       + other.skills_need.filter(s => me.skills_have.includes(s)).length;
}

function computeScore(me: MatchData, other: MatchProfile): number {
  let sc = skillMatchCount(me, other) * 1000; // primary: skill matches (dominant weight)
  if (me.commitment && me.commitment === other.commitment) sc += 30;
  if (me.experience_level && me.experience_level === other.experience_level) sc += 20;
  if (me.location_pref === "Open to anywhere" || other.location_pref === "Open to anywhere") sc += 10;
  sc += Math.random() * 4; // tiebreaker only — can never overcome even 1 skill match difference
  return sc;
}

// ── Daily intro limit ─────────────────────────────────────────────────────────
const INTRO_KEY   = "prolifier_intros";
const INTRO_LIMIT = 10;

function getIntroCount(): number {
  try {
    const raw = localStorage.getItem(INTRO_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    if (date !== new Date().toISOString().slice(0, 10)) return 0;
    return count as number;
  } catch { return 0; }
}

function bumpIntroCount() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(INTRO_KEY, JSON.stringify({ date: today, count: getIntroCount() + 1 }));
  } catch {}
}

// ── Utility ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Match() {
  const { user } = useUser();
  const navigate  = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [myData,  setMyData]    = useState<MatchData | null>(null);
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [mode,    setMode]      = useState<"match" | "search">("match");

  // Match pool
  const [pool,       setPool]       = useState<MatchProfile[]>([]);
  const [ranked,     setRanked]     = useState<MatchProfile[]>([]);
  const [idx,        setIdx]        = useState(0);
  const [seenIds,    setSeenIds]    = useState<Set<string>>(new Set());

  // Intro modal
  const [introTarget, setIntroTarget] = useState<MatchProfile | null>(null);
  const [introText,   setIntroText]   = useState("");

  // Search
  const [searchQuery,   setSearchQuery]   = useState("");
  const [allUsers,      setAllUsers]      = useState<MatchProfile[]>([]);
  const [searchResults, setSearchResults] = useState<MatchProfile[]>([]);

  // Onboarding form
  const [formStep,       setFormStep]       = useState(0);
  const [formBuilding,   setFormBuilding]   = useState("");
  const [formHave,       setFormHave]       = useState<string[]>([]);
  const [formNeed,       setFormNeed]       = useState<string[]>([]);
  const [formCommitment, setFormCommitment] = useState("");
  const [formExperience, setFormExperience] = useState("");
  const [formIdea,       setFormIdea]       = useState("");
  const [formLocPref,    setFormLocPref]    = useState("");
  const [formStage,      setFormStage]      = useState("");
  const [formEquity,     setFormEquity]     = useState("");
  const [saving,         setSaving]         = useState(false);

  // ── Boot: load my match profile ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("match_profiles").select("*").eq("id", user.id).single();
      if (data) {
        setMyData(data as MatchData);
        await loadPool(data as MatchData);
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Pre-fill form when editing existing prefs ──────────────────────────────
  const openEditPrefs = () => {
    if (!myData) return;
    setFormBuilding("");         // building is not stored in match_profiles, just reset
    setFormHave(myData.skills_have);
    setFormNeed(myData.skills_need);
    setFormCommitment(myData.commitment || "");
    setFormExperience(myData.experience_level || "");
    setFormIdea(myData.idea_status || "");
    setFormLocPref(myData.location_pref || "");
    setFormStage(myData.startup_stage || "");
    setFormEquity(myData.equity_pref || "");
    setFormStep(1); // skip "what are you building" — start from skills
    setEditingPrefs(true);
  };

  // ── Load match pool + search users ────────────────────────────────────────
  const loadPool = async (me: MatchData) => {
    if (!user) return;

    const [poolRes, usersRes] = await Promise.all([
      (supabase as any)
        .from("match_profiles")
        .select(`id, skills_have, skills_need, commitment, experience_level,
                 idea_status, location_pref, startup_stage, equity_pref,
                 profiles!inner(name, username, avatar, color, avatar_url, location, bio, project)`)
        .neq("id", user.id),
      (supabase as any)
        .from("profiles")
        .select("id, name, username, avatar, color, avatar_url, location, bio, project")
        .neq("id", user.id)
        .eq("profile_complete", true)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const poolProfiles: MatchProfile[] = (poolRes.data || []).map((row: any) => ({
      id:              row.id,
      name:            row.profiles?.name || "User",
      username:        row.profiles?.username || undefined,
      avatar:          row.profiles?.avatar  || "",
      avatarUrl:       row.profiles?.avatar_url || undefined,
      color:           row.profiles?.color   || "bg-primary",
      location:        row.profiles?.location || undefined,
      bio:             row.profiles?.bio      || undefined,
      project:         row.profiles?.project  || undefined,
      skills_have:     row.skills_have     || [],
      skills_need:     row.skills_need     || [],
      commitment:      row.commitment      || "",
      experience_level: row.experience_level || "",
      idea_status:     row.idea_status     || "",
      location_pref:   row.location_pref   || "",
      startup_stage:   row.startup_stage   || undefined,
      equity_pref:     row.equity_pref     || undefined,
    }));

    setPool(poolProfiles);
    doRank(me, poolProfiles);

    const searchUsers: MatchProfile[] = (usersRes.data || []).map((p: any) => ({
      id: p.id, name: p.name || "User", username: p.username || undefined,
      avatar: p.avatar || "", avatarUrl: p.avatar_url || undefined,
      color: p.color || "bg-primary", location: p.location || undefined,
      bio: p.bio || undefined, project: p.project || undefined,
      skills_have: [], skills_need: [], commitment: "",
      experience_level: "", idea_status: "", location_pref: "",
    }));
    setAllUsers(searchUsers);
    setSearchResults(searchUsers.slice(0, 30));
  };

  // ── Rank: deterministic by skill score, tiny random tiebreak ─────────────
  const doRank = useCallback((me: MatchData, profiles: MatchProfile[]) => {
    const sorted = [...profiles].sort((a, b) => computeScore(me, b) - computeScore(me, a));
    setRanked(sorted);
    setIdx(0);
  }, []);

  // ── Search filter ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(allUsers.slice(0, 30));
      return;
    }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      allUsers.filter(u =>
        u.name.toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.bio || "").toLowerCase().includes(q)
      ).slice(0, 50)
    );
  }, [searchQuery, allUsers]);

  // ── Save onboarding / edit form ────────────────────────────────────────────
  const saveForm = async () => {
    if (!user) return;
    setSaving(true);
    const payload: MatchData = {
      skills_have:      formHave,
      skills_need:      formNeed,
      commitment:       formCommitment,
      experience_level: formExperience,
      idea_status:      formIdea,
      location_pref:    formLocPref,
      startup_stage:    formStage  || undefined,
      equity_pref:      formEquity || undefined,
    };
    const { error } = await (supabase as any)
      .from("match_profiles")
      .upsert({ id: user.id, ...payload, updated_at: new Date().toISOString() });
    if (error) {
      toast({ title: "Something went wrong. Try again.", variant: "destructive" });
      setSaving(false);
      return;
    }
    setMyData(payload);
    setEditingPrefs(false);
    await loadPool(payload);
    setSaving(false);
  };

  // ── Skip action ────────────────────────────────────────────────────────────
  const handleSkip = () => {
    const cur = ranked[idx];
    if (cur) setSeenIds(prev => new Set([...prev, cur.id]));
    setIdx(i => i + 1);
  };

  // ── Send Intro action ──────────────────────────────────────────────────────
  const openIntro = (profile: MatchProfile) => {
    if (getIntroCount() >= INTRO_LIMIT) {
      toast({ title: "Daily limit reached", description: `You can send up to ${INTRO_LIMIT} intros per day.`, variant: "destructive" });
      return;
    }
    setIntroTarget(profile);
    setIntroText("Hey, I found your profile via Match and I'm interested in collaborating.");
  };

  const confirmIntro = () => {
    if (!introTarget) return;
    bumpIntroCount();
    const cur = ranked[idx];
    if (cur?.id === introTarget.id) {
      setSeenIds(prev => new Set([...prev, cur.id]));
      setIdx(i => i + 1);
    }
    navigate(`/messages?with=${introTarget.id}&msg=${encodeURIComponent(introText)}`);
    setIntroTarget(null);
  };

  // ── Form step validation ───────────────────────────────────────────────────
  function canAdvance(step: number): boolean {
    switch (step) {
      case 0: return formBuilding.trim().length > 0;
      case 1: return formHave.length > 0;
      case 2: return formNeed.length > 0;
      case 3: return !!formCommitment;
      case 4: return !!formExperience;
      case 5: return !!formIdea;
      case 6: return !!formLocPref;
      default: return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUB-COMPONENTS
  // ═══════════════════════════════════════════════════════════════════════════

  const Avatar = ({ p, size = 10 }: { p: MatchProfile; size?: number }) => (
    <div className={`h-${size} w-${size} rounded-full ${p.color} flex items-center justify-center text-white font-semibold shrink-0 overflow-hidden`}
         style={{ fontSize: size < 10 ? 12 : 14 }}>
      {p.avatarUrl
        ? <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
        : <span>{initials(p.name)}</span>}
    </div>
  );

  const InfoPill = ({ label }: { label: string }) => (
    <span className="text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-secondary-foreground">
      {label}
    </span>
  );

  // ── Skill picker ───────────────────────────────────────────────────────────
  const SkillPicker = ({ selected, onChange, max }: {
    selected: string[]; onChange: (v: string[]) => void; max: number;
  }) => (
    <div className="space-y-4">
      {Object.entries(SKILL_CATS).map(([cat, skills]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</p>
          <div className="flex flex-wrap gap-2">
            {skills.map(s => {
              const sel   = selected.includes(s);
              const maxed = !sel && selected.length >= max;
              return (
                <button key={s} disabled={maxed}
                  onClick={() => onChange(sel ? selected.filter(x => x !== s) : [...selected, s])}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    sel   ? "bg-primary text-primary-foreground border-primary" :
                    maxed ? "opacity-30 bg-muted border-border text-muted-foreground cursor-not-allowed" :
                            "bg-card border-border text-foreground hover:bg-muted"
                  }`}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{selected.length}/{max} selected</p>
    </div>
  );

  // ── Radio group ────────────────────────────────────────────────────────────
  const RadioGroup = ({ options, value, onChange }: {
    options: readonly string[]; value: string; onChange: (v: string) => void;
  }) => (
    <div className="flex flex-col gap-2">
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(value === opt ? "" : opt)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${
            value === opt
              ? "bg-primary/10 border-primary text-primary"
              : "bg-card border-border text-foreground hover:bg-muted"
          }`}>
          <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${value === opt ? "border-primary" : "border-muted-foreground/40"}`}>
            {value === opt && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          {opt}
        </button>
      ))}
    </div>
  );

  // ── Big match card ─────────────────────────────────────────────────────────
  const MatchCard = ({ p }: { p: MatchProfile }) => {
    const n2h = myData ? myData.skills_need.filter(s => p.skills_have.includes(s)).length : 0;
    const h2n = myData ? p.skills_need.filter(s => myData.skills_have.includes(s)).length : 0;
    const matchCount = n2h + h2n;

    return (
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 pb-3 flex items-center gap-3">
          <Avatar p={p} size={12} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground leading-tight truncate">{p.name}</p>
            {p.location && <p className="text-xs text-muted-foreground mt-0.5">{p.location}</p>}
          </div>
          {matchCount > 0 && (
            <div className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {matchCount} skill match{matchCount > 1 ? "es" : ""}
              </span>
            </div>
          )}
        </div>

        <div className="px-4 pb-4 space-y-3">
          {p.project && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Building</p>
              <p className="text-sm text-foreground leading-relaxed">{p.project}</p>
            </div>
          )}
          {p.bio && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">About</p>
              <p className="text-sm text-foreground leading-relaxed">{p.bio}</p>
            </div>
          )}
          {p.skills_have.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Has skills</p>
              <div className="flex flex-wrap gap-1.5">
                {p.skills_have.map(s => (
                  <span key={s} className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                    myData?.skills_need.includes(s)
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-primary/8 border-primary/20 text-primary"
                  }`}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {p.skills_need.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Needs skills</p>
              <div className="flex flex-wrap gap-1.5">
                {p.skills_need.map(s => (
                  <span key={s} className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                    myData?.skills_have.includes(s)
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
                      : "bg-muted border-border text-muted-foreground"
                  }`}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {(p.commitment || p.experience_level || p.idea_status || p.startup_stage || p.equity_pref) && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {p.commitment       && <InfoPill label={p.commitment} />}
              {p.experience_level && <InfoPill label={p.experience_level} />}
              {p.idea_status      && <InfoPill label={p.idea_status} />}
              {p.startup_stage    && <InfoPill label={p.startup_stage} />}
              {p.equity_pref      && <InfoPill label={`Equity: ${p.equity_pref}`} />}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Compact search card ────────────────────────────────────────────────────
  const SearchCard = ({ p }: { p: MatchProfile }) => (
    <button onClick={() => navigate(`/profile/${p.id}`)}
      className="bg-card border border-border rounded-xl p-3 text-left hover:border-primary/30 hover:bg-muted/40 transition-colors w-full">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Avatar p={p} size={9} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
          {p.username && <p className="text-xs text-muted-foreground">@{p.username}</p>}
        </div>
      </div>
      {p.location && <p className="text-xs text-muted-foreground mb-1">{p.location}</p>}
      {p.bio && <p className="text-xs text-foreground/70 line-clamp-2">{p.bio}</p>}
    </button>
  );

  // ── Onboarding step content ────────────────────────────────────────────────
  const renderFormStep = () => {
    switch (formStep) {
      case 0: return (
        <textarea value={formBuilding} onChange={e => setFormBuilding(e.target.value)}
          placeholder="e.g. An AI tool for indie developers to manage side projects…"
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none" />
      );
      case 1: return <SkillPicker selected={formHave} onChange={setFormHave} max={8} />;
      case 2: return <SkillPicker selected={formNeed} onChange={setFormNeed} max={8} />;
      case 3: return <RadioGroup options={COMMITMENT}     value={formCommitment} onChange={setFormCommitment} />;
      case 4: return <RadioGroup options={EXPERIENCE}     value={formExperience} onChange={setFormExperience} />;
      case 5: return <RadioGroup options={IDEA_STATUS}    value={formIdea}       onChange={setFormIdea} />;
      case 6: return <RadioGroup options={LOC_PREF}       value={formLocPref}    onChange={setFormLocPref} />;
      case 7: return <RadioGroup options={STARTUP_STAGES} value={formStage}      onChange={setFormStage} />;
      case 8: return <RadioGroup options={EQUITY_PREFS}   value={formEquity}     onChange={setFormEquity} />;
      default: return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  // ── ONBOARDING / EDIT FORM ─────────────────────────────────────────────────
  if (!myData || editingPrefs) {
    const isLast = formStep === FORM_STEPS.length - 1;
    const step   = FORM_STEPS[formStep];
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="mb-5">
            {editingPrefs ? (
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setEditingPrefs(false)} className="text-muted-foreground hover:text-foreground">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h1 className="text-xl font-bold text-foreground">Edit Preferences</h1>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🤝</span>
                <h1 className="text-xl font-bold text-foreground">Find your co-founder</h1>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Answer a few questions to get matched with the right people.</p>
          </div>

          {/* Progress */}
          <div className="flex gap-1 mb-6">
            {FORM_STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= formStep ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>

          <h2 className="text-base font-semibold text-foreground mb-0.5">
            {step.title}
            {step.optional && <span className="text-xs font-normal text-muted-foreground ml-2">(optional)</span>}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{step.sub}</p>
          <div className="mb-6">{renderFormStep()}</div>

          {/* Nav */}
          <div className="flex gap-3">
            {formStep > 0 && (
              <button onClick={() => setFormStep(s => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
            <button
              disabled={saving || (!step.optional && !canAdvance(formStep))}
              onClick={isLast ? saveForm : () => setFormStep(s => s + 1)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {saving
                ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : isLast
                  ? <><Check className="h-4 w-4" /> {editingPrefs ? "Save Preferences" : "Finish"}</>
                  : <>{step.optional && !canAdvance(formStep) ? "Skip" : "Next"} <ChevronRight className="h-4 w-4" /></>
              }
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // ── MAIN UI ────────────────────────────────────────────────────────────────
  const currentProfile = ranked[idx] ?? null;
  const exhausted      = idx >= ranked.length && ranked.length > 0;
  const noProfiles     = pool.length === 0;
  const introsLeft     = INTRO_LIMIT - getIntroCount();

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤝</span>
            <h1 className="text-lg font-bold text-foreground">Match</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openEditPrefs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Settings2 className="h-3.5 w-3.5" /> Edit Preferences
            </button>
            <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
              <button onClick={() => setMode("match")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "match" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                Match
              </button>
              <button onClick={() => { setMode("search"); setSearchQuery(""); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "search" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Search className="h-3.5 w-3.5" /> Search
              </button>
            </div>
          </div>
        </div>

        {/* ── MATCH MODE ──────────────────────────────────────────────────────── */}
        {mode === "match" && (
          <>
            {/* No profiles yet */}
            {noProfiles && (
              <div className="text-center py-20">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="font-semibold text-foreground mb-1">No profiles yet</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  You'll be matched when more people complete their Match profile.
                </p>
              </div>
            )}

            {/* Exhausted all profiles */}
            {!noProfiles && exhausted && (
              <div className="text-center py-20">
                <div className="text-4xl mb-3">🎉</div>
                <p className="font-semibold text-foreground mb-1">You've seen all profiles</p>
                <p className="text-sm text-muted-foreground mb-5">Check back later for new matches.</p>
                <button
                  onClick={() => {
                    if (myData) doRank(myData, pool);
                    setSeenIds(new Set());
                  }}
                  className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Shuffle className="h-4 w-4" /> See again
                </button>
              </div>
            )}

            {/* Current card */}
            {!noProfiles && !exhausted && currentProfile && (
              <>
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {idx + 1} of {ranked.length}
                </p>

                <MatchCard p={currentProfile} />

                <div className="flex gap-3 mt-4">
                  <button onClick={handleSkip}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                    <X className="h-4 w-4" /> Skip
                  </button>
                  <button onClick={() => openIntro(currentProfile)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                    <Send className="h-4 w-4" /> Send Intro
                  </button>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-2">
                  {introsLeft} intro{introsLeft !== 1 ? "s" : ""} left today
                </p>
              </>
            )}
          </>
        )}

        {/* ── SEARCH MODE ─────────────────────────────────────────────────────── */}
        {mode === "search" && (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, username, or bio…"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {searchResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No users found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {searchResults.map(p => <SearchCard key={p.id} p={p} />)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Intro modal ─────────────────────────────────────────────────────── */}
      {introTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setIntroTarget(null)} />
          <div className="fixed inset-x-4 bottom-0 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-8 sm:w-full sm:max-w-md z-50
                          bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <Avatar p={introTarget} size={9} />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground">Send intro to {introTarget.name}</p>
                <p className="text-xs text-muted-foreground">{introsLeft} intro{introsLeft !== 1 ? "s" : ""} remaining today</p>
              </div>
              <button onClick={() => setIntroTarget(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea value={introText} onChange={e => setIntroText(e.target.value)} rows={3}
              className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground outline-none focus:border-primary resize-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setIntroTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button disabled={!introText.trim()} onClick={confirmIntro}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                <Send className="h-3.5 w-3.5" /> Send & Open Chat
              </button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
