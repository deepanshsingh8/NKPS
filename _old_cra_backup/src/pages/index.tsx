import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import AboutSection from '../components/AboutSection';
import Footer from '../components/Footer';

export default function HomePage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>NK Public School - Home</title>
        <meta name="description" content="NK Public School - Empowering young minds with holistic education and modern facilities" />
      </Helmet>
      <Navbar />
      <HeroSection />
      <AboutSection />
      <Footer />
    </PageWrapper>
  );
} 