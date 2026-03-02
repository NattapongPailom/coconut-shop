import React from 'react';
import { motion } from 'motion/react';
import { Order, getUrgencyLevel, formatPickupCountdown } from '../types';
import { Clock, CheckCircle, ChefHat, AlertTriangle, MessageCircle, User } from 'lucide-react';

interface OrderCardProps {
  order: Order;
  onUpdateStatus: (id: string, status: Order['status']) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onUpdateStatus }) => {
  const isWaiting = order.status === 'waiting';
  const isMaking = order.status === 'making';
  const isDone = order.status === 'done';

  const urgency = getUrgencyLevel(order.pickupTime);
  const countdown = formatPickupCountdown(order.pickupTime);
  const isUrgent = urgency === 'urgent' || urgency === 'overdue';

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95 },
  };

  // Card border color based on urgency + status
  let borderClass = 'border-amber-200';
  let bgClass = 'bg-white';
  let stripeClass = 'bg-amber-400';

  if (isMaking) {
    borderClass = 'border-blue-300';
    bgClass = 'bg-blue-50';
    stripeClass = 'bg-blue-500';
  } else if (isDone) {
    borderClass = 'border-green-200';
    bgClass = 'bg-green-50';
    stripeClass = 'bg-green-500';
  } else if (isUrgent && isWaiting) {
    borderClass = urgency === 'overdue' ? 'border-red-400' : 'border-orange-400';
    bgClass = urgency === 'overdue' ? 'bg-red-50' : 'bg-orange-50';
    stripeClass = urgency === 'overdue' ? 'bg-red-500' : 'bg-orange-400';
  }

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`
        relative overflow-hidden rounded-3xl border-2 shadow-sm transition-all duration-300
        ${bgClass} ${borderClass}
        ${isUrgent && isWaiting ? 'ring-2 ring-offset-2 ring-orange-300' : ''}
        ${urgency === 'overdue' && isWaiting ? 'ring-red-400 animate-pulse' : ''}
      `}
    >
      {/* Status Stripe */}
      <div className={`h-2 w-full ${stripeClass}`} />

      <div className="p-5 flex flex-col h-full justify-between">

        {/* Top Row: Queue Number & Urgency Badge */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-stone-400 uppercase tracking-wider">
              Queue No.
            </span>
            <span
              className={`text-5xl font-black tracking-tight ${
                isMaking ? 'text-blue-900' : isDone ? 'text-green-700' : 'text-stone-800'
              }`}
            >
              {order.queueNumber}
            </span>
            {/* Source badge */}
            {order.source === 'line' && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full w-fit">
                <MessageCircle className="w-3 h-3" />
                LINE
              </span>
            )}
          </div>

          {/* Pickup Time & Urgency */}
          <div className="flex flex-col items-end gap-2">
            {order.pickupTime && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  urgency === 'overdue'
                    ? 'bg-red-100 border border-red-300'
                    : urgency === 'urgent'
                    ? 'bg-orange-100 border border-orange-300'
                    : 'bg-stone-100 border border-stone-200'
                }`}
              >
                {isUrgent ? (
                  <AlertTriangle
                    className={`w-5 h-5 ${urgency === 'overdue' ? 'text-red-600' : 'text-orange-500'}`}
                  />
                ) : (
                  <Clock className="w-5 h-5 text-stone-500" />
                )}
                <span
                  className={`text-xl font-bold ${
                    urgency === 'overdue'
                      ? 'text-red-700'
                      : urgency === 'urgent'
                      ? 'text-orange-700'
                      : 'text-stone-700'
                  }`}
                >
                  {order.pickupTime}
                </span>
              </div>
            )}

            {/* Countdown */}
            {order.pickupTime && countdown && !isDone && (
              <span
                className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                  urgency === 'overdue'
                    ? 'text-red-700 bg-red-100'
                    : urgency === 'urgent'
                    ? 'text-orange-700 bg-orange-100'
                    : 'text-stone-500 bg-stone-100'
                }`}
              >
                {countdown}
              </span>
            )}
          </div>
        </div>

        {/* Customer Name */}
        {order.customerName && (
          <div className="flex items-center gap-2 mb-3 text-stone-600">
            <User className="w-4 h-4 shrink-0" />
            <span className="text-lg font-semibold truncate">{order.customerName}</span>
          </div>
        )}

        {/* Items List */}
        <div className="flex-grow space-y-3 mb-5">
          {order.items.map((item, idx) => (
            <div
              key={idx}
              className="flex justify-between items-start border-b border-stone-100 pb-2 last:border-0"
            >
              <div className="flex gap-3">
                <div className="bg-stone-200 w-9 h-9 rounded-full flex items-center justify-center text-stone-700 font-bold text-xl shrink-0">
                  {item.quantity}
                </div>
                <div>
                  <p className="text-xl font-bold text-stone-800 leading-tight">
                    {item.name}
                  </p>
                  <p className="text-stone-400 text-sm">
                    {item.unit} × ฿{item.pricePerUnit?.toLocaleString() ?? '—'}
                  </p>
                </div>
              </div>
              <span className="text-stone-600 font-semibold text-lg">
                ฿{item.totalPrice?.toLocaleString() ?? '—'}
              </span>
            </div>
          ))}

          {/* Note */}
          {order.note && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl text-lg font-medium border border-red-100 mt-2">
              📝 {order.note}
            </div>
          )}
        </div>

        {/* Total Price */}
        <div className="flex justify-between items-center mb-4 pt-2 border-t border-stone-100">
          <span className="text-lg font-bold text-stone-600">ยอดรวม</span>
          <span className="text-2xl font-black text-coconut-dark">
            ฿{order.totalPrice.toLocaleString()}
          </span>
        </div>

        {/* Action Buttons — BIG TOUCH TARGETS for elderly */}
        <div className="grid grid-cols-1 gap-3">
          {isWaiting && (
            <button
              onClick={() => onUpdateStatus(order.id, 'making')}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white text-2xl font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-3"
            >
              <ChefHat className="w-8 h-8" />
              เริ่มทำ (Start)
            </button>
          )}

          {isMaking && (
            <button
              onClick={() => onUpdateStatus(order.id, 'done')}
              className="w-full bg-green-600 hover:bg-green-700 active:scale-95 transition-all text-white text-2xl font-bold py-4 rounded-2xl shadow-lg shadow-green-200 flex items-center justify-center gap-3"
            >
              <CheckCircle className="w-8 h-8" />
              เสร็จแล้ว (Done)
            </button>
          )}

          {isDone && (
            <div className="text-center py-2">
              <span className="inline-flex items-center gap-2 text-green-700 font-bold text-xl bg-green-100 px-4 py-2 rounded-full">
                <CheckCircle className="w-6 h-6" />
                เรียบร้อย (Completed)
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
