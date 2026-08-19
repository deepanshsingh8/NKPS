export const SCHOOL = {
  name: "NK Public School",
  shortName: "NKPS",
  tagline: "Empowering Young Minds Since 1985",
  description:
    "NK Public School, affiliated to CBSE, is a premier educational institution in Jaipur offering holistic education from Nursery to Class XII. Founded in 1985, we nurture over 4000 students with academic excellence and character building.",
  founded: 1985,
  founder: {
    name: "Late Shri R.K. Choudhary",
    years: "1929–2005",
    bio: "A former Indian Army officer who served in the Royal Corps and witnessed many battles with neighbouring countries. Decorated with many medals, he dedicated his post-military life to education. His core philosophy centred on discipline, education and human values — principles that continue to guide our institution.",
  },
  mission:
    "Our mission is to ensure that all students are well educated, self-disciplined and become productive members of our glorious society.",
  vision:
    "To educate, develop and inspire children from diverse backgrounds to achieve their highest academic and creative potential, while embracing ethical values and becoming active contributors to the society. We aim to meet the needs of every unique child through an exciting, board-balanced curriculum based on developing skills, effective partnership with families and the wider community, valuing all children as individuals and developing their interests and potential accordingly.",
  address: {
    line1: "Grand Sikar Road, Rajawas",
    city: "Jaipur",
    state: "Rajasthan",
    pin: "302013",
    full: "Grand Sikar Road, Rajawas, Jaipur – 302013",
  },
  phone: ["+91-9785500046", "+91-9785500048"],
  fax: "0141-2231482",
  email: ["nkps.rajawas@gmail.com", "principalnkpsraj@gmail.com"],
  whatsapp: "919785500046",
  officeHours: "Mon–Sat, 9:00 AM – 3:00 PM",
  affiliation: "CBSE",
  affiliationNumber: "1730406",
  geo: { lat: 27.0688458, lng: 75.7495752 },
  priceRange: "₹₹",
  social: {
    facebook: "https://www.facebook.com/nkpsrajawas",
    instagram: "https://www.instagram.com/nkps_rajawas",
    youtube:
      "https://www.youtube.com/channel/UCjXhDycJ_b8dJmfLlYbsM6w",
  },
  leadership: [
    {
      name: "Dr. N.C. Lunayach",
      designation: "Managing Director",
      message:
        "Education is the foundation of a brighter future. We strive to provide an environment where every child discovers their potential and grows into responsible citizens.",
    },
    {
      name: "Mr. Kuldeep Singh",
      designation: "Director",
      message:
        "Our institution stands on the pillars of discipline, knowledge and progressive growth. We are committed to creating a world-class educational experience for all students.",
    },
    {
      name: "Mrs. Prema Kavia",
      designation: "Principal",
      message:
        "At NK Public School, we believe every child is unique. Our dedicated faculty ensures holistic development through academic excellence and co-curricular activities.",
    },
  ],
  stats: [
    { label: "Students", value: 4000, suffix: "+" },
    { label: "Years of Excellence", value: 40, suffix: "+" },
    { label: "Dedicated Faculty", value: 200, suffix: "+" },
    { label: "Institutes", value: 4, suffix: "" },
  ],
  achievementStats: [
    { label: "Alumni Network", value: 20000, suffix: "+" },
    { label: "Years of Legacy", value: 40, suffix: "+" },
    { label: "Awards Won", value: 50, suffix: "+" },
    { label: "Board Results", value: 100, suffix: "%" },
  ],
} as const;

// Primary nav — the 6 links a prospective parent cares about most. Kept short
// to lower cognitive load and lift click-through on the conversion path.
export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Academics", href: "/academics" },
  { label: "Admissions", href: "/admissions" },
  { label: "Facilities", href: "/facilities" },
  { label: "Gallery", href: "/gallery" },
] as const;

// Secondary nav — surfaced under a "More" dropdown on desktop, inlined on
// mobile, and kept discoverable in the footer.
export const NAV_MORE_LINKS = [
  { label: "Student Life", href: "/student-life" },
  { label: "Articles", href: "/articles" },
  { label: "Alumni", href: "/alumni" },
  { label: "Contact", href: "/contact" },
] as const;

export const STAFF = {
  pgt: [
    { name: "Jasvindar Singh Bhatiya", subject: "Biology" },
    { name: "Vijay Kumar Soni", subject: "Chemistry" },
    { name: "Arshad Ali Khan", subject: "Accountancy" },
    { name: "Ashutosh Tiwari", subject: "Economics" },
    { name: "Shailendra Singh", subject: "Physics" },
    { name: "Shivendra Singh Yadav", subject: "Physical Education" },
    { name: "Sunil Kumar Bhardwaj", subject: "Information Practices" },
    { name: "Pradeep Sharma", subject: "History" },
    { name: "Jatirmoy Samadder", subject: "Mathematics" },
    { name: "Nisha Sharma", subject: "Music" },
    { name: "Indu Sharma", subject: "Painting" },
    { name: "Santosh Kanwar", subject: "English" },
    { name: "Hemant Kumar Yogi", subject: "Political Science" },
  ],
  tgt: [
    { name: "Neha Rathi", subject: "English" },
    { name: "Shubham Aggarwal", subject: "Mathematics" },
    { name: "Sunita Bugaliya", subject: "Hindi" },
    { name: "Soniya Sharma", subject: "Hindi" },
    { name: "Nita Sharma", subject: "English" },
    { name: "Priyanka Sharma", subject: "Social Science" },
    { name: "Himanshu Kumawat", subject: "Science" },
    { name: "Vijaya Sharma", subject: "Science" },
    { name: "Rahul Prajapat", subject: "Computer Science" },
    { name: "Ramesh Chandra Sharma", subject: "Sanskrit" },
    { name: "Sneha Sharma", subject: "Science" },
  ],
  prt: [
    { name: "Khushi Jain", subject: "Mathematics" },
    { name: "Poonam Sharma", subject: "Staff Secretary" },
    { name: "Usha Rajawat", subject: "General" },
    { name: "Vijay Laxmi", subject: "Hindi" },
    { name: "Neha Sharma", subject: "English" },
    { name: "Sumati Saini", subject: "Computer" },
    { name: "Sonu Kumawat", subject: "English" },
    { name: "Meenakshi", subject: "Hindi" },
    { name: "Shivani Gaur", subject: "Mathematics" },
    { name: "Kalpana Negi", subject: "Mathematics" },
  ],
  management: [
    { name: "Kavia Prema", subject: "Principal" },
    { name: "Gaurav Kumar Mathur", subject: "Vice Principal" },
    { name: "Ramavtar Khunteta", subject: "Senior Coordinator" },
    { name: "Neelam Pandey", subject: "Pre-Primary Coordinator" },
  ],
  motherTeachers: [
    { name: "Neha Gautam", subject: "Mother Teacher" },
    { name: "Nitu Sinha", subject: "Mother Teacher" },
    { name: "Mamta Agarwal", subject: "Mother Teacher" },
  ],
  admin: [] as { name: string; subject: string }[],
} as const;

// Half-day cutoff for teacher absences. Periods 1..N are "first_half", N+1..end
// are "second_half". Centralised here so the substitution planner and any
// future per-period attendance feature share one definition. Promote to a DB
// config row if a school ever needs it variable per day.
export const HALF_DAY_CUTOFF_PERIOD = 4;

/**
 * Curriculum order of class names, lowest to highest.
 *
 * Single source of truth for anywhere classes must be ordered or stepped
 * through. It was previously copy-pasted into api/students/promote (where it
 * drives the promotion ladder), api/students/bulk and the fee schedule grid —
 * three copies that had to be edited together for the school to add a class.
 *
 * NOTE: sorting class names as text is wrong and looks right just often
 * enough to be missed — "I" sorts before "Nursery", "X" before "XI" but after
 * "VIII". Always order through this list.
 */
export const CLASS_ORDER = [
  "Nursery",
  "LKG",
  "UKG",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
] as const;

/** Position of a class name in curriculum order; unknown names sort last. */
export function classSortIndex(name: string | null | undefined): number {
  if (!name) return Number.MAX_SAFE_INTEGER;
  const i = (CLASS_ORDER as readonly string[]).indexOf(name.trim());
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
