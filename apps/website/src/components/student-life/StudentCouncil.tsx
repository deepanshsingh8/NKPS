"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Crown, Shield, ZoomIn } from "lucide-react";
import { AnimatedSection } from "@nkps/shared/components/AnimatedSection";
import { SectionHeading } from "@nkps/shared/components/SectionHeading";
import { staggerContainer, fadeUp } from "@nkps/shared/lib/animations";
import { cn } from "@nkps/shared/lib/utils";
import type { SectionCard } from "@nkps/shared/types";

/**
 * Investiture ceremony office bearers, CMS-managed via `section_cards`:
 *
 *  - `student_council` → Head Boy, Head Girl, Sports / Cultural Captains …
 *  - `house_captains`  → per-house captains, grouped by `title` (house name)
 *
 * Both sections render nothing when the CMS has no active cards, so the page
 * degrades cleanly between one investiture and the next.
 */

interface OfficeBearer {
  id: string;
  name: string;
  post: string;
  className: string;
  session: string;
  message: string;
  photo: string | null;
}

type ExpandImage = (image: { src: string; title: string }) => void;

function toBearer(card: SectionCard): OfficeBearer {
  return {
    id: card.id,
    name: card.name || "",
    post: card.designation || "",
    className: card.role || "",
    session: card.year || "",
    message: card.message || "",
    photo: card.image_url || null,
  };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* ─── House colours ───────────────────────────────────────────────────────
 * Houses are free text in the CMS, so the accent is derived from the house
 * name: an explicit colour word in the name wins ("Red House"), and every
 * other house takes the first accent no one has claimed — so two houses only
 * ever share a colour once there are more houses than accents.
 */

interface HouseTheme {
  band: string;
  chip: string;
  ring: string;
}

const HOUSE_THEMES: HouseTheme[] = [
  { band: "from-red-500 to-red-700", chip: "bg-red-50 text-red-700", ring: "ring-red-200" },
  { band: "from-blue-500 to-blue-700", chip: "bg-blue-50 text-blue-700", ring: "ring-blue-200" },
  { band: "from-emerald-500 to-emerald-700", chip: "bg-emerald-50 text-emerald-700", ring: "ring-emerald-200" },
  { band: "from-amber-400 to-amber-600", chip: "bg-amber-50 text-amber-700", ring: "ring-amber-200" },
  { band: "from-purple-500 to-purple-700", chip: "bg-purple-50 text-purple-700", ring: "ring-purple-200" },
  { band: "from-orange-500 to-orange-700", chip: "bg-orange-50 text-orange-700", ring: "ring-orange-200" },
];

const HOUSE_COLOR_WORDS: [RegExp, number][] = [
  [/\b(red|crimson|scarlet|ruby)\b/i, 0],
  [/\b(blue|azure|sapphire|navy|cyan)\b/i, 1],
  [/\b(green|emerald|jade|olive)\b/i, 2],
  [/\b(yellow|gold|golden|amber|topaz)\b/i, 3],
  [/\b(purple|violet|magenta|amethyst)\b/i, 4],
  [/\b(orange|saffron|coral)\b/i, 5],
];

function colorWordIndex(house: string): number | null {
  for (const [pattern, index] of HOUSE_COLOR_WORDS) {
    if (pattern.test(house)) return index;
  }
  return null;
}

function assignHouseThemes(names: string[]): Map<string, HouseTheme> {
  const themes = new Map<string, HouseTheme>();
  const used = new Set<number>();
  const unnamed: string[] = [];

  // Houses that name their colour get it, first come first served.
  for (const name of names) {
    const index = colorWordIndex(name);
    if (index !== null && !used.has(index)) {
      used.add(index);
      themes.set(name, HOUSE_THEMES[index]);
    } else {
      unnamed.push(name);
    }
  }

  // The rest fill the gaps in order, cycling only once every accent is taken.
  let cursor = 0;
  for (const name of unnamed) {
    while (used.size < HOUSE_THEMES.length && used.has(cursor % HOUSE_THEMES.length)) {
      cursor++;
    }
    const index = cursor % HOUSE_THEMES.length;
    used.add(index);
    themes.set(name, HOUSE_THEMES[index]);
    cursor++;
  }

  return themes;
}

/* ─── Shared portrait ─── */

function BearerPortrait({
  bearer,
  onExpandImage,
  className,
}: {
  bearer: OfficeBearer;
  onExpandImage?: ExpandImage;
  className?: string;
}) {
  const clickable = Boolean(bearer.photo && onExpandImage);

  const expand = () => {
    if (bearer.photo && onExpandImage) {
      onExpandImage({
        src: bearer.photo,
        title: bearer.post ? `${bearer.name} — ${bearer.post}` : bearer.name,
      });
    }
  };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `View larger photo of ${bearer.name}` : undefined}
      onClick={clickable ? expand : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                expand();
              }
            }
          : undefined
      }
      className={cn(
        "group/photo relative overflow-hidden",
        clickable &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
        className
      )}
    >
      {bearer.photo ? (
        <>
          <Image
            src={bearer.photo}
            alt={bearer.name}
            fill
            className="object-cover transition-transform duration-700 group-hover/photo:scale-105"
            sizes="(max-width: 768px) 50vw, 300px"
          />
          {clickable && (
            <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover/photo:opacity-100">
              <ZoomIn className="h-4 w-4" />
            </span>
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 to-navy-950">
          <span className="font-heading text-3xl font-bold text-white/90">
            {getInitials(bearer.name)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Student Council ─── */

// Councils vary in size — four posts (head boy / head girl + two captains) or
// six once deputies are invested, sometimes more. Pick the wide-screen column
// count that leaves the fewest cards stranded on the last row, so six bearers
// lay out as two rows of three rather than four-then-two.
const LG_COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

function columnsClass(count: number): string {
  if (count <= 4) return LG_COLUMNS[count];
  const remainderOf4 = count % 4;
  const remainderOf3 = count % 3;
  if (remainderOf4 === 0) return LG_COLUMNS[4];
  if (remainderOf3 === 0) return LG_COLUMNS[3];
  return remainderOf4 >= remainderOf3 ? LG_COLUMNS[4] : LG_COLUMNS[3];
}

export function StudentCouncil({
  cards,
  onExpandImage,
}: {
  cards?: SectionCard[];
  onExpandImage?: ExpandImage;
}) {
  const bearers = (cards ?? []).map(toBearer);
  if (bearers.length === 0) return null;

  // The session is the same for the whole council — show it once, as a badge
  // under the heading, taken from the first card that carries one.
  const session = bearers.find((b) => b.session)?.session ?? "";

  return (
    <section className="bg-gradient-to-b from-navy-950 to-navy-900 py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection>
          <SectionHeading
            label="Investiture Ceremony"
            title="Our Student Council"
            subtitle="The office bearers who lead, represent and inspire our student community"
            light
          />
        </AnimatedSection>

        {session && (
          <AnimatedSection delay={0.1}>
            <div className="mt-6 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-1.5 text-sm font-medium text-gold-300">
                <Crown className="h-4 w-4" />
                Session {session}
              </span>
            </div>
          </AnimatedSection>
        )}

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className={cn(
            "mt-12 grid grid-cols-2 gap-4 sm:gap-6",
            columnsClass(bearers.length)
          )}
        >
          {bearers.map((bearer) => (
            <motion.div
              key={bearer.id}
              variants={fadeUp}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors duration-300 hover:border-gold-500/40"
            >
              <BearerPortrait
                bearer={bearer}
                onExpandImage={onExpandImage}
                className="relative aspect-[4/5] w-full"
              />

              <div className="p-4 text-center sm:p-5">
                {bearer.post && (
                  <span className="inline-block rounded-full bg-gold-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold-300 sm:text-[11px]">
                    {bearer.post}
                  </span>
                )}
                <h3 className="mt-3 font-heading text-base font-bold text-white sm:text-lg">
                  {bearer.name}
                </h3>
                {bearer.className && (
                  <p className="mt-0.5 text-xs text-gray-300 sm:text-sm">
                    {bearer.className}
                  </p>
                )}
                {bearer.message && (
                  <p className="mt-3 text-sm italic leading-relaxed text-gray-400">
                    &ldquo;{bearer.message}&rdquo;
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── House Captains ─── */

export function HouseCaptains({
  cards,
  onExpandImage,
}: {
  cards?: SectionCard[];
  onExpandImage?: ExpandImage;
}) {
  // Group by house name (`title`), preserving the CMS sort order both across
  // houses (first appearance wins) and within each house.
  const houses: { name: string; members: OfficeBearer[] }[] = [];
  for (const card of cards ?? []) {
    const house = card.title?.trim() || "House";
    let group = houses.find((h) => h.name === house);
    if (!group) {
      group = { name: house, members: [] };
      houses.push(group);
    }
    group.members.push(toBearer(card));
  }

  if (houses.length === 0) return null;

  const themes = assignHouseThemes(houses.map((h) => h.name));

  return (
    <section className="bg-cream-50 py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection>
          <SectionHeading
            title="House Captains"
            subtitle="Every house is led by students who set the tone for teamwork and healthy competition"
          />
        </AnimatedSection>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {houses.map((house, index) => {
            const theme = themes.get(house.name) ?? HOUSE_THEMES[0];
            return (
              <AnimatedSection key={house.name} delay={index * 0.1}>
                <div className="h-full overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
                  <div className={cn("h-1.5 w-full bg-gradient-to-r", theme.band)} />

                  <div className="p-6">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
                          theme.band
                        )}
                      >
                        <Shield className="h-5 w-5" />
                      </span>
                      <h3 className="font-heading text-xl font-bold text-navy-900">
                        {house.name}
                      </h3>
                    </div>

                    <div className="mt-5 space-y-4">
                      {house.members.map((member) => (
                        <div key={member.id} className="flex items-center gap-4">
                          <BearerPortrait
                            bearer={member}
                            onExpandImage={onExpandImage}
                            className={cn(
                              "relative h-16 w-16 shrink-0 rounded-2xl ring-2",
                              theme.ring
                            )}
                          />

                          <div className="min-w-0">
                            <p className="font-heading text-base font-semibold text-navy-900">
                              {member.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {member.post && (
                                <span
                                  className={cn(
                                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                                    theme.chip
                                  )}
                                >
                                  {member.post}
                                </span>
                              )}
                              {member.className && (
                                <span className="text-xs text-gray-500">
                                  {member.className}
                                </span>
                              )}
                              {member.session && (
                                <span className="text-xs text-gray-400">
                                  {member.session}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}
