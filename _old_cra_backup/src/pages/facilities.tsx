import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import FacilitiesSection from '../components/FacilitiesSection';
import Footer from '../components/Footer';

export default function FacilitiesPage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>Facilities - NK Public School</title>
        <meta name="description" content="Discover our state-of-the-art facilities designed to provide a conducive learning environment at NK Public School." />
      </Helmet>
      <Navbar />
      <div className="pt-20">
        <FacilitiesSection />
      </div>
      <Footer />
    </PageWrapper>
  );
} 