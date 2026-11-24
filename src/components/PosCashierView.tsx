import React, { useState, useEffect, useMemo } from 'react';
import { AppDatabaseState, PosSaleRow } from '../types';
import { getRecipeSellingPrice } from '../services/fifoEngine';
import { generatePromptPayPayload, generateQrDataUrl } from '../services/promptpay';
import { getActiveBackend, queuePosSaleAndSync } from '../services/offlineSync';
import { formatBaht } from '../services/storage';
import {
  ShoppingBag,
  Trash2,
  CheckCircle,
  QrCode,
  Banknote,
  Plus,
  Minus,
  RefreshCw,
  Tag,
  Package,
} from 'lucide-react';

interface PosCashierViewProps {
  state: AppDatabaseState;
  onRecordSale: (sale: PosSaleRow) => void;
  promptPayNumber?: string;
  onPendingChange?: (pendingCount: number) => void;
}

interface CartItem {
  id: string;
  productId: string;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
}

export const PosCashierView: React.FC<PosCashierViewProps> = ({
  state,
  onRecordSale,
  promptPayNumber = '',
  onPendingChange,
}) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payMethod, setPayMethod] = useState<'cash' | 'qr'>('qr');
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const activeEvent = useMemo(() => {
    return (
      state.events.find((e) => e.status === 'active') ||
      state.events[0] || { id: 'ev-default', name: 'ยังไม่ได้สร้างอีเวนต์', posSales: [] }
    );
  }, [state.events]);

  const products = useMemo(() => {
    return state.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category || 'ทั่วไป',
      price: getRecipeSellingPrice(r),
      unitLabel: r.unitLabel || 'ชิ้น',
      image: r.image,
    }));
  }, [state.recipes]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [products]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  }, [cart]);

  const totalItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  useEffect(() => {
    if (payMethod === 'qr' && cartTotal > 0 && promptPayNumber) {
      const payload = generatePromptPayPayload(promptPayNumber, cartTotal);
      generateQrDataUrl(payload).then(setQrImageUrl).catch(console.error);
    } else {
      setQrImageUrl('');
    }
  }, [payMethod, cartTotal, promptPayNumber]);

  const handleAddProduct = (prod: (typeof products)[number]) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === prod.id);
      if (existing) {
        return prev.map((c) => (c.productId === prod.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [
        ...prev,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productId: prod.id,
          name: prod.name,
          category: prod.category,
          unitPrice: prod.price,
          qty: 1,
        },
      ];
    });
  };

  const handleChangeQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.productId === productId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const handleConfirmOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toLocaleTimeString('en-GB');
      const orderBatchId = `${dateStr.replace(/-/g, '').slice(2)}-${String(
        (activeEvent.posSales?.length || 0) + 1
      ).padStart(3, '0')}`;

      let seq = 0;
      let allSynced = true;
      let latestPending = 0;
      for (const item of cart) {
        for (let q = 0; q < item.qty; q++) {
          const saleRow: PosSaleRow = {
            id: `pos-${activeEvent.id}-${Date.now()}-${seq++}`,
            orderId: orderBatchId,
            date: dateStr,
            time: timeStr,
            type: 'item',
            flavorsPerCup: 1,
            flavor1: item.name,
            flavor2: '',
            category1: item.category,
            category2: '',
            payment: payMethod === 'qr' ? 'QR' : 'Cash',
            amount: item.unitPrice,
            discountAmount: 0,
          };

          onRecordSale(saleRow);
          const res = await queuePosSaleAndSync(saleRow, activeEvent.id, state.settings);
          if (!res.syncedNow) allSynced = false;
          latestPending = res.pendingCount;
        }
      }

      onPendingChange?.(latestPending);
      const backendName =
        getActiveBackend(state.settings) === 'google_sheets' ? 'Google Sheets' : 'Supabase';
      setSuccessToast(
        allSynced
          ? `บันทึก #${orderBatchId} เรียบร้อย (${formatBaht(cartTotal)}) · ซิงค์ ${backendName} แล้ว`
          : `บันทึก #${orderBatchId} ลงเครื่องแล้ว (${formatBaht(cartTotal)}) · รอซิงค์เมื่อต่อเน็ต (${latestPending} รายการ)`
      );
      setCart([]);
      setCashReceived(0);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      alert(`เกิดข้อผิดพลาดในการบันทึกคำสั่งซื้อ: ${err?.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#eae3cf] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#118cd1]/10 flex items-center justify-center text-[#118cd1]">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#0d3a57]">แคชเชียร์ขายหน้าร้าน (POS)</h1>
            <p className="text-xs text-[#6b8799]">
              อีเวนต์ปัจจุบัน: <span className="font-bold text-[#118cd1]">{activeEvent.name}</span> · ซิงค์ยอดขายเข้า Supabase อัตโนมัติ
            </p>
          </div>
        </div>
        {successToast && (
          <div className="bg-[#1a9a5b] text-white text-xs font-bold px-4 py-2 rounded-full shadow-md flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {successToast}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ซ้าย: รายการสินค้า (8 คอลัมน์) */}
        <div className="lg:col-span-8 space-y-6">
          {products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-[#eae3cf] p-12 text-center space-y-2">
              <Package className="w-10 h-10 text-[#6b8799]/50 mx-auto" />
              <div className="text-sm font-black text-[#0d3a57]">ยังไม่มีรายการสินค้า</div>
              <p className="text-xs text-[#6b8799]">
                ไปเพิ่มสินค้า ราคาขาย และสูตรต้นทุนได้ที่แท็บ <b>"สูตร & สินค้า"</b> เพื่อเริ่มขายหน้าร้าน
              </p>
            </div>
          ) : (
            categories.map((cat) => {
              const catProducts = products.filter((p) => p.category === cat);
              if (catProducts.length === 0) return null;

              return (
                <div key={cat} className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-extrabold text-[#0d3a57] text-sm flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-[#118cd1]" />
                      {cat}
                    </span>
                    <span className="text-xs font-bold text-[#6b8799]">
                      {catProducts.length} รายการ
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {catProducts.map((prod) => {
                      const inCart = cart.find((c) => c.productId === prod.id);

                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => handleAddProduct(prod)}
                          className={`relative text-left p-3 rounded-2xl border transition-all duration-150 flex flex-col justify-between cursor-pointer active:scale-95 ${
                            inCart
                              ? 'border-[#118cd1] bg-[#118cd1]/5 ring-2 ring-[#118cd1] shadow-sm'
                              : 'border-[#eae3cf] bg-white hover:border-[#118cd1]/50 shadow-sm'
                          }`}
                        >
                          {inCart && (
                            <span className="absolute top-2 right-2 min-w-6 h-6 px-1.5 rounded-full bg-[#118cd1] text-white text-xs font-black flex items-center justify-center shadow">
                              {inCart.qty}
                            </span>
                          )}

                          {prod.image && (
                            <div className="w-full aspect-square rounded-xl bg-[#fef9ec] mb-2 overflow-hidden flex items-center justify-center">
                              <img
                                src={prod.image}
                                alt={prod.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}

                          <div className="space-y-1">
                            <div className="font-bold text-sm text-[#0d3a57] line-clamp-2 leading-tight">
                              {prod.name}
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-sm font-black text-[#118cd1]">
                                {formatBaht(prod.price, 0)}
                              </span>
                              <span className="text-[10px] font-bold text-[#6b8799]">
                                / {prod.unitLabel}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ขวา: ตะกร้าและคิดเงิน (4 คอลัมน์) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-[#eae3cf] shadow-sm space-y-5 sticky top-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#eae3cf]">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#118cd1]" />
              <h2 className="font-black text-[#0d3a57]">
                บิลคำสั่งซื้อ {totalItems > 0 && `(${totalItems})`}
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> ล้างบิล
              </button>
            )}
          </div>

          {/* Cart items list */}
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#6b8799]">
                ยังไม่มีรายการในตะกร้า
                <br />
                แตะที่สินค้าด้านซ้ายเพื่อเพิ่มเข้าบิล
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#fef9ec]/60 border border-[#eae3cf]/60"
                >
                  <div className="min-w-0 flex-1 text-xs space-y-0.5">
                    <div className="font-bold text-[#0d3a57] truncate">{item.name}</div>
                    <div className="text-[11px] text-[#6b8799]">
                      {formatBaht(item.unitPrice, 0)} × {item.qty}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleChangeQty(item.productId, -1)}
                      className="w-6 h-6 rounded-lg bg-white border border-[#eae3cf] flex items-center justify-center text-[#0d3a57] hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center text-xs font-black">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => handleChangeQty(item.productId, 1)}
                      className="w-6 h-6 rounded-lg bg-white border border-[#eae3cf] flex items-center justify-center text-[#0d3a57] hover:bg-[#118cd1]/10 hover:text-[#118cd1] cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="font-black text-xs text-[#0d3a57] w-14 text-right">
                      {formatBaht(item.unitPrice * item.qty, 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div className="pt-3 border-t border-[#eae3cf] flex items-baseline justify-between">
            <span className="text-sm font-bold text-[#6b8799]">ยอดรวมสุทธิ</span>
            <span className="text-2xl font-black text-[#0d3a57]">{formatBaht(cartTotal)}</span>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-[#6b8799]">เลือกช่องทางชำระเงิน</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayMethod('qr')}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  payMethod === 'qr'
                    ? 'bg-[#118cd1] text-white shadow-sm'
                    : 'bg-[#fef9ec] text-[#0d3a57] hover:bg-[#f6eed5]'
                }`}
              >
                <QrCode className="w-4 h-4" /> สแกน QR
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMethod('cash');
                  setCashReceived(cartTotal);
                }}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  payMethod === 'cash'
                    ? 'bg-[#118cd1] text-white shadow-sm'
                    : 'bg-[#fef9ec] text-[#0d3a57] hover:bg-[#f6eed5]'
                }`}
              >
                <Banknote className="w-4 h-4" /> เงินสด
              </button>
            </div>
          </div>

          {/* Cash Payment Box */}
          {payMethod === 'cash' && cartTotal > 0 && (
            <div className="p-3 bg-[#fef9ec] rounded-xl border border-[#eae3cf] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#6b8799]">รับเงินสดมา</span>
                <input
                  type="number"
                  value={cashReceived || ''}
                  onChange={(e) => setCashReceived(Number(e.target.value) || 0)}
                  className="w-24 px-2 py-1 bg-white border border-[#eae3cf] rounded-lg text-right font-black text-sm"
                  placeholder="0"
                />
              </div>

              <div className="flex gap-1.5">
                {[cartTotal, 100, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashReceived(amt)}
                    className="flex-1 py-1 text-[11px] font-bold bg-white border border-[#eae3cf] rounded-lg text-[#0d3a57] hover:bg-gray-50 cursor-pointer"
                  >
                    {amt === cartTotal ? 'พอดี' : `${amt}฿`}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-baseline pt-1 text-xs">
                <span className="font-bold text-[#6b8799]">เงินทอน</span>
                <span
                  className={`font-black text-sm ${
                    cashReceived >= cartTotal ? 'text-[#1a9a5b]' : 'text-rose-500'
                  }`}
                >
                  {cashReceived >= cartTotal
                    ? formatBaht(cashReceived - cartTotal)
                    : `ขาด ${formatBaht(cartTotal - cashReceived)}`}
                </span>
              </div>
            </div>
          )}

          {/* QR Payment Box */}
          {payMethod === 'qr' && cartTotal > 0 && (
            <div className="p-4 bg-white rounded-xl border-2 border-[#118cd1]/20 flex flex-col items-center justify-center space-y-2 text-center">
              {qrImageUrl ? (
                <>
                  <img src={qrImageUrl} alt="PromptPay QR" className="w-44 h-44 rounded-lg shadow-sm" />
                  <p className="text-xs font-bold text-[#0d3a57]">
                    สแกนจ่าย PromptPay: <span className="text-[#118cd1]">{formatBaht(cartTotal)}</span>
                  </p>
                  <p className="text-[10px] text-[#6b8799]">พร้อมเพย์: {promptPayNumber}</p>
                </>
              ) : (
                <p className="text-xs text-[#6b8799]">
                  ยังไม่ได้ตั้งค่าเบอร์พร้อมเพย์ (ไปตั้งค่าได้ที่แท็บ "ตั้งค่า")
                </p>
              )}
            </div>
          )}

          {/* Confirm Button */}
          <button
            type="button"
            disabled={
              cart.length === 0 ||
              isSubmitting ||
              (payMethod === 'cash' && cashReceived < cartTotal)
            }
            onClick={handleConfirmOrder}
            className={`w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              cart.length > 0 &&
              !isSubmitting &&
              (payMethod === 'qr' || cashReceived >= cartTotal)
                ? 'bg-[#1a9a5b] hover:bg-[#15824c] text-white shadow-lg active:scale-98'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> กำลังบันทึกลง Supabase...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" /> ยืนยันการรับเงิน ({formatBaht(cartTotal)})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
