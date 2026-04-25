import { useState, useEffect } from "react";
import { Star, Send, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";

const CATEGORIES = [
  { value: "bug",         label: "Bug Report",         emoji: "🐛", desc: "Something isn't working" },
  { value: "feature",     label: "Feature Request",     emoji: "✨", desc: "Suggest something new" },
  { value: "ui",          label: "UI / UX",             emoji: "🎨", desc: "Design or usability issue" },
  { value: "performance", label: "Performance",         emoji: "⚡", desc: "Speed or reliability issue" },
  { value: "general",     label: "General Feedback",    emoji: "💬", desc: "Anything else on your mind" },
];

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

type FeedbackRow = {
  id: string;
  category: string;
  rating: number;
  title: string;
  message: string;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Feedback() {
  const { user } = useUser();

  const [category, setCategory]   = useState("");
  const [rating, setRating]       = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle]         = useState("");
  const [message, setMessage]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [history, setHistory]     = useState<FeedbackRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const TRUNCATE_CHARS = 300;

  useEffect(() => {
    if (!user.id) return;
    const load = async () => {
      const { data } = await (supabase as any)
        .from("feedback")
        .select("id, category, rating, title, message, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setHistory(data || []);
      setLoadingHistory(false);
    };
    load();
  }, [user.id]);

  const canSubmit = category && rating > 0 && title.trim() && message.trim();

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any)
        .from("feedback")
        .insert({
          user_id:  user.id,
          category,
          rating,
          title:   title.trim(),
          message: message.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      setHistory(prev => [data, ...prev]);
      setSubmitted(true);

      // Reset form after a moment
      setTimeout(() => {
        setSubmitted(false);
        setCategory("");
        setRating(0);
        setTitle("");
        setMessage("");
      }, 3000);
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCat = CATEGORIES.find(c => c.value === category);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">Share Feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">Help us make Prolifier better for everyone.</p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mb-4" />
              <h2 className="text-xl font-bold mb-1">Thanks for your feedback!</h2>
              <p className="text-sm text-muted-foreground">We read every submission and use it to improve Prolifier.</p>
            </div>
          ) : (
            <div>
              <div className="rounded-xl border border-border bg-card p-6 space-y-6">

                {/* Category */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-3">
                    What's your feedback about? <span className="text-destructive">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => setCategory(cat.value)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          category === cat.value
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border hover:border-primary/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="text-xl shrink-0">{cat.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight">{cat.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{cat.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Star rating */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    Overall experience <span className="text-destructive">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(n)}
                        className="p-1 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`h-7 w-7 transition-colors ${
                            n <= (hoverRating || rating)
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      </button>
                    ))}
                    {(hoverRating || rating) > 0 && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        {RATING_LABELS[hoverRating || rating]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Short title <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={
                      selectedCat?.value === "bug"         ? "e.g. Profile picture doesn't save" :
                      selectedCat?.value === "feature"     ? "e.g. Add dark mode for mobile" :
                      selectedCat?.value === "ui"          ? "e.g. Buttons are hard to tap on mobile" :
                      selectedCat?.value === "performance" ? "e.g. Feed loads slowly on first open" :
                      "Give your feedback a brief title…"
                    }
                    className="h-11"
                    maxLength={100}
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Tell us more <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={
                      selectedCat?.value === "bug"     ? "Steps to reproduce, what you expected vs what happened…" :
                      selectedCat?.value === "feature" ? "Describe the feature and why it would be useful…" :
                      "Share as much detail as you'd like…"
                    }
                    rows={5}
                    maxLength={2000}
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1">{message.length}/2000</p>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="w-full h-11 font-semibold gap-2"
                >
                  {submitting
                    ? <><div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> Submitting…</>
                    : <><Send className="h-4 w-4" /> Submit Feedback</>}
                </Button>
              </div>
            </div>
          )}

        {/* Past submissions */}
        {!loadingHistory && history.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              Your past submissions ({history.length})
            </button>

            {showHistory && (
                <div className="overflow-hidden animate-in fade-in duration-200">
                  <div className="mt-3 space-y-3">
                    {history.map(fb => {
                      const cat = CATEGORIES.find(c => c.value === fb.category);
                      return (
                        <div key={fb.id} className="rounded-xl border border-border bg-card p-4">
                          <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{cat?.emoji ?? "💬"}</span>
                              <span className="text-sm font-semibold text-foreground">{fb.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {[1,2,3,4,5].map(n => (
                                <Star key={n} className={`h-3.5 w-3.5 ${n <= fb.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{cat?.label} · {timeAgo(fb.created_at)}</p>
                          {(() => {
                            const expanded = expandedIds.has(fb.id);
                            const long = fb.message.length > TRUNCATE_CHARS;
                            return (
                              <>
                                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                                  {long && !expanded ? fb.message.slice(0, TRUNCATE_CHARS) + "…" : fb.message}
                                </p>
                                {long && (
                                  <button
                                    onClick={() => toggleExpand(fb.id)}
                                    className="mt-1.5 text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
                                  >
                                    {expanded ? "Show less" : "Read more"}
                                    <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
