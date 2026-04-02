import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import AcademicsSection from '../components/AcademicsSection';
import Footer from '../components/Footer';

export default function AcademicsPage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>Academics - NK Public School</title>
        <meta name="description" content="Explore our comprehensive curriculum and academic programs designed to foster intellectual curiosity and a love for learning." />
      </Helmet>
      <Navbar />
      <div className="pt-20">
        <AcademicsSection />
      </div>
      <Footer />
    </PageWrapper>
  );
} 