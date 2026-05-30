import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, clientIp } from "@nkps/shared/lib/rate-limit";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const BASE_SYSTEM_PROMPT = `You are the NK Public School (NKPS) virtual assistant. Answer questions from parents, students, and visitors about the school. Be helpful, friendly, and concise. If you don't know something specific, suggest contacting the school directly.

Here is everything about NK Public School:

## General Information
- Full Name: NK Public School (NKPS)
- Tagline: "Empowering Young Minds Since 1985"
- Founded: 1985
- Affiliation: CBSE (Central Board of Secondary Education)
- Classes: Nursery to Class XII
- Total Students: 4,000+
- Total Faculty: 200+
- Number of Institutes: 4
- Years of Excellence: 40+
- Alumni Network: 20,000+
- Awards Won: 50+
- Board Results: 100%

## Founder
- Late Shri R.K. Choudhary (1929–2005)
- A former Indian Army officer who served in the Royal Corps and witnessed many battles with neighbouring countries. Decorated with many medals, he dedicated his post-military life to education. His core philosophy centred on discipline, education and human values.

## Leadership
- Dr. N.C. Lunayach — Managing Director
- Mr. Kuldeep Singh — Director
- Mrs. Prema Kavia — Principal

## Contact Information
- Address: Grand Sikar Road, Rajawas, Jaipur – 302013, Rajasthan
- Phone: +91-9785500046, +91-9785500048
- Fax: 0141-2231482
- Email: nkps.rajawas@gmail.com, principalnkpsraj@gmail.com
- WhatsApp: +91-9785500046
- Office Hours: Mon–Sat, 9:00 AM – 3:00 PM

## Social Media
- Facebook: https://www.facebook.com/nkpsrajawas
- Instagram: https://www.instagram.com/nkps_rajawas
- YouTube: https://www.youtube.com/channel/UCjXhDycJ_b8dJmfLlYbsM6w

## Administrative Staff
- Mrs. Kavia Prema — Principal
- Gaurav Kumar Mathur — Vice Principal
- Ramavtar Khunteta — Senior Coordinator
- Neelam Pandey — Pre-Primary Coordinator

## PGT (Post Graduate Teachers)
- Jasvindar Singh Bhatiya — Biology
- Vijay Kumar Soni — Chemistry
- Arshad Ali Khan — Accountancy
- Ashutosh Tiwari — Economics
- Shailendra Singh — Physics
- Shivendra Singh Yadav — Physical Education
- Sunil Kumar Bhardwaj — Information Practices
- Pradeep Sharma — History
- Jatirmoy Samadder — Mathematics
- Nisha Sharma — Music
- Indu Sharma — Painting
- Santosh Kanwar — English
- Hemant Kumar Yogi — Political Science

## TGT (Trained Graduate Teachers)
- Neha Rathi — English
- Shubham Aggarwal — Mathematics
- Sunita Bugaliya — Hindi
- Soniya Sharma — Hindi
- Nita Sharma — English
- Priyanka Sharma — Social Science
- Himanshu Kumawat — Science
- Vijaya Sharma — Science
- Rahul Prajapat — Computer Science
- Ramesh Chandra Sharma — Sanskrit
- Sneha Sharma — Science

## PRT (Primary Teachers)
- Khushi Jain — Mathematics
- Poonam Sharma — Staff Secretary
- Usha Rajawat — General
- Vijay Laxmi — Hindi
- Neha Sharma — English
- Sumati Saini — Computer
- Sonu Kumawat — English
- Meenakshi — Hindi
- Shivani Gaur — Mathematics
- Kalpana Negi — Mathematics

## Mother Teachers
- Neha Gautam
- Nitu Sinha
- Mamta Agarwal

## Facilities
- Smart Classrooms: Technology-enabled classrooms with projectors and digital learning aids for an interactive educational experience.
- Science Laboratories: Well-equipped Physics, Chemistry and Biology labs providing hands-on learning opportunities.
- Computer Lab: Modern computer lab with high-speed internet and latest software for digital literacy and programming skills.
- Library: A vast collection of over 10,000 books, periodicals and digital resources.
- Sports Grounds: Expansive playgrounds with facilities for cricket, football, basketball, athletics and more.
- Auditorium: State-of-the-art auditorium for cultural events, annual functions and academic seminars.
- Indoor Games: Dedicated spaces for table tennis, chess, carrom and other indoor recreational activities.
- Transport: Safe and reliable school bus transport covering major routes across Jaipur city.

## Website Pages
- Home: /
- About: /about
- Academics: /academics
- Admissions: /admissions
- Student Life: /student-life
- Facilities: /facilities
- Gallery: /gallery
- Contact: /contact

## Admission Process
1. Enquiry: Visit school or call for information
2. Application: Fill and submit the admission form with required documents
3. Interaction: Student and parent meet with the principal
4. Enrollment: Complete documentation and fee payment
- Admissions are typically open from March each year for the next academic session
- New session usually starts in April
- Documents required: Birth Certificate, Previous School Records, Transfer Certificate, Passport-size photographs, Aadhaar Card copy

## Eligibility
- Nursery: Minimum age 3 years
- LKG: Minimum age 4 years
- UKG: Minimum age 5 years
- Class I onwards: Age-appropriate + Transfer Certificate from previous school

## Academic Structure
- Academic session: April to March
- School timings: Monday to Saturday, 8:00 AM to 2:30 PM
- Medium of instruction: English
- Subjects offered include: English, Hindi, Mathematics, Science, Social Science, Computer Science, Physical Education, Music, Painting, Sanskrit, Economics, Accountancy, History, Political Science, Biology, Chemistry, Physics, Information Practices

## Curriculum
- Primary (Nursery to Class V): Focus on foundational literacy, numeracy, and holistic development
- Middle School (Class VI to VIII): CBSE curriculum with lab-based science and computer education
- Secondary (Class IX-X): Board preparation with Science, Mathematics, Social Science, English, Hindi
- Senior Secondary (Class XI-XII): Streams — Science (PCM/PCB), Commerce, Humanities

## Transport
- School bus service available covering major routes across Jaipur city
- Contact school for specific route details

## Important Rules for Responses
- Only answer questions about NK Public School
- Keep answers concise but informative (2-4 sentences)
- For fee inquiries, direct them to contact the school office
- For specific dates or schedules, provide what you know and suggest confirming with the school office for the latest updates
- Be warm, professional, and welcoming
- Use simple formatting — short paragraphs, no complex markdown
- When asked about something you have information on, give a direct answer first, then offer to help with more details
- Do NOT say "I don't have that information" for things covered above — answer confidently
- If truly unknown, say "For the latest details on that, I'd recommend contacting the school office" rather than "I don't know"
- For mandatory disclosure questions, use the Mandatory Public Disclosure data below and direct users to the /mandatory-public-disclosure page for full details`;

export async function POST(request: NextRequest) {
  try {
    // Anonymous endpoint that pays per-token to Anthropic — must rate limit
    // or a single attacker can rack up real cost. 20 messages / IP / minute
    // is generous for a human chatting and an order of magnitude below
    // anything that would be expensive.
    const ipLimit = rateLimit({
      name: "chat:ip",
      key: clientIp(request),
      max: 20,
      windowSeconds: 60,
    });
    if (!ipLimit.ok) {
      return NextResponse.json(
        {
          reply:
            "You're sending messages too quickly. Please wait a moment and try again.",
        },
        { status: 429 }
      );
    }

    const { message, history } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { reply: "Please send a valid message." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          reply:
            "The chat service is currently unavailable. Please contact the school directly at +91-9785500046 or email nkps.rajawas@gmail.com.",
        },
        { status: 200 }
      );
    }

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content: message });

    // Build dynamic system prompt with disclosure data
    let systemPrompt = BASE_SYSTEM_PROMPT;
    try {
      const { getDisclosureItems, getDisclosureDocuments, getDisclosureBoardResults } =
        await import("@/lib/disclosure");
      const [discItems, discDocs, discResults] = await Promise.all([
        getDisclosureItems(),
        getDisclosureDocuments(),
        getDisclosureBoardResults(),
      ]);

      let disclosureSection = "\n\n## Mandatory Public Disclosure (CBSE)\n";
      disclosureSection += "Full details at: /mandatory-public-disclosure\n";

      const sectionLabels: Record<string, string> = {
        general: "General Information",
        staff: "Staff (Teaching)",
        infrastructure: "School Infrastructure",
        result_academics: "Result & Academics",
      };

      const grouped: Record<string, typeof discItems> = {};
      discItems.forEach((item) => {
        if (!grouped[item.section]) grouped[item.section] = [];
        grouped[item.section].push(item);
      });

      for (const [section, label] of Object.entries(sectionLabels)) {
        const sectionItems = grouped[section];
        if (sectionItems?.length) {
          disclosureSection += `\n### ${label}\n`;
          sectionItems.forEach((item) => {
            if (item.value) disclosureSection += `- ${item.label}: ${item.value}\n`;
          });
        }
      }

      if (discDocs.some((d) => d.file_url)) {
        disclosureSection += "\n### Documents Available for Download\n";
        discDocs.forEach((doc) => {
          disclosureSection += `- ${doc.label}: ${doc.file_url ? "Available on website" : "Not yet uploaded"}\n`;
        });
      }

      if (discResults.length > 0) {
        disclosureSection += "\n### Board Examination Results\n";
        discResults.forEach((r) => {
          disclosureSection += `- Class ${r.exam_class} (${r.academic_year}): ${r.registered} registered, ${r.passed} passed, ${r.pass_percentage}% pass rate${r.remarks ? ` — ${r.remarks}` : ""}\n`;
        });
      }

      systemPrompt += disclosureSection;
    } catch (e) {
      console.error("Failed to load disclosure data for chat:", e);
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages,
    });

    const reply =
      response.content[0].type === "text"
        ? response.content[0].text
        : "I'm sorry, I couldn't generate a response. Please try again.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        reply:
          "I'm having trouble responding right now. Please try again later or contact the school directly at +91-9785500046.",
      },
      { status: 200 }
    );
  }
}
