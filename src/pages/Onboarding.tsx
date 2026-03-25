import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Leaf, Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import onboarding1 from "@/assets/onboarding-1.png";
import onboarding2 from "@/assets/onboarding-2.png";
import onboarding3 from "@/assets/onboarding-3.png";

const slides = [
  { title: "Find your people", description: "Connect with founders, builders, and creators who are actively making things happen.", image: onboarding1 },
  { title: "Discover the right match", description: "Browse by skills, goals, and availability to find the perfect collaborator for your project.", image: onboarding2 },
  { title: "Build in public", description: "Share your journey, get feedback, and grow with a supportive community of makers.", image: onboarding3 },
];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function Onboarding() {
  const [current, setCurrent] = useState(0);
  const [loading, setLoading]   = useState(false);
  const { theme, toggleTheme }  = useTheme();

  // Show message if the user's account was permanently deleted after the 7-day window
  useEffect(() => {
    if (localStorage.getItem("prolifier_perm_deleted") === "true") {
      localStorage.removeItem("prolifier_perm_deleted");
      toast({
        title: "Account permanently deleted",
        description: "Your account no longer exists. You can sign up with Google to create a new one.",
        variant: "destructive",
      });
    }
  }, []);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // After OAuth, SetupRoute sends new users to /setup and returning users to /feed
          redirectTo: `${window.location.origin}/setup`,
        },
      });
      if (error) throw error;
      // Page redirects — loading stays true until navigation
    } catch {
      toast({ title: "Google sign in failed. Please try again.", variant: "destructive" });
      setLoading(false);
    }
  };

  const isLastSlide = current === slides.length - 1;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 relative">
      <button onClick={toggleTheme}
        className="absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div key={current} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.35 }}
            className="flex flex-col items-center text-center">
            <img src={slides[current].image} alt={slides[current].title}
              className="w-72 h-52 object-contain mb-8 rounded-xl" />
            <h1 className="font-display text-3xl font-bold mb-3 text-foreground">{slides[current].title}</h1>
            <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-xs">{slides[current].description}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-center gap-2 mb-8">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition-all duration-300 ${i === current ? "w-8 bg-primary" : "w-2 bg-border"}`} />
          ))}
        </div>

        {!isLastSlide ? (
          <>
            <Button onClick={() => setCurrent(c => c + 1)} className="w-full h-12 text-base font-semibold rounded-xl">
              Next
            </Button>
            <button onClick={() => setCurrent(slides.length - 1)}
              className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Skip
            </button>
          </>
        ) : (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-5">
              <div className="flex flex-col items-center">
                <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center mb-3">
                  <Leaf className="h-6 w-6 text-primary-foreground" />
                </div>
                <h2 className="font-display text-xl font-bold text-foreground">Join Prolifier</h2>
                <p className="text-sm text-muted-foreground mt-1">Sign in to start building</p>
              </div>

              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full h-12 flex items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                <GoogleIcon />
                {loading ? "Redirecting…" : "Continue with Google"}
              </button>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
