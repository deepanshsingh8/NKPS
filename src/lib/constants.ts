export const SCHOOL = {
  name: "NK Public School",
  shortName: "NKPS",
  tagline: "Empowering Young Minds Since 1985",
  description:
    "NK Public School, affiliated to CBSE, is a premier educational institution in Jaipur offering holistic education from Nursery to Class XII. Founded in 1985, we nurture over 20000 students with academic excellence and character building.",
  founded: 1985,
  founder: {
    name: "Late Shri R.K. Choudhary",
    years: "1929–2005",
    bio: "A former Indian Army officer who served in the Royal Corps and witnessed many battles with neighbouring countries. Decorated with many medals, he dedicated his post-military life to education. His core philosophy centred on discipline, education and human values — principles that continue to guide our institution.",
  },
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
    { label: "Students", value: 20000, suffix: "+" },
    { label: "Years of Excellence", value: 40, suffix: "+" },
    { label: "Dedicated Faculty", value: 300, suffix: "+" },
    { label: "Institutes", value: 6, suffix: "" },
  ],
  achievementStats: [
    { label: "Alumni Network", value: 10000, suffix: "+" },
    { label: "Years of Legacy", value: 40, suffix: "+" },
    { label: "Awards Won", value: 50, suffix: "+" },
    { label: "Board Results", value: 100, suffix: "%" },
  ],
} as const;

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Academics", href: "/academics" },
  { label: "Admissions", href: "/admissions" },
  { label: "Student Life", href: "/student-life" },
  { label: "Facilities", href: "/facilities" },
  { label: "Gallery", href: "/gallery" },
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

export const FACILITIES = [
  {
    title: "Smart Classrooms",
    description:
      "Technology-enabled classrooms with projectors and digital learning aids for an interactive educational experience.",
    icon: "Monitor" as const,
  },
  {
    title: "Science Laboratories",
    description:
      "Well-equipped Physics, Chemistry and Biology labs providing hands-on learning opportunities for students.",
    icon: "FlaskConical" as const,
  },
  {
    title: "Computer Lab",
    description:
      "Modern computer lab with high-speed internet and latest software for digital literacy and programming skills.",
    icon: "Laptop" as const,
  },
  {
    title: "Library",
    description:
      "A vast collection of over 10,000 books, periodicals and digital resources fostering a love for reading.",
    icon: "BookOpen" as const,
  },
  {
    title: "Sports Grounds",
    description:
      "Expansive playgrounds with facilities for cricket, football, basketball, athletics and more.",
    icon: "Trophy" as const,
  },
  {
    title: "Auditorium",
    description:
      "State-of-the-art auditorium for cultural events, annual functions and academic seminars.",
    icon: "Theater" as const,
  },
  {
    title: "Indoor Games",
    description:
      "Dedicated spaces for table tennis, chess, carrom and other indoor recreational activities.",
    icon: "Gamepad2" as const,
  },
  {
    title: "Transport",
    description:
      "Safe and reliable school bus transport covering major routes across Jaipur city.",
    icon: "Bus" as const,
  },
] as const;
