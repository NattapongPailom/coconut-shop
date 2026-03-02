import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell } from 'lucide-react';

interface NotificationProps {
  message: string | null;
  onClose: () => void;
}

export const Notification: React.FC<NotificationProps> = ({ message, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-24 left-0 right-0 z-50 flex justify-center pointer-events-none"
        >
          <div className="bg-coconut-dark text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-4 pointer-events-auto">
            <div className="bg-white/20 p-2 rounded-full animate-pulse">
              <Bell className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
