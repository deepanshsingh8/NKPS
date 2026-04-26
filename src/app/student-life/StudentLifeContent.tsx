"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  Music,
  Palette,
  MessageSquare,
  Brain,
  BookOpen,
  Cpu,
  Trophy,
  Target,
  CircleDot,
  Timer,
  TableProperties,
  Crown,
  Star,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/shared/components/PageTransition";
import { AnimatedSection } from "@/shared/components/AnimatedSection";
import { SectionHeading } from "@/shared/components/SectionHeading";
import { staggerContainer, fadeUp } from "@/shared/lib/animations";
import { cn } from "@/shared/lib/utils";
import type { SectionCard } from "@/shared/types";

const defaultActivities = [
  {
    icon: Music,
    title: "Music & Dance",
    description:
      "Express creativity through classical and contemporary performances",
    image: "/images/gallery/st1.jpg",
    span: false,
  },
  {
    icon: Palette,
    title: "Art & Craft",
    description:
      "Develop artistic skills through painting, sculpture and design",
    image: "/images/gallery/st2.jpg",
    span: true,
  },
  {
    icon: MessageSquare,
    title: "Debate & Elocution",
    description:
      "Build confidence and critical thinking through public speaking",
    image: "/images/gallery/st3.jpg",
    span: true,
  },
  {
    icon: Brain,
    title: "Quiz Competitions",
    description:
      "Sharpen knowledge and analytical skills in academic quizzes",
    image: "/images/gallery/st4.jpg",
    span: false,
  },
  {
    icon: BookOpen,
    title: "Literary Club",
    description: "Nurture love for reading and creative writing",
    image: "/images/gallery/st5.jpg",
    span: false,
  },
  {
    icon: Cpu,
    title: "Science Club",
    description: "Hands-on experiments and innovation projects",
    image: "/images/gallery/st6.jpg",
    span: false,
  },
];

const activityIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Music,
  Palette,
  MessageSquare,
  Brain,
  BookOpen,
  Cpu,
};

interface StudentLifePageProps {
  activityImages?: string[];
  activityCards?: SectionCard[];
  eventCards?: SectionCard[];
}

const sports = [
  { name: "Cricket", icon: Trophy },
  { name: "Football", icon: Target },
  { name: "Basketball", icon: CircleDot },
  { name: "Athletics", icon: Timer },
  { name: "Table Tennis", icon: TableProperties },
  { name: "Chess", icon: Crown },
];

const events = [
  {
    season: "Winter",
    title: "Annual Day",
    description:
      "A grand celebration of talent, culture and achievement featuring performances by students from all grades",
  },
  {
    season: "Monsoon",
    title: "Sports Day (Chakravyuh)",
    description:
      "Inter-house athletic competitions and team sports fostering sportsmanship and physical fitness",
  },
  {
    season: "Spring",
    title: "Republic & Independence Day",
    description:
      "Patriotic celebrations with cultural programmes, flag hoisting and community participation",
  },
  {
    season: "Autumn",
    title: "Science Exhibition",
    description:
      "Student-led innovations and project displays showcasing creativity and scientific temper",
  },
];

export function StudentLifeContent({
  activityImages,
  activityCards,
  eventCards,
}: StudentLifePageProps = {}) {
  // Default activities with optional image overrides + DB cards appended
  const baseActivities = defaultActivities.map((a, i) => ({
    ...a,
    image: activityImages?.[i] || a.image,
  }));
  const dbActivities = (activityCards ?? []).map((c) => ({
    icon: activityIconMap[c.icon || ""] || Cpu,
    title: c.title || "",
    description: c.description || "",
    image: c.image_url || "/images/gallery/st1.jpg",
    span: false,
  }));
  const activities = [...baseActivities, ...dbActivities];

  // Default events + DB cards appended
  const dbEvents = (eventCards ?? []).map((c) => ({
    season: c.season || "",
    title: c.title || "",
    description: c.description || "",
  }));
  const allEvents = [...events, ...dbEvents];

  return (
    <PageTransition>
      <PageHeader title="Student Life" subtitle="Beyond the Classroom" />

      {/* Activities — Masonry-like Grid */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <AnimatedSection>
            <SectionHeading
              title="Activities & Clubs"
              subtitle="Discover your passion through our diverse range of extracurricular activities"
            />
          </AnimatedSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mt-14 grid auto-rows-[250px] sm:auto-rows-[200px] grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
          >
            {activities.map((activity) => (
              <motion.div
                key={activity.title}
                variants={fadeUp}
                className={cn(
                  "group relative overflow-hidden rounded-3xl",
                  activity.span && "md:row-span-2"
                )}
              >
                <Image
                  src={activity.image}
                  alt={activity.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/40 to-transparent transition-all duration-500 group-hover:from-navy-950/95" />

                {/* Icon circle */}
                <div className="absolute left-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-all duration-300 group-hover:bg-white/20">
                  <activity.icon className="h-5 w-5 text-white" />
                </div>

                {/* Content at bottom */}
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <h3 className="font-heading text-xl font-bold text-white">
                    {activity.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-200 opacity-0 transition-all duration-500 group-hover:opacity-100">
                    {activity.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Sports & Athletics */}
      <section className="bg-cream-50 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <AnimatedSection>
            <SectionHeading
              title="Sports & Athletics"
              subtitle="Building teamwork, discipline and physical fitness through sports"
            />
          </AnimatedSection>

          <AnimatedSection delay={0.15}>
            <p className="mx-auto mt-6 max-w-2xl text-center leading-relaxed text-gray-600">
              Our school provides excellent sports facilities and professional
              coaching to help students excel in various sporting disciplines.
              Regular inter-house and inter-school competitions encourage healthy
              competition and sportsmanship.
            </p>
          </AnimatedSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            {sports.map((sport) => (
              <motion.div
                key={sport.name}
                variants={fadeUp}
                className="group flex cursor-default items-center gap-2.5 rounded-full border border-gray-200 bg-white px-6 py-3 shadow-sm transition-all duration-300 hover:border-gold-500 hover:shadow-md"
              >
                <sport.icon className="h-4.5 w-4.5 text-navy-700 transition-colors duration-300 group-hover:text-gold-600" />
                <span className="text-sm font-semibold text-navy-900">
                  {sport.name}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Annual Events — Timeline Style */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <AnimatedSection>
            <SectionHeading
              title="Annual Events"
              subtitle="Memorable celebrations that bring our school community together"
            />
          </AnimatedSection>

          <div className="mt-14 space-y-6">
            {allEvents.map((event, index) => (
              <AnimatedSection key={event.title} delay={index * 0.12}>
                <div className="group flex flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:border-gold-300 hover:shadow-lg sm:flex-row sm:items-start">
                  {/* Season Badge */}
                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-md transition-transform duration-300 group-hover:scale-105">
                    <Star className="h-5 w-5 text-white" />
                    <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">
                      {event.season}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h3 className="font-heading text-lg font-bold text-navy-900">
                      {event.title}
                    </h3>
                    <p className="mt-1.5 leading-relaxed text-gray-600">
                      {event.description}
                    </p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
