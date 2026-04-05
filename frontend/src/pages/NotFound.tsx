import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Leaf } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center mb-6">
        <Leaf className="h-6 w-6 text-primary-foreground" />
      </div>
      <h1 className="text-6xl font-bold text-foreground mb-3">404</h1>
      <p className="text-lg text-muted-foreground mb-1">Page not found</p>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => navigate(-1)} variant="outline">Go back</Button>
        <Button onClick={() => navigate("/feed")}>Go to Feed</Button>
      </div>
    </div>
  );
}
