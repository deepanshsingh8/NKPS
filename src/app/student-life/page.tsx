import { Metadata } from "next";
import { StudentLifeContent } from "./StudentLifeContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPageMedia, mediaUrl, getSectionCards } from "@/lib/site-media";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Student Life & Activities — NK Public School Jaipur",
  description:
    "Co-curricular life at NK Public School, Jaipur — music, dance, art, debate, quiz, literary and science clubs plus annual events that shape character beyond the classroom.",
  path: "/student-life",
});

export const revalidate = 60;

export default async function StudentLifePage() {
  const [media, activityCards, eventCards] = await Promise.all([
    getPageMedia("student-life"),
    getSectionCards("activities"),
    getSectionCards("annual_events"),
  ]);

  const activityImages = [
    mediaUrl(media, "student_life_music_dance", "/images/gallery/st1.jpg"),
    mediaUrl(media, "student_life_art_craft", "/images/gallery/st2.jpg"),
    mediaUrl(media, "student_life_debate", "/images/gallery/st3.jpg"),
    mediaUrl(media, "student_life_quiz", "/images/gallery/st4.jpg"),
    mediaUrl(media, "student_life_literary", "/images/gallery/st5.jpg"),
    mediaUrl(media, "student_life_science", "/images/gallery/st6.jpg"),
  ];

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Student Life", path: "/student-life" },
        ])}
      />
      <StudentLifeContent activityImages={activityImages} activityCards={activityCards} eventCards={eventCards} />
    </>
  );
}
