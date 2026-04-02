import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import AboutSection from '../components/AboutSection';
import Footer from '../components/Footer';

export default function AboutPage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>About Us - NK Public School</title>
        <meta name="description" content="Learn about NK Public School's history, mission, vision, and our commitment to excellence in education." />
      </Helmet>
      <Navbar />
      <div className="pt-20">
        <AboutSection />
      </div>
      <Footer />
    </PageWrapper>
  );
} 