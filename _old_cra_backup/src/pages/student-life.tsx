import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import StudentLifeSection from '../components/StudentLifeSection';
import Footer from '../components/Footer';

export default function StudentLifePage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>Student Life - NK Public School</title>
        <meta name="description" content="Explore the vibrant student life at NK Public School including sports, arts, clubs, events, and student council activities." />
      </Helmet>
      <Navbar />
      <div className="pt-20">
        <StudentLifeSection />
      </div>
      <Footer />
    </PageWrapper>
  );
} 