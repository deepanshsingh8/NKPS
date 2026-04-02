import React from 'react';
import { Helmet } from 'react-helmet';
import PageWrapper from '../components/PageWrapper';
import Navbar from '../components/Navbar';
import ContactForm from '../components/ContactForm';
import Footer from '../components/Footer';

export default function ContactPage() {
  return (
    <PageWrapper>
      <Helmet>
        <title>Contact Us - NK Public School</title>
        <meta name="description" content="Reach out to NK Public School. We'd love to hear from you!" />
      </Helmet>
      <Navbar />
      <div className="pt-20">
        <ContactForm />
      </div>
      <Footer />
    </PageWrapper>
  );
} 