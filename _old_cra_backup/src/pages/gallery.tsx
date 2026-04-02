import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import GallerySection from '../components/GallerySection';
import Footer from '../components/Footer';

export default function GalleryPage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>Gallery - NK Public School</title>
        <meta name="description" content="Browse through our collection of photos showcasing life at NK Public School." />
      </Helmet>
      <Navbar />
      <div className="pt-20">
        <GallerySection />
      </div>
      <Footer />
    </PageWrapper>
  );
} 