import { Metadata } from "next";
import { StudentLifeContent } from "./StudentLifeContent";
import { getPageMedia, mediaUrl } from "@/lib/site-media";

export const metadata: Metadata = {
  title: "Student Life",
};

export default async function StudentLifePage() {
  const media = await getPageMedia("student-life");

  const activityImages = [
    mediaUrl(media, "student_life_music_dance", "/images/gallery/st1.jpg"),
    mediaUrl(media, "student_life_art_craft", "/images/gallery/st2.jpg"),
    mediaUrl(media, "student_life_debate", "/images/gallery/st3.jpg"),
    mediaUrl(media, "student_life_quiz", "/images/gallery/st4.jpg"),
    mediaUrl(media, "student_life_literary", "/images/gallery/st5.jpg"),
    mediaUrl(media, "student_life_science", "/images/gallery/st6.jpg"),
  ];

  return <StudentLifeContent activityImages={activityImages} />;
}
