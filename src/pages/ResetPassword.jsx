import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// Landing page for the password-reset email link. The link signs the user in
// with a recovery session and redirects here; registered outside Layout /
// PhoneSetupGate so even a half-onboarded user can reset.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.auth.updatePassword(password);
      toast({ title: "Password updated" });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Could not update password");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="DoorMan" className="w-14 h-14 mx-auto mb-6 object-contain" />
        <h1 className="text-xl font-extrabold mb-1">Set a new password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Choose a new password for your account.
        </p>
        <form className="space-y-3 text-left" onSubmit={handleSubmit}>
          <Input
            className="h-12 rounded-xl bg-secondary/50 border-border"
            type="password" placeholder="New password (min 6 characters)"
            autoComplete="new-password" minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)} required
          />
          <Input
            className="h-12 rounded-xl bg-secondary/50 border-border"
            type="password" placeholder="Confirm new password"
            autoComplete="new-password" minLength={6}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required
          />
          <Button disabled={busy} className="w-full h-12 rounded-xl font-semibold">
            Update password
          </Button>
        </form>
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
