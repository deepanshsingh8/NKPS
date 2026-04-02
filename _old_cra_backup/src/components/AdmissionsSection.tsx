import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CheckCircle, Download, HelpCircle } from 'lucide-react';

type AdmissionStepProps = {
  number: string;
  title: string;
  description: string;
};

const AdmissionStep: React.FC<AdmissionStepProps> = ({ number, title, description }) => (
  <div className="flex items-start">
    <div className="flex-shrink-0 w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold mr-4">
      {number}
    </div>
    <div>
      <h3 className="text-xl font-playfair font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  </div>
);

export default function AdmissionsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  return (
    <section className="bg-gradient-to-b from-white to-blue-50 py-16 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          ref={ref}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
          className="text-center mb-12"
        >
          <motion.h2 
            variants={itemVariants}
            className="text-3xl md:text-4xl font-playfair font-bold text-gray-800 mb-4"
          >
            Admissions
          </motion.h2>
          <motion.div 
            variants={itemVariants}
            className="w-20 h-1 bg-primary mx-auto mb-6"
          ></motion.div>
          <motion.p 
            variants={itemVariants}
            className="text-gray-600 max-w-3xl mx-auto"
          >
            Begin your journey with NK Public School through our simple admissions process.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            <motion.h3 
              variants={itemVariants}
              className="text-2xl font-playfair font-bold text-gray-800 mb-6"
            >
              Admission Process
            </motion.h3>
            
            <div className="space-y-8">
              <motion.div variants={itemVariants}>
                <AdmissionStep 
                  number="1" 
                  title="Application Submission" 
                  description="Complete the online application form and submit the required documents."
                />
              </motion.div>
              
              <motion.div variants={itemVariants}>
                <AdmissionStep 
                  number="2" 
                  title="Entrance Assessment" 
                  description="Students undergo an age-appropriate assessment to evaluate their academic readiness."
                />
              </motion.div>
              
              <motion.div variants={itemVariants}>
                <AdmissionStep 
                  number="3" 
                  title="Parent-Student Interview" 
                  description="A brief interaction with the school leaders to understand mutual expectations."
                />
              </motion.div>
              
              <motion.div variants={itemVariants}>
                <AdmissionStep 
                  number="4" 
                  title="Admission Confirmation" 
                  description="Selected students receive an offer letter and proceed with the enrollment process."
                />
              </motion.div>
            </div>
            
            <motion.div 
              variants={itemVariants}
              className="mt-8"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center px-6 py-3 bg-primary text-white rounded-full shadow-md hover:bg-indigo-700 transition-all"
              >
                <Download className="mr-2" size={18} /> Download Application Form
              </motion.button>
            </motion.div>
          </motion.div>
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            <motion.div 
              variants={itemVariants}
              className="bg-white rounded-xl shadow-md overflow-hidden p-6 mb-8"
            >
              <h3 className="text-2xl font-playfair font-bold text-gray-800 mb-4">Eligibility Criteria</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle className="text-primary flex-shrink-0 mr-2 mt-1" size={18} />
                  <span className="text-gray-600">Age appropriate for the grade as per school policy</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="text-primary flex-shrink-0 mr-2 mt-1" size={18} />
                  <span className="text-gray-600">Successful completion of previous academic year</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="text-primary flex-shrink-0 mr-2 mt-1" size={18} />
                  <span className="text-gray-600">Performance in entrance assessment</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="text-primary flex-shrink-0 mr-2 mt-1" size={18} />
                  <span className="text-gray-600">Alignment with school's educational philosophy</span>
                </li>
              </ul>
            </motion.div>
            
            <motion.div 
              variants={itemVariants}
              className="bg-white rounded-xl shadow-md overflow-hidden p-6"
            >
              <h3 className="text-2xl font-playfair font-bold text-gray-800 mb-4">Fee Structure</h3>
              <p className="text-gray-600 mb-4">Our fee structure is designed to be transparent and comprehensive, covering all essential educational needs.</p>
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-2 px-4 font-medium">Fee Component</th>
                    <th className="py-2 px-4 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-2 px-4">Application Fee</td>
                    <td className="py-2 px-4">₹2,000</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4">Admission Fee</td>
                    <td className="py-2 px-4">₹25,000</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4">Tuition Fee (Quarterly)</td>
                    <td className="py-2 px-4">₹30,000 - ₹45,000</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4 flex items-center text-sm text-gray-500">
                <HelpCircle size={16} className="mr-1" />
                <span>For detailed fee structure, please download the brochure</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
} 