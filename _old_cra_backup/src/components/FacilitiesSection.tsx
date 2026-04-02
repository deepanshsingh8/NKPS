import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  Library, 
  Microscope, 
  Monitor, 
  Music, 
  Utensils, 
  Bus, 
  ShieldCheck,
  Dumbbell
} from 'lucide-react';

type FacilityCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

const FacilityCard: React.FC<FacilityCardProps> = ({ icon, title, description }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-all"
  >
    <div className="p-6">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-xl font-playfair font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  </motion.div>
);

export default function FacilitiesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  const containerVariants = {
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
          variants={containerVariants}
          className="text-center mb-12"
        >
          <motion.h2 
            variants={itemVariants}
            className="text-3xl md:text-4xl font-playfair font-bold text-gray-800 mb-4"
          >
            Our Facilities
          </motion.h2>
          <motion.div 
            variants={itemVariants}
            className="w-20 h-1 bg-primary mx-auto mb-6"
          ></motion.div>
          <motion.p 
            variants={itemVariants}
            className="text-gray-600 max-w-3xl mx-auto"
          >
            State-of-the-art infrastructure designed to provide a conducive learning environment.
          </motion.p>
        </motion.div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<Library size={36} />}
              title="Modern Library"
              description="Extensive collection of books, digital resources, and quiet study areas to foster a love for reading and research."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<Microscope size={36} />}
              title="Science Labs"
              description="Well-equipped physics, chemistry, and biology labs with advanced apparatus for practical learning."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<Monitor size={36} />}
              title="Computer Labs"
              description="State-of-the-art computer labs with latest hardware and software for digital literacy and programming skills."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<Music size={36} />}
              title="Arts & Music"
              description="Dedicated spaces for visual arts, music, dance, and theatre to nurture creativity and artistic expression."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<Dumbbell size={36} />}
              title="Sports Complex"
              description="Indoor and outdoor sports facilities including basketball courts, cricket pitch, swimming pool, and fitness center."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<Utensils size={36} />}
              title="Cafeteria"
              description="Hygienic and spacious cafeteria serving nutritious meals prepared under expert supervision."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<Bus size={36} />}
              title="Transportation"
              description="Fleet of modern, GPS-enabled buses covering all major routes with trained staff for safe commute."
            />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FacilityCard
              icon={<ShieldCheck size={36} />}
              title="Safety & Security"
              description="Comprehensive security systems including CCTV surveillance, trained guards, and strict visitor protocols."
            />
          </motion.div>
        </motion.div>
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="mt-16 bg-white rounded-xl shadow-md overflow-hidden"
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            <motion.div 
              variants={itemVariants}
              className="p-8"
            >
              <h3 className="text-2xl font-playfair font-bold text-gray-800 mb-4">Infrastructure Highlights</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-2"></span>
                  <span className="text-gray-600">Air-conditioned smart classrooms with interactive boards</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-2"></span>
                  <span className="text-gray-600">Multipurpose hall for assemblies and events</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-2"></span>
                  <span className="text-gray-600">Eco-friendly campus with solar power integration</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-2"></span>
                  <span className="text-gray-600">Medical room with qualified nurse and first-aid facilities</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-2"></span>
                  <span className="text-gray-600">Counseling center for emotional and psychological support</span>
                </li>
              </ul>
            </motion.div>
            
            <motion.div 
              variants={itemVariants}
              className="bg-gray-100 flex items-center justify-center p-6"
            >
              <img 
                src="/images/campus-map.jpg" 
                alt="Campus Map" 
                className="rounded-lg shadow-md max-h-80 object-contain" 
              />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
} 