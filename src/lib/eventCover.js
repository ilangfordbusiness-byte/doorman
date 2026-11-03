import { COVERS } from "@/components/CoverPicker";

// Preset covers are stored as "__cover__<id>"; resolve to their gradient style
// (the same mapping EventCard uses). Real uploads are plain image URLs, for
// which this returns null and the caller renders an <img> instead.
export function coverStyleFor(coverImage) {
  if (coverImage?.startsWith("__cover__")) {
    const id = coverImage.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}
