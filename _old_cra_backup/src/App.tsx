import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/index';
import AboutPage from './pages/about';
import AcademicsPage from './pages/academics';
import AdmissionsPage from './pages/admissions';
import StudentLifePage from './pages/student-life';
import FacilitiesPage from './pages/facilities';
import GalleryPage from './pages/gallery';
import ContactPage from './pages/contact';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/academics" element={<AcademicsPage />} />
        <Route path="/admissions" element={<AdmissionsPage />} />
        <Route path="/student-life" element={<StudentLifePage />} />
        <Route path="/facilities" element={<FacilitiesPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/contact" element={<ContactPage />} />
      </Routes>
    </Router>
  );
}

export default App; 