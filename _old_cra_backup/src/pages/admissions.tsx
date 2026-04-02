import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import AdmissionsSection from '../components/AdmissionsSection';
import Footer from '../components/Footer';

export default function AdmissionsPage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>Admissions - NK Public School</title>
        <meta name="description" content="Learn about the admission process, eligibility criteria, and fee structure at NK Public School." />
      </Helmet>
      <Navbar />
      <div className="pt-20">
        <AdmissionsSection />
      </div>
      <Footer />
    </PageWrapper>
  );
} 