import { Link } from "react-router-dom";
import { Compass, HeartHandshake, Mic2, UserCircle, ArrowUpRight } from "lucide-react";

const sections = [
  {
    to: "/guest?tab=discover",
    icon: Compass,
    title: "DISCOVER",
    sub: "Find the best events, venues and experiences.",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    border: "border-amber-500/20 hover:border-amber-400/60",
    topBar: "from-amber-400 to-orange-500",
  },
  {
    to: "/friends",
    icon: HeartHandshake,
    title: "FRIENDS",
    sub: "See what your friends are into tonight.",
    iconBg: "bg-pink-500/10",
    iconColor: "text-pink-400",
    border: "border-pink-500/20 hover:border-pink-400/60",
    topBar: "from-pink-500 to-rose-500",
  },
  {
    to: "/host",
    icon: Mic2,
    title: "HOST",
    sub: "Create & manage unforgettable events.",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    border: "border-violet-500/20 hover:border-violet-400/60",
    topBar: "from-violet-500 to-fuchsia-500",
  },
  {
    to: "/profile",
    icon: UserCircle,
    title: "ACCOUNT",
    sub: "Your profile, passes & preferences.",
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-400",
    border: "border-sky-500/20 hover:border-sky-400/60",
    topBar: "from-sky-400 to-blue-500",
  },
];

export default function SectionGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {sections.map((s) => (
        <Link key={s.title} to={s.to} className="block group">
          <div className={`relative rounded-2xl border bg-card overflow-hidden transition-all duration-300 active:scale-[0.98] ${s.border}`}>
            <div className={`h-[2px] w-full bg-gradient-to-r ${s.topBar} opacity-60 group-hover:opacity-100 transition-opacity`} />
            <div className="p-4">
              <div className={`w-11 h-11 rounded-xl ${s.iconBg} flex items-center justify-center border border-white/5 mb-3`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
              <p className="font-heading font-bold text-base text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{s.sub}</p>
              <div className="flex justify-end mt-3">
                <div className={`w-7 h-7 rounded-full ${s.iconBg} flex items-center justify-center`}>
                  <ArrowUpRight className={`w-3.5 h-3.5 ${s.iconColor}`} />
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}