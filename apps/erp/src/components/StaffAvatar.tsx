import Image from "next/image";
import { cn } from "@nkps/shared/lib/utils";

// Staff photos are cropped to the 4:5 portrait spec at upload, so the frame
// keeps that ratio and lets the image letterbox inside it rather than cropping
// a second time. Members without a photo get initials on a colour picked from
// their name, so the same person always gets the same tile.

const AVATAR_COLORS = [
  "from-navy-800 to-navy-900",
  "from-blue-500 to-blue-700",
  "from-gold-500 to-gold-600",
  "from-emerald-500 to-emerald-700",
  "from-violet-500 to-violet-700",
  "from-rose-500 to-rose-700",
  "from-cyan-500 to-cyan-700",
  "from-amber-500 to-amber-700",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SIZES = {
  sm: { frame: "w-10", text: "text-xs", sizes: "40px" },
  lg: { frame: "w-20", text: "text-xl", sizes: "80px" },
} as const;

export function StaffAvatar({
  name,
  photoUrl,
  size = "sm",
  className,
}: {
  name: string;
  photoUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  if (photoUrl) {
    return (
      <div
        className={cn(
          "aspect-[4/5] rounded-md overflow-hidden relative bg-gray-50 dark:bg-muted",
          s.frame,
          className
        )}
      >
        <Image
          src={photoUrl}
          alt={name}
          fill
          className="object-contain"
          sizes={s.sizes}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "aspect-[4/5] rounded-md bg-gradient-to-br flex items-center justify-center",
        s.frame,
        getAvatarColor(name),
        className
      )}
    >
      <span className={cn("font-bold text-white", s.text)}>
        {getInitials(name)}
      </span>
    </div>
  );
}
