import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { BookOpen, Compass, BrainCircuit, Award } from 'lucide-react';

type SubjectProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

const Subject: React.FC<SubjectProps> = ({ icon, title, description }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all"
  >
    <div className="text-primary mb-4">{icon}</div>
    <h3 className="text-xl font-playfair font-bold text-gray-800 mb-2">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </motion.div>
);

export default function AcademicsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  const sectionVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <section className="bg-gradient-to-b from-blue-50 to-white py-16 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={sectionVariants}
          className="text-center mb-12"
        >
          <motion.h2 
            variants={itemVariants}
            className="text-3xl md:text-4xl font-playfair font-bold text-gray-800 mb-4"
          >
            Academic Excellence
          </motion.h2>
          <motion.div 
            variants={itemVariants}
            className="w-20 h-1 bg-primary mx-auto mb-6"
          ></motion.div>
          <motion.p 
            variants={itemVariants}
            className="text-gray-600 max-w-3xl mx-auto"
          >
            Our comprehensive curriculum is designed to nurture intellectual curiosity and foster a love for learning.
          </motion.p>
        </motion.div>

        <motion.div 
          variants={sectionVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <motion.div variants={itemVariants}>
            <Subject 
              icon={<BookOpen size={36} />} 
              title="Primary Curriculum" 
              description="Building a strong foundation with focus on literacy, numeracy, and essential life skills."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <Subject 
              icon={<Compass size={36} />} 
              title="Middle School" 
              description="Expanding horizons through interdisciplinary learning and critical thinking skills."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <Subject 
              icon={<BrainCircuit size={36} />} 
              title="Senior Secondary" 
              description="Specialized streams preparing students for higher education and future careers."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <Subject 
              icon={<Award size={36} />} 
              title="Co-Curricular" 
              description="Holistic development through arts, sports, and technology-based activities."
            />
          </motion.div>
        </motion.div>

        <motion.div 
          variants={sectionVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="mt-16"
        >
          <motion.h3 
            variants={itemVariants}
            className="text-2xl font-playfair font-bold text-gray-800 mb-8 text-center"
          >
            Our Academic Approach
          </motion.h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.div 
              variants={itemVariants}
              className="bg-white rounded-xl shadow-md overflow-hidden"
            >
              <div className="p-6">
                <h4 className="text-xl font-playfair font-bold text-gray-800 mb-3">Modern Teaching Methodology</h4>
                <p className="text-gray-600">Our experienced faculty employs innovative teaching techniques that blend traditional classroom learning with technological integration, making education engaging and effective.</p>
              </div>
            </motion.div>
            
            <motion.div 
              variants={itemVariants}
              className="bg-white rounded-xl shadow-md overflow-hidden"
            >
              <div className="p-6">
                <h4 className="text-xl font-playfair font-bold text-gray-800 mb-3">Assessment and Growth</h4>
                <p className="text-gray-600">Regular assessments and personalized feedback ensure that each student's progress is monitored, allowing for targeted support and enhancement of learning outcomes.</p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="mt-12 text-center"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-3 bg-primary text-white rounded-full shadow-md hover:bg-indigo-700 transition-all"
          >
            View Academic Calendar
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
} 