import type { Metadata } from "next";
import { SCHOOL } from "@nkps/shared/lib/constants";

const DEFAULT_SITE_URL = "https://www.nkpublicschool.com";

function normalizeSiteUrl(raw: string | undefined): string {
  if (!raw || !raw.trim()) return DEFAULT_SITE_URL;
  const trimmed = raw.trim();
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-image`;

// The website layout's title template appends " | NK Public School". A title
// that already names the school would carry the brand twice ("… NK Public
// School Jaipur | NK Public School") and run past the ~60 characters Google
// shows, so such a title opts out of the template.
const NAMES_SCHOOL = /N\.?\s?K\.? Public School|NKPS/i;

export function namesSchool(text: string): boolean {
  return NAMES_SCHOOL.test(text);
}

export function pageTitle(title: string): Metadata["title"] {
  return namesSchool(title) ? { absolute: title } : title;
}

// Google truncates a meta description at roughly 155–160 characters. Cut
// CMS-authored text (article excerpts) at a word boundary instead of letting
// the result page chop it mid-word.
export function snippet(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.\u2013\u2014-]+$/, "") + "\u2026";
}

type BuildMetadataArgs = {
  title: string;
  description: string;
  path: string;
  image?: string;
  noIndex?: boolean;
};

export function buildMetadata({
  title,
  description,
  path,
  image,
  noIndex,
}: BuildMetadataArgs): Metadata {
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const ogImage = image || DEFAULT_OG_IMAGE;

  return {
    title: pageTitle(title),
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "en_IN",
      siteName: SCHOOL.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

const SCHOOL_ID = `${SITE_URL}/#school`;
const ORG_ID = `${SITE_URL}/#organization`;
const PLACE_ID = `${SITE_URL}/#place`;

export const schoolJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["EducationalOrganization", "School"],
      "@id": SCHOOL_ID,
      name: SCHOOL.name,
      alternateName: SCHOOL.shortName,
      description: SCHOOL.description,
      url: SITE_URL,
      logo: `${SITE_URL}/images/logo.png`,
      image: `${SITE_URL}/opengraph-image`,
      foundingDate: String(SCHOOL.founded),
      slogan: SCHOOL.tagline,
      telephone: SCHOOL.phone[0],
      faxNumber: SCHOOL.fax,
      email: SCHOOL.email[0],
      sameAs: [
        SCHOOL.social.facebook,
        SCHOOL.social.instagram,
        SCHOOL.social.youtube,
      ],
      address: {
        "@type": "PostalAddress",
        streetAddress: SCHOOL.address.line1,
        addressLocality: SCHOOL.address.city,
        addressRegion: SCHOOL.address.state,
        postalCode: SCHOOL.address.pin,
        addressCountry: "IN",
      },
      location: { "@id": PLACE_ID },
      areaServed: [
        { "@type": "City", name: "Jaipur" },
        { "@type": "State", name: "Rajasthan" },
        { "@type": "Country", name: "India" },
      ],
      accreditedBy: {
        "@type": "EducationalOrganization",
        name: "Central Board of Secondary Education",
        alternateName: "CBSE",
        url: "https://www.cbse.gov.in",
        identifier: SCHOOL.affiliationNumber,
      },
      identifier: {
        "@type": "PropertyValue",
        propertyID: "CBSE Affiliation Number",
        value: SCHOOL.affiliationNumber,
      },
      numberOfStudents: 4000,
      employee: SCHOOL.leadership.map((l) => ({
        "@type": "Person",
        name: l.name,
        jobTitle: l.designation,
      })),
      founder: {
        "@type": "Person",
        name: SCHOOL.founder.name,
        description: SCHOOL.founder.bio,
      },
    },
    {
      "@type": "LocalBusiness",
      "@id": ORG_ID,
      name: SCHOOL.name,
      image: `${SITE_URL}/opengraph-image`,
      url: SITE_URL,
      telephone: SCHOOL.phone[0],
      email: SCHOOL.email[0],
      priceRange: SCHOOL.priceRange,
      address: {
        "@type": "PostalAddress",
        streetAddress: SCHOOL.address.line1,
        addressLocality: SCHOOL.address.city,
        addressRegion: SCHOOL.address.state,
        postalCode: SCHOOL.address.pin,
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: SCHOOL.geo.lat,
        longitude: SCHOOL.geo.lng,
      },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ],
          opens: "09:00",
          closes: "15:00",
        },
      ],
      sameAs: [
        SCHOOL.social.facebook,
        SCHOOL.social.instagram,
        SCHOOL.social.youtube,
      ],
    },
    {
      "@type": "Place",
      "@id": PLACE_ID,
      name: SCHOOL.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: SCHOOL.address.line1,
        addressLocality: SCHOOL.address.city,
        addressRegion: SCHOOL.address.state,
        postalCode: SCHOOL.address.pin,
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: SCHOOL.geo.lat,
        longitude: SCHOOL.geo.lng,
      },
    },
  ],
};

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path.startsWith("/") ? item.path : `/${item.path}`}`,
    })),
  };
}

export type FaqItem = { q: string; a: string };

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}
