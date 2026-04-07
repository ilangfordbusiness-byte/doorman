import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Mic2, Users, ScanLine, UserCircle, ChevronRight, Sparkles, HeartHandshake } from "lucide-react";

const roles = [
  {
    to: "/host",
    icon: Mic2,
    label: "Host",
    sublabel: "Create & manage your events",
    gradient: "from-violet-600/20 to-violet-900/10",
    border: "border-violet-500/20 hover:border-violet-500/50",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/15",
  },
  {
    to: "/guest",
    icon: Users,
    label: "Guest",
    sublabel: "View your invites & passes",
    gradient: "from-amber-500/20 to-amber-900/10",
    border: "border-amber-500/20 hover:border-amber-500/50",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/15",
  },
  {
    to: "/staff",
    icon: ScanLine,
    label: "Doorman / Staff",
    sublabel: "Scan QR codes & check guests in",
    gradient: "from-emerald-600/20 to-emerald-900/10",
    border: "border-emerald-500/20 hover:border-emerald-500/50",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/15",
  },
  {
    to: "/friends",
    icon: HeartHandshake,
    label: "Friends",
    sublabel: "Suggestions, requests & connections",
    gradient: "from-pink-600/20 to-pink-900/10",
    border: "border-pink-500/20 hover:border-pink-500/50",
    iconColor: "text-pink-400",
    iconBg: "bg-pink-500/15",
  },
  {
    to: "/profile",
    icon: UserCircle,
    label: "Account",
    sublabel: "Profile & settings",
    gradient: "from-sky-600/20 to-sky-900/10",
    border: "border-sky-500/20 hover:border-sky-500/50",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/15",
  },
];

export default function Home() {
  const [userName, setUserName] = useState("");

  useEffect(() => {
    base44.auth.me().then((me) => setUserName(me?.full_name?.split(" ")[0] || ""));
  }, []);

  return (
    <div className="min-h-screen flex flex-col px-5 pt-5 pb-10 max-w-lg mx-auto">
      {/* Brand */}
      <div className="flex items-center gap-2 mb-3">
        <img src="https://media.base44.com/images/public/69d556d1ae7f4cada8ab83ef/e327a8610_logotransparent.png" alt="DoorMan" className="w-36 h-36 object-contain" />
        <span className="font-heading font-bold text-white text-4xl tracking-wide">DoorMan</span>
      </div>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-xs text-primary font-semibold uppercase tracking-widest">Welcome</span>
        </div>
        <h1 className="font-heading font-bold text-xl text-foreground leading-tight">
          {userName ? `Hey ${userName}` : "Hey there"} 👋
        </h1>
        <p className="text-muted-foreground mt-0.5 text-xs">What are you here for today?</p>
      </div>

      {/* Role cards */}
      <div className="flex flex-col gap-3 flex-1">
        {roles.map((role) => (
          <Link key={role.to} to={role.to} className="block group">
            <div className={`relative rounded-2xl border bg-gradient-to-br ${role.gradient} ${role.border} p-5 flex items-center gap-4 transition-all duration-200 active:scale-[0.98]`}>
              <div className={`w-12 h-12 rounded-xl ${role.iconBg} flex items-center justify-center flex-shrink-0`}>
                <role.icon className={`w-6 h-6 ${role.iconColor}`} />
              </div>
              <div className="flex-1">
                <p className="font-heading font-bold text-base text-foreground">{role.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{role.sublabel}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}