import { Link } from "react-router-dom";
import { Compass, HeartHandshake, Mic2, UserCircle } from "lucide-react";

const sections = [
  { to: "/guest?tab=discover", icon: Compass, title: "Discover", iconBg: "bg-amber-500/10", iconColor: "text-amber-400", border: "border-amber-500/20 hover:border-amber-400/60", topBar: "from-amber-400 to-orange-500" },
  { to: "/friends", icon: HeartHandshake, title: "Friends", iconBg: "bg-pink-500/10", iconColor: "text-pink-400", border: "border-pink-500/20 hover:border-pink-400/60", topBar: "from-pink-500 to-rose-500" },
  { to: "/host", icon: Mic2, title: "Host", iconBg: "bg-violet-500/10", iconColor: "text-violet-400", border: "border-violet-500/20 hover:border-violet-400/60", topBar: "from-violet-500 to-fuchsia-500" },
  { to: "/profile", icon: UserCircle, title: "Account", iconBg: "bg-sky-500/10", iconColor: "text-sky-400", border: "border-sky-500/20 hover:border-sky-400/60", topBar: "from-sky-400 to-blue-500" },
];

export default function SectionGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {sections.map((s) => (
        <Link key={s.title} to={s.to} className="block group">
          <div className={`relative rounded-2xl border bg-card overflow-hidden transition-all duration-300 active:scale-[0.98] ${s.border}`}>
            <div className={`h-[2px] w-full bg-gradient-to-r ${s.topBar} opacity-60 group-hover:opacity-100 transition-opacity`} />
            <div className="flex items-center gap-3 p-3.5">
              <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center border border-white/5 flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
              <p className="font-heading font-bold text-sm text-foreground">{s.title}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}