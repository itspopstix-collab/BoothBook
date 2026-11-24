import React, { useState, useEffect, useMemo } from 'react';
import { AppDatabaseState, FlavorCategory, FlavorRecipe, PosSaleRow } from '../types';
import { generatePromptPayPayload, generateQrDataUrl } from '../services/promptpay';
import { recordPosSaleToSupabase } from '../services/supabase';
import { formatBaht } from '../services/storage';
import {
  ShoppingBag,
  Trash2,
  CheckCircle,
  QrCode,
  Banknote,
  Plus,
  RefreshCw,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface PosCashierViewProps {
  state: AppDatabaseState;
  onRecordSale: (sale: PosSaleRow) => void;
  promptPayNumber?: string;
}

interface CartItem {
  id: string;
  type: 'gelato';
  cups: number; // 1 or 2 flavors
  flavors: { name: string; category: FlavorCategory; image?: string }[];
  price: number;
}

const PRICE_TABLE: Record<string, Record<string, number>> = {
  g1: { Original: 79, Premium: 89, Signature: 99 },
  g2: { Original: 40, Premium: 45, Signature: 50 },
};

export const PosCashierView: React.FC<PosCashierViewProps> = ({
  state,
  onRecordSale,
  promptPayNumber = '0812345678',
}) => {
  const [flavorsPerCup, setFlavorsPerCup] = useState<1 | 2>(1);
  const [selectedPicks, setSelectedPicks] = useState<
    { name: string; category: FlavorCategory; image?: string }[]
  >([]);

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

  // รายการสินค้าจากฐานข้อมูลจริง
  const availableFlavors = useMemo(() => {
    return state.recipes.map((r) => ({
      name: r.name,
      category: (r.category as FlavorCategory) || 'Original',
      image: r.image,
    }));
  }, [state.recipes]);

  // หมวดหมู่สินค้าสร้างแบบไดนามิกจากข้อมูลสินค้าจริง (ไม่ฝัง master data)
  const categories = useMemo(() => {
    const set = new Set<string>();
    availableFlavors.forEach((f) => set.add(f.category || 'ทั่วไป'));
    return Array.from(set);
  }, [availableFlavors]);

  const requiredCount = flavorsPerCup;

  const currentItemPrice = useMemo(() => {
    if (selectedPicks.length === 0) return 0;
    if (flavorsPerCup === 1) {
      const cat = selectedPicks[0]?.category || 'Original';
      return PRICE_TABLE.g1[cat] || 89;
    }
    return selectedPicks.reduce((sum, p) => sum + (PRICE_TABLE.g2[p.category] || 45), 0);
  }, [flavorsPerCup, selectedPicks]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price, 0);
  }, [cart]);

  // Generate PromptPay QR when in QR mode
  useEffect(() => {
    if (payMethod === 'qr' && cartTotal > 0 && promptPayNumber) {
      const payload = generatePromptPayPayload(promptPayNumber, cartTotal);
      generateQrDataUrl(payload).then(setQrImageUrl).catch(console.error);
    } else {
      setQrImageUrl('');
    }
  }, [payMethod, cartTotal, promptPayNumber]);

  const handleToggleFlavor = (flavor: { name: string; category: FlavorCategory; image?: string }) => {
    const existingIdx = selectedPicks.findIndex((p) => p.name === flavor.name);
    if (existingIdx >= 0) {
      setSelectedPicks((prev) => prev.filter((_, idx) => idx !== existingIdx));
    } else {
      if (selectedPicks.length >= requiredCount) {
        setSelectedPicks([flavor]);
      } else {
        setSelectedPicks((prev) => [...prev, flavor]);
      }
    }
  };

  const handleAddToCart = () => {
    if (selectedPicks.length !== requiredCount) return;

    const newItem: CartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'gelato',
      cups: flavorsPerCup,
      flavors: [...selectedPicks],
      price: currentItemPrice,
    };

    setCart((prev) => [...prev, newItem]);
    setSelectedPicks([]);
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

      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const saleRow: PosSaleRow = {
          id: `pos-${activeEvent.id}-${Date.now()}-${i}`,
          orderId: orderBatchId,
          date: dateStr,
          time: timeStr,
          type: item.type,
          flavorsPerCup: item.cups,
          flavor1: item.flavors[0]?.name || '',
          flavor2: item.flavors[1]?.name || '',
          category1: item.flavors[0]?.category || 'Original',
          category2: item.flavors[1]?.category || '',
          payment: payMethod === 'qr' ? 'QR' : 'Cash',
          amount: item.price,
          discountAmount: 0,
        };

        // 1. เรียก callback อัปเดต state รวม
        onRecordSale(saleRow);

        // 2. ยิงบันทึกลง Supabase ตาราง pos_sales ทันที
        await recordPosSaleToSupabase(saleRow, activeEvent.id);
      }

      setSuccessToast(`บันทึกคำสั่งซื้อ #${orderBatchId} เรียบร้อย (${formatBaht(cartTotal)})`);
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
              อีเวนต์ปัจจุบัน: <span className="font-bold text-[#118cd1]">{activeEvent.name}</span> · ซิงค์ยอดขายตรงเข้า Supabase ทันที
            </p>
          </div>
        </div>
        {successToast && (
          <div className="bg-[#1a9a5b] text-white text-xs font-bold px-4 py-2 rounded-full shadow-md animate-fade-in flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {successToast}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ซ้าย: เมนูรสชาติและตัวเลือก (8 คอลัมน์) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Controls: Flavors per cup */}
          <div className="bg-white p-4 rounded-2xl border border-[#eae3cf] shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFlavorsPerCup(1);
                  setSelectedPicks((prev) => prev.slice(0, 1));
                }}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                  flavorsPerCup === 1
                    ? 'bg-[#118cd1] text-white shadow-sm'
                    : 'bg-[#fef9ec] text-[#0d3a57] hover:bg-[#f6eed5]'
                }`}
              >
                🍨 1 รสชาติ (1 Scoop)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlavorsPerCup(2);
                }}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                  flavorsPerCup === 2
                    ? 'bg-[#118cd1] text-white shadow-sm'
                    : 'bg-[#fef9ec] text-[#0d3a57] hover:bg-[#f6eed5]'
                }`}
              >
                🍨🍨 2 รสชาติ (2 Scoops)
              </button>
            </div>
          </div>

          {/* Product Selection Grid by Category */}
          <div className="space-y-6">
            {availableFlavors.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-[#eae3cf] p-10 text-center space-y-2">
                <div className="text-sm font-black text-[#0d3a57]">ยังไม่มีรายการสินค้า</div>
                <p className="text-xs text-[#6b8799]">
                  ไปเพิ่มสินค้าและสูตรได้ที่แท็บ <b>"สูตร & สินค้า"</b> เพื่อเริ่มขายหน้าร้าน
                </p>
              </div>
            ) : (
              categories.map((cat) => {
                const catFlavors = availableFlavors.filter((f) => (f.category || 'ทั่วไป') === cat);
                if (catFlavors.length === 0) return null;

                const priceLabel =
                  flavorsPerCup === 1
                    ? formatBaht(PRICE_TABLE.g1[cat] || 89)
                    : `${formatBaht(PRICE_TABLE.g2[cat] || 45)}/scoop`;

              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-extrabold text-[#0d3a57] text-sm flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#118cd1]" />
                      หมวด {cat}
                    </span>
                    <span className="text-xs font-bold text-[#118cd1] bg-[#118cd1]/10 px-2.5 py-0.5 rounded-full">
                      {priceLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {catFlavors.map((fl) => {
                      const pickIdx = selectedPicks.findIndex((p) => p.name === fl.name);
                      const isPicked = pickIdx >= 0;

                      return (
                        <button
                          key={fl.name}
                          type="button"
                          onClick={() => handleToggleFlavor(fl)}
                          className={`relative text-left p-3 rounded-2xl border transition-all duration-150 flex flex-col justify-between ${
                            isPicked
                              ? 'border-[#118cd1] bg-[#118cd1]/5 ring-2 ring-[#118cd1] shadow-sm'
                              : 'border-[#eae3cf] bg-white hover:border-[#118cd1]/40 shadow-sm'
                          }`}
                        >
                          {isPicked && (
                            <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#118cd1] text-white text-xs font-black flex items-center justify-center shadow">
                              {flavorsPerCup === 2 ? pickIdx + 1 : '✓'}
                            </span>
                          )}

                          <div className="w-full aspect-square rounded-xl bg-[#90d4ec]/20 mb-2 overflow-hidden flex items-center justify-center">
                            {fl.image ? (
                              <img
                                src={fl.image}
                                alt={fl.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-3xl">🍨</span>
                            )}
                          </div>

                          <div>
                            <div className="font-bold text-xs text-[#0d3a57] line-clamp-2 leading-tight">
                              {fl.name}
                            </div>
                            <span className="inline-block mt-1 text-[10px] font-bold text-[#6b8799] bg-[#fef9ec] px-1.5 py-0.5 rounded">
                              {fl.category}
                            </span>
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

          {/* Bottom Dock Bar for adding to cart */}
          <div className="sticky bottom-4 z-10 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-[#eae3cf] shadow-xl flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-[#6b8799]">
                เลือกรสชาติ: <b className="text-[#0d3a57]">{selectedPicks.length}/{requiredCount}</b>
              </div>
              <div className="text-sm font-bold text-[#0d3a57] truncate max-w-xs sm:max-w-md">
                {selectedPicks.length > 0
                  ? selectedPicks.map((p) => p.name).join(' + ')
                  : `กรุณาเลือกรสชาติ ${requiredCount} รส`}
              </div>
            </div>

            <button
              type="button"
              disabled={selectedPicks.length !== requiredCount}
              onClick={handleAddToCart}
              className={`px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 transition-all ${
                selectedPicks.length === requiredCount
                  ? 'bg-[#118cd1] hover:bg-[#0f7ebc] text-white shadow-md active:scale-95'
                  : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
              }`}
            >
              <Plus className="w-4 h-4" />
              ใส่ตะกร้า {selectedPicks.length === requiredCount && `(${formatBaht(currentItemPrice)})`}
            </button>
          </div>
        </div>

        {/* ขวา: ตะกร้าและคิดเงิน (4 คอลัมน์) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-[#eae3cf] shadow-sm space-y-5 sticky top-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#eae3cf]">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#118cd1]" />
              <h2 className="font-black text-[#0d3a57]">บิลคำสั่งซื้อ (Order)</h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> ล้างบิล
              </button>
            )}
          </div>

          {/* Cart items list */}
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#6b8799]">
                ยังไม่มีรายการในตะกร้า
                <br />
                แตะเลือกรสชาติและกด "ใส่ตะกร้า"
              </div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-[#fef9ec]/60 border border-[#eae3cf]/60"
                >
                  <div className="text-xs space-y-0.5">
                    <span className="font-bold text-[#0d3a57]">
                      🍨 Gelato ({item.cups} รส)
                    </span>
                    <div className="text-[#6b8799] line-clamp-1">
                      {item.flavors.map((f) => f.name).join(' + ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-[#0d3a57]">
                      {formatBaht(item.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-rose-500 p-0.5"
                    >
                      ×
                    </button>
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
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                  payMethod === 'qr'
                    ? 'bg-[#118cd1] text-white shadow-sm'
                    : 'bg-[#fef9ec] text-[#0d3a57] hover:bg-[#f6eed5]'
                }`}
              >
                <QrCode className="w-4 h-4" /> สแกน QR (PromptPay)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMethod('cash');
                  setCashReceived(cartTotal);
                }}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                  payMethod === 'cash'
                    ? 'bg-[#118cd1] text-white shadow-sm'
                    : 'bg-[#fef9ec] text-[#0d3a57] hover:bg-[#f6eed5]'
                }`}
              >
                <Banknote className="w-4 h-4" /> เงินสด (Cash)
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
                    className="flex-1 py-1 text-[11px] font-bold bg-white border border-[#eae3cf] rounded-lg text-[#0d3a57] hover:bg-gray-50"
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
                <p className="text-xs text-[#6b8799]">กรุณาระบุเบอร์พร้อมเพย์ในหน้าตั้งค่า</p>
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
            className={`w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
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
