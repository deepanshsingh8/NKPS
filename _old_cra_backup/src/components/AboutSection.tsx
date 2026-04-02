import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export default function AboutSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  return (
    <section className="bg-gradient-to-b from-white to-blue-50 py-16 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.2
              }
            }
          }}
          className="text-center mb-12"
        >
          <motion.h2 
            variants={cardVariants}
            className="text-3xl md:text-4xl font-playfair font-bold text-gray-800 mb-4"
          >
            About NK Public School
          </motion.h2>
          <motion.div 
            variants={cardVariants}
            className="w-20 h-1 bg-primary mx-auto mb-6"
          ></motion.div>
          <motion.p 
            variants={cardVariants}
            className="text-gray-600 max-w-3xl mx-auto"
          >
            Founded in 1985, NK Public School has been a center of academic excellence and holistic development for over three decades.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <motion.div 
            variants={cardVariants}
            className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-all"
          >
            <div className="h-48 overflow-hidden">
              <img src="/images/about-1.jpg" alt="Our History" className="w-full h-full object-cover transition-transform hover:scale-105 duration-500" />
            </div>
            <div className="p-6">
              <h3 className="text-xl font-playfair font-bold text-gray-800 mb-3">Our History</h3>
              <p className="text-gray-600">Started with a mission to provide quality education to all, our school has grown from a small institution to one of the leading schools in the region.</p>
            </div>
          </motion.div>

          <motion.div 
            variants={cardVariants}
            className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-all"
          >
            <div className="h-48 overflow-hidden">
              <img src="/images/about-2.jpg" alt="Our Vision" className="w-full h-full object-cover transition-transform hover:scale-105 duration-500" />
            </div>
            <div className="p-6">
              <h3 className="text-xl font-playfair font-bold text-gray-800 mb-3">Our Vision</h3>
              <p className="text-gray-600">To be a premier educational institution that nurtures global citizens who are innovative, compassionate and ready for future challenges.</p>
            </div>
          </motion.div>

          <motion.div 
            variants={cardVariants}
            className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-all md:col-span-2 lg:col-span-1"
          >
            <div className="h-48 overflow-hidden">
              <img src="/images/about-3.jpg" alt="Our Mission" className="w-full h-full object-cover transition-transform hover:scale-105 duration-500" />
            </div>
            <div className="p-6">
              <h3 className="text-xl font-playfair font-bold text-gray-800 mb-3">Our Mission</h3>
              <p className="text-gray-600">To provide a stimulating learning environment that enables each child to realize their full potential through a balanced approach to academic excellence and personal growth.</p>
            </div>
          </motion.div>
        </div>

        <motion.div 
          variants={cardVariants}
          className="mt-12 text-center"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-3 bg-primary text-white rounded-full shadow-md hover:bg-indigo-700 transition-all"
          >
            Learn More About Us
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
} 