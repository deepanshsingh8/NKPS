/**
 * Seed script for site_media table.
 * Populates all image slots with their default static URLs.
 * Idempotent: uses upsert on the `slot` column, so re-running is safe
 * and will NOT overwrite admin-customized images.
 *
 * Usage: npx tsx scripts/migrations/cms/seed-site-media.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const slots = [
  // Home — Hero Slider
  { slot: "hero_slide_1", page: "home", section: "hero_slider", label: "Hero Slide 1 — Campus", default_url: "/images/hero/campus-1.jpg", alt_text: "NK Public School Campus", sort_order: 0 },
  { slot: "hero_slide_2", page: "home", section: "hero_slider", label: "Hero Slide 2 — Campus", default_url: "/images/hero/campus-2.avif", alt_text: "NK Public School Campus", sort_order: 1 },
  { slot: "hero_slide_3", page: "home", section: "hero_slider", label: "Hero Slide 3 — Leaders", default_url: "/images/news/n5.jpg", alt_text: "School Leaders", sort_order: 2 },

  // Home — Facilities Preview
  { slot: "facilities_preview_1", page: "home", section: "facilities_preview", label: "Facilities — Smart Classrooms", default_url: "/images/news/n1.jpg", alt_text: "Smart Classrooms", sort_order: 0 },
  { slot: "facilities_preview_2", page: "home", section: "facilities_preview", label: "Facilities — Science Labs", default_url: "/images/news/n2.jpg", alt_text: "Science Labs", sort_order: 1 },
  { slot: "facilities_preview_3", page: "home", section: "facilities_preview", label: "Facilities — Computer Lab", default_url: "/images/news/n4.jpg", alt_text: "Computer Lab", sort_order: 2 },
  { slot: "facilities_preview_4", page: "home", section: "facilities_preview", label: "Facilities — Library", default_url: "/images/news/n6.jpg", alt_text: "Library", sort_order: 3 },

  // Home — Stats Counter
  { slot: "stats_background", page: "home", section: "stats_counter", label: "Stats Section Background", default_url: "/images/gallery/g10.jpg", alt_text: "Campus Background", sort_order: 0 },

  // Home — Latest Updates
  { slot: "latest_update_1", page: "home", section: "latest_updates", label: "Latest Update — Admissions", default_url: "/images/news/n2.jpg", alt_text: "Admissions Open", sort_order: 0 },
  { slot: "latest_update_2", page: "home", section: "latest_updates", label: "Latest Update — Sports Meet", default_url: "/images/news/n4.jpg", alt_text: "Annual Sports Meet", sort_order: 1 },
  { slot: "latest_update_3", page: "home", section: "latest_updates", label: "Latest Update — Board Exam", default_url: "/images/news/n6.jpg", alt_text: "Board Exam Preparation", sort_order: 2 },

  // Student Life — Activities
  { slot: "student_life_music_dance", page: "student-life", section: "activities", label: "Student Life — Music & Dance", default_url: "/images/gallery/st1.jpg", alt_text: "Music & Dance", sort_order: 0 },
  { slot: "student_life_art_craft", page: "student-life", section: "activities", label: "Student Life — Art & Craft", default_url: "/images/gallery/st2.jpg", alt_text: "Art & Craft", sort_order: 1 },
  { slot: "student_life_debate", page: "student-life", section: "activities", label: "Student Life — Debate", default_url: "/images/gallery/st3.jpg", alt_text: "Debate & Elocution", sort_order: 2 },
  { slot: "student_life_quiz", page: "student-life", section: "activities", label: "Student Life — Quiz", default_url: "/images/gallery/st4.jpg", alt_text: "Quiz Competitions", sort_order: 3 },
  { slot: "student_life_literary", page: "student-life", section: "activities", label: "Student Life — Literary Club", default_url: "/images/gallery/st5.jpg", alt_text: "Literary Club", sort_order: 4 },
  { slot: "student_life_science", page: "student-life", section: "activities", label: "Student Life — Science Club", default_url: "/images/gallery/st6.jpg", alt_text: "Science Club", sort_order: 5 },

  // Facilities Page — Campus Facilities (the first 4 reuse home facilities_preview slots)
  { slot: "facilities_hero", page: "facilities", section: "campus_facilities", label: "Facilities — Hero Banner", default_url: "/images/hero/campus-1.jpg", alt_text: "NK Public School Campus", sort_order: 0 },
  { slot: "facilities_sports", page: "facilities", section: "campus_facilities", label: "Facilities — Sports Grounds", default_url: "/images/news/n7.jpg", alt_text: "Sports Grounds", sort_order: 1 },
  { slot: "facilities_auditorium", page: "facilities", section: "campus_facilities", label: "Facilities — Auditorium", default_url: "/images/news/n3.jpg", alt_text: "Auditorium", sort_order: 2 },
  { slot: "facilities_indoor_games", page: "facilities", section: "campus_facilities", label: "Facilities — Indoor Games", default_url: "/images/news/n5.jpg", alt_text: "Indoor Games", sort_order: 3 },
  { slot: "facilities_transport", page: "facilities", section: "campus_facilities", label: "Facilities — Transport", default_url: "/images/gallery/g10.jpg", alt_text: "School Transport", sort_order: 4 },

  // About — Leadership
  { slot: "leadership_managing_director", page: "about", section: "leadership", label: "Managing Director Photo", default_url: "/images/staff/managing-director.jpg", alt_text: "Dr. N.C. Lunayach", sort_order: 0 },
  { slot: "leadership_director", page: "about", section: "leadership", label: "Director Photo", default_url: "/images/staff/director.jpg", alt_text: "Mr. Kuldeep Singh", sort_order: 1 },
  { slot: "leadership_principal", page: "about", section: "leadership", label: "Principal Photo", default_url: "/images/staff/principal.jpg", alt_text: "Mrs. Prema Kavia", sort_order: 2 },

  // About — Founder
  { slot: "founder_photo", page: "about", section: "founder_tribute", label: "Founder Photo", default_url: "/images/about/rk-choudhary.png", alt_text: "Late Shri R.K. Choudhary", sort_order: 0 },

  // About — Hero Image
  { slot: "about_hero", page: "about", section: "hero", label: "About Page Hero Image", default_url: "/images/gallery/g10.jpg", alt_text: "NK Public School Campus", sort_order: 0 },

  // Global — Logo
  { slot: "site_logo", page: "global", section: "branding", label: "School Logo", default_url: "/images/logo.png", alt_text: "NK Public School Logo", sort_order: 0 },
];

async function seed() {
  console.log(`Seeding ${slots.length} site_media slots...`);

  const records = slots.map((s) => ({
    ...s,
    current_url: s.default_url,
  }));

  const { error } = await supabase
    .from("site_media")
    .upsert(records, { onConflict: "slot", ignoreDuplicates: true });

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`Done! ${slots.length} slots seeded.`);
}

seed();
