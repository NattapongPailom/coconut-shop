import React from 'react';
import { Order } from '../types';
import { OrderCard } from './OrderCard';
import { AnimatePresence } from 'motion/react';

interface OrderGridProps {
  orders: Order[];
  title: string;
  onUpdateStatus: (id: string, status: Order['status']) => void;
  emptyMessage?: string;
}

export const OrderGrid: React.FC<OrderGridProps> = ({ orders, title, onUpdateStatus, emptyMessage = "ไม่มีออเดอร์ (No orders)" }) => {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-3xl font-bold text-stone-800 border-l-8 border-coconut-green pl-4">
          {title}
        </h2>
        <span className="bg-stone-200 text-stone-600 px-3 py-1 rounded-full font-bold text-lg">
          {orders.length}
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-stone-200">
          <p className="text-2xl text-stone-400 font-medium">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onUpdateStatus={onUpdateStatus} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
};
