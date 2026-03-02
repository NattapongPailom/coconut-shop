import React, { useState } from 'react';
import { Order } from '../types';
import { ChevronDown, ChevronUp, CheckCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface CompletedOrdersProps {
  orders: Order[];
}

export const CompletedOrders: React.FC<CompletedOrdersProps> = ({ orders }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (orders.length === 0) return null;

  return (
    <div className="mt-12 bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 bg-stone-50 hover:bg-stone-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-green-100 p-2 rounded-full">
            <CheckCheck className="w-6 h-6 text-green-700" />
          </div>
          <h2 className="text-2xl font-bold text-stone-700">ออเดอร์ที่เสร็จแล้ว (Completed)</h2>
          <span className="bg-stone-200 text-stone-600 px-3 py-1 rounded-full font-bold">
            {orders.length}
          </span>
        </div>
        {isOpen ? <ChevronUp className="w-8 h-8 text-stone-400" /> : <ChevronDown className="w-8 h-8 text-stone-400" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 grid grid-cols-1 gap-4">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 bg-white border border-stone-100 rounded-xl shadow-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-stone-300 w-16">{order.queueNumber}</span>
                    <div>
                      <p className="font-bold text-stone-800 text-lg">
                        {order.items.map(i => `${i.name} x${i.quantity}`).join(', ')}
                      </p>
                      <p className="text-stone-400 text-sm">
                        {order.pickupTime ? `Pickup: ${order.pickupTime}` : 'No pickup time'}
                      </p>
                    </div>
                  </div>
                  <span className="text-green-600 font-bold px-4 py-1 bg-green-50 rounded-full">Done</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
