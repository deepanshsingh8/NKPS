import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { X } from 'lucide-react';

type GalleryImage = {
  id: number;
  src: string;
  alt: string;
  category: string;
};

const galleryImages: GalleryImage[] = [
  { id: 1, src: '/images/gallery-1.jpg', alt: 'Students in classroom', category: 'academics' },
  { id: 2, src: '/images/gallery-2.jpg', alt: 'Annual sports day', category: 'sports' },
  { id: 3, src: '/images/gallery-3.jpg', alt: 'Science exhibition', category: 'academics' },
  { id: 4, src: '/images/gallery-4.jpg', alt: 'Cultural performance', category: 'cultural' },
  { id: 5, src: '/images/gallery-5.jpg', alt: 'Art competition', category: 'arts' },
  { id: 6, src: '/images/gallery-6.jpg', alt: 'School building', category: 'campus' },
  { id: 7, src: '/images/gallery-7.jpg', alt: 'Library', category: 'campus' },
  { id: 8, src: '/images/gallery-8.jpg', alt: 'Cricket match', category: 'sports' },
];

export default function GallerySection() {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [filter, setFilter] = useState<string>('all');
  
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
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } }
  };

  const filteredImages = filter === 'all' 
    ? galleryImages 
    : galleryImages.filter(img => img.category === filter);

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
            Gallery
          </motion.h2>
          <motion.div 
            variants={itemVariants}
            className="w-20 h-1 bg-primary mx-auto mb-6"
          ></motion.div>
          <motion.p 
            variants={itemVariants}
            className="text-gray-600 max-w-3xl mx-auto mb-8"
          >
            Glimpses of life at NK Public School through our vibrant collection of photos.
          </motion.p>
          
          <motion.div 
            variants={itemVariants}
            className="flex flex-wrap justify-center gap-2 mb-8"
          >
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-full ${
                filter === 'all' 
                  ? 'bg-primary text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition-colors`}
            >
              All
            </button>
            <button 
              onClick={() => setFilter('academics')}
              className={`px-4 py-2 rounded-full ${
                filter === 'academics' 
                  ? 'bg-primary text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition-colors`}
            >
              Academics
            </button>
            <button 
              onClick={() => setFilter('sports')}
              className={`px-4 py-2 rounded-full ${
                filter === 'sports' 
                  ? 'bg-primary text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition-colors`}
            >
              Sports
            </button>
            <button 
              onClick={() => setFilter('cultural')}
              className={`px-4 py-2 rounded-full ${
                filter === 'cultural' 
                  ? 'bg-primary text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition-colors`}
            >
              Cultural
            </button>
            <button 
              onClick={() => setFilter('campus')}
              className={`px-4 py-2 rounded-full ${
                filter === 'campus' 
                  ? 'bg-primary text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } transition-colors`}
            >
              Campus
            </button>
          </motion.div>
        </motion.div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          {filteredImages.map((image) => (
            <motion.div 
              key={image.id}
              variants={itemVariants}
              whileHover={{ scale: 1.03 }}
              className="overflow-hidden rounded-xl shadow-md aspect-square cursor-pointer"
              onClick={() => setSelectedImage(image)}
            >
              <img 
                src={image.src} 
                alt={image.alt} 
                className="w-full h-full object-cover transition-transform hover:scale-110 duration-500" 
              />
            </motion.div>
          ))}
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
            View Full Gallery
          </motion.button>
        </motion.div>
      </div>
      
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-[90vh] bg-white rounded-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                className="absolute right-2 top-2 z-10 p-1 bg-white/80 rounded-full hover:bg-white"
                onClick={() => setSelectedImage(null)}
              >
                <X size={24} />
              </button>
              <img 
                src={selectedImage.src} 
                alt={selectedImage.alt} 
                className="w-full h-full object-contain" 
              />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                <p className="text-white font-medium">{selectedImage.alt}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
} 