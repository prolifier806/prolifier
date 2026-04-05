import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

export default function AccountRecovery() {
  const { user, recoverAccount, signOut } = useUser();
  const navigate = useNavigate();
  const [recovering, setRecovering] = useState(false);

  const deletedAt = user.deletedAt ? new Date(user.deletedAt) : null;
  const daysRemaining = deletedAt
    ? Math.max(0, 7 - Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24)))
    : 7;

  const handleRecover = async () => {
    setRecovering(true);
    try {
      await recoverAccount();
      toast({ title: "Account recovered!", description: "Welcome back." });
      navigate("/feed");
    } finally {
      setRecovering(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Account scheduled for deletion</h1>
          <p className="text-sm text-muted-foreground">
            Your account will be permanently deleted in{" "}
            <span className="font-semibold text-foreground">{daysRemaining} day{daysRemaining !== 1 ? "s" : ""}</span>.
            You can recover it before then.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 text-left space-y-2">
          <p className="text-xs text-muted-foreground">
            Once permanently deleted, your profile, posts, collabs, and all data will be gone and cannot be recovered.
          </p>
        </div>

        <div className="space-y-3">
          <Button className="w-full h-11 font-semibold" onClick={handleRecover} disabled={recovering}>
            {recovering ? "Recovering…" : "Recover my account"}
          </Button>
          <button
            onClick={handleSignOut}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
