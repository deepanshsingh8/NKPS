import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <motion.nav 
      className="bg-white shadow-sm fixed w-full z-50"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <span className="font-playfair text-2xl font-bold text-primary">NK Public School</span>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="font-medium text-gray-700 hover:text-primary transition-colors">Home</Link>
            <Link to="/about" className="font-medium text-gray-700 hover:text-primary transition-colors">About</Link>
            <Link to="/academics" className="font-medium text-gray-700 hover:text-primary transition-colors">Academics</Link>
            <Link to="/admissions" className="font-medium text-gray-700 hover:text-primary transition-colors">Admissions</Link>
            <Link to="/student-life" className="font-medium text-gray-700 hover:text-primary transition-colors">Student Life</Link>
            <Link to="/facilities" className="font-medium text-gray-700 hover:text-primary transition-colors">Facilities</Link>
            <Link to="/gallery" className="font-medium text-gray-700 hover:text-primary transition-colors">Gallery</Link>
            <Link to="/contact" className="font-medium text-gray-700 hover:text-primary transition-colors">Contact</Link>
            <Link to="/erp" className="px-4 py-2 bg-primary text-white rounded-lg shadow hover:bg-indigo-700 transition-all">Login to ERP</Link>
          </div>
          
          <div className="md:hidden flex items-center">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-primary focus:outline-none"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isOpen && (
        <motion.div 
          className="md:hidden"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white shadow-md">
            <Link to="/" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">Home</Link>
            <Link to="/about" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">About</Link>
            <Link to="/academics" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">Academics</Link>
            <Link to="/admissions" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">Admissions</Link>
            <Link to="/student-life" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">Student Life</Link>
            <Link to="/facilities" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">Facilities</Link>
            <Link to="/gallery" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">Gallery</Link>
            <Link to="/contact" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50">Contact</Link>
            <Link to="/erp" className="block px-3 py-2 bg-primary text-white rounded-lg shadow">Login to ERP</Link>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
} 