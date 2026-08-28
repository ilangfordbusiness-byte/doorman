import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

// Top-right "go home" control; mirrors the header back-button style used across
// the app (ghost icon button, rounded-full). Navigates to the home screen.
export default function HomeButton({ className = "" }) {
  return (
    <Link to="/" aria-label="Home">
      <Button variant="ghost" size="icon" className={`rounded-full ${className}`}>
        <Home className="w-5 h-5" />
      </Button>
    </Link>
  );
}
