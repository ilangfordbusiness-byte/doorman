import { useSyncExternalStore, useEffect } from "react";
import Avatar from "./Avatar";
import { requestPictures, getPicture, subscribe } from "@/lib/profilePictureStore";

// Like Avatar, but resolves the person's CURRENT profile picture from their
// user account by email (shared live cache), falling back to `fallbackSrc`
// (a denormalized snapshot) while loading or if none is set, then initials.
export default function UserAvatar({ email, name, fallbackSrc, size = "w-10 h-10", rounded = "rounded-full", textClass = "text-sm", className = "", enlargeable = false }) {
  const key = String(email || "").toLowerCase();
  const picture = useSyncExternalStore(
    subscribe,
    () => getPicture(key),
    () => getPicture(key)
  );
  useEffect(() => {
    if (key) requestPictures([key]);
  }, [key]);

  return (
    <Avatar
      src={picture || fallbackSrc || ""}
      name={name}
      size={size}
      rounded={rounded}
      textClass={textClass}
      className={className}
      enlargeable={enlargeable}
    />
  );
}