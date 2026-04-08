import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Mic2, Users, ScanLine, UserCircle, ChevronRight, HeartHandshake } from "lucide-react";

const roles = [
  {
    to: "/host",
    icon: Mic2,
    label: "Host",
    sublabel: "Create & manage your events",
    border: "border-violet-500/20 hover:border-violet-400/60",
    topBar: "from-violet-500 to-fuchsia-500",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    tag: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    tagText: "HOST",
  },
  {
    to: "/guest",
    icon: Users,
    label: "Guest",
    sublabel: "View your invites & passes",
    border: "border-amber-500/20 hover:border-amber-400/60",
    topBar: "from-amber-400 to-orange-500",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
    tag: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    tagText: "GUEST",
  },
  {
    to: "/staff",
    icon: ScanLine,
    label: "Doorman",
    sublabel: "Scan QR codes & check guests in",
    border: "border-cyan-500/20 hover:border-cyan-400/60",
    topBar: "from-cyan-400 to-emerald-400",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
    tag: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    tagText: "STAFF",
  },
  {
    to: "/friends",
    icon: HeartHandshake,
    label: "Friends",
    sublabel: "Suggestions, requests & connections",
    border: "border-pink-500/20 hover:border-pink-400/60",
    topBar: "from-pink-500 to-rose-500",
    iconColor: "text-pink-400",
    iconBg: "bg-pink-500/10",
    tag: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    tagText: "SOCIAL",
  },
  {
    to: "/profile",
    icon: UserCircle,
    label: "Account",
    sublabel: "Profile & settings",
    border: "border-sky-500/20 hover:border-sky-400/60",
    topBar: "from-sky-400 to-blue-500",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10",
    tag: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    tagText: "YOU",
  },
];

export default function Home() {
  const [userName, setUserName] = useState("");

  useEffect(() => {
    base44.auth.me().then((me) => setUserName(me?.full_name?.split(" ")[0] || ""));
  }, []);

  return (
    <div className="min-h-screen flex flex-col px-4 pt-6 pb-6 max-w-lg mx-auto">
      {/* Brand */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <img
            src="https://media.base44.com/images/public/69d556d1ae7f4cada8ab83ef/e327a8610_logotransparent.png"
            alt="DoorMan"
            className="w-10 h-10 object-contain"
          />
          <span className="font-heading font-bold text-2xl tracking-widest text-foreground uppercase">
            Door<span className="text-primary" style={{ textShadow: "0 0 20px hsl(270 90% 65% / 0.8)" }}>Man</span>
          </span>
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-full border border-accent/30 bg-accent/5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ boxShadow: "0 0 6px hsl(180 100% 50%)" }} />
            <span className="text-[10px] font-mono text-accent tracking-widest">LIVE</span>
          </div>
        </div>

        <div className="mt-4 pl-1">
          <p className="text-[10px] font-mono text-muted-foreground tracking-[0.25em] uppercase mb-1">
            // welcome back
          </p>
          <h1 className="font-heading font-bold text-3xl text-foreground leading-tight">
            {userName ? (
              <>Hey, <span className="text-primary" style={{ textShadow: "0 0 25px hsl(270 90% 65% / 0.6)" }}>{userName}</span></>
            ) : (
              "Hey there 👋"
            )}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">What are you here for tonight?</p>
        </div>
      </div>

      {/* Role cards */}
      <div className="flex flex-col gap-3 flex-1">
        {roles.map((role) => (
          <Link key={role.to} to={role.to} className="block group">
            <div className={`relative rounded-2xl border bg-card overflow-hidden transition-all duration-300 active:scale-[0.98] ${role.border}`}>
              <div className={`h-[2px] w-full bg-gradient-to-r ${role.topBar} opacity-60 group-hover:opacity-100 transition-opacity`} />
              <div className="flex items-center gap-4 p-4">
                <div className={`w-11 h-11 rounded-xl ${role.iconBg} flex items-center justify-center flex-shrink-0 border border-white/5`}>
                  <role.icon className={`w-5 h-5 ${role.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-heading font-bold text-base text-foreground">{role.label}</p>
                    <span className={`text-[9px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded border ${role.tag}`}>
                      {role.tagText}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{role.sublabel}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-all" />
              </div>
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.02]"
                style={{
                  backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
            </div>
          </Link>
        ))}
      </div>

      <p className="text-center text-[10px] font-mono text-muted-foreground/40 tracking-widest mt-6 uppercase">
        Access Granted — v1.0
      </p>
    </div>
  );
}