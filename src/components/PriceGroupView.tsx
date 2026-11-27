import React, { useMemo, useState } from 'react';
import {
  AppDatabaseState,
  FlavorRecipe,
  PriceCategoryOption,
} from '../types';
import {
  getEffectivePriceCategories,
  getRecipeSellingPrice,
} from '../services/fifoEngine';
import { formatBaht } from '../services/storage';
import {
  Tags,
  Plus,
  Trash2,
  Search,
  IceCream,
  Check,
  X,
} from 'lucide-react';

interface Props {
  state: AppDatabaseState;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export const PriceGroupView: React.FC<Props> = ({ state, onUpdateState }) => {
  const allGroups: PriceCategoryOption[] = useMemo(
    () => getEffectivePriceCategories(state.settings.priceCategories),
    [state.settings.priceCategories]
  );

  const [selectedGroupId, setSelectedGroupId] = useState<string>(allGroups[0]?.id || '');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPrice, setNewGroupPrice] = useState('');
  const [newGroupRecipeSearch, setNewGroupRecipeSearch] = useState('');
  const [selectedRecipeIdsForNewGroup, setSelectedRecipeIdsForNewGroup] = useState<string[]>([]);
  const [showAddGroupForm, setShowAddGroupForm] = useState(false);

  // ค้นหาและเลือกสินค้าเพื่อดึงเข้ากลุ่ม
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedRecipeIdsToAdd, setSelectedRecipeIdsToAdd] = useState<string[]>([]);

  const selectedGroup =
    allGroups.find((g) => g.id === selectedGroupId) || allGroups[0];

  const getRecipeGroupId = (r: FlavorRecipe): string | null => {
    if (r.priceCategoryId === 'custom') return null;
    if (r.priceCategoryId && allGroups.some((g) => g.id === r.priceCategoryId)) {
      return r.priceCategoryId;
    }
    const price = getRecipeSellingPrice(r);
    const matched = allGroups.find((g) => g.singlePrice === price);
    return matched ? matched.id : null;
  };

  const recipesInSelectedGroup = useMemo(
    () =>
      state.recipes.filter((r) => getRecipeGroupId(r) === selectedGroup?.id),
    [state.recipes, selectedGroup, allGroups]
  );

  const otherRecipes = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return state.recipes.filter((r) => {
      if (getRecipeGroupId(r) === selectedGroup?.id) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q)
      );
    });
  }, [state.recipes, selectedGroup, assignSearch, allGroups]);

  const filteredRecipesForNewGroup = useMemo(() => {
    const q = newGroupRecipeSearch.trim().toLowerCase();
    if (!q) return state.recipes;
    return state.recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q)
    );
  }, [state.recipes, newGroupRecipeSearch]);

  const toggleRecipeForNewGroup = (recipeId: string) => {
    setSelectedRecipeIdsForNewGroup((prev) =>
      prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
    );
  };

  const handleAddPriceGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    const price = Math.max(0, parseFloat(newGroupPrice) || 0);
    if (!name) return;

    const newId = 'pcat-' + Date.now();
    const selectedSet = new Set(selectedRecipeIdsForNewGroup);
    onUpdateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        priceCategories: [
          ...getEffectivePriceCategories(prev.settings.priceCategories),
          { id: newId, name, singlePrice: price },
        ],
      },
      recipes:
        selectedSet.size > 0
          ? prev.recipes.map((r) =>
              selectedSet.has(r.id)
                ? { ...r, priceCategoryId: newId, sellingPrice: price }
                : r
            )
          : prev.recipes,
    }));
    setSelectedGroupId(newId);
    setNewGroupName('');
    setNewGroupPrice('');
    setNewGroupRecipeSearch('');
    setSelectedRecipeIdsForNewGroup([]);
    setShowAddGroupForm(false);
  };

  const handleDeletePriceGroup = (group: PriceCategoryOption) => {
    if (!window.confirm(`ต้องการลบ Price Group "${group.name}" ใช่หรือไม่? (สินค้าที่อยู่ในกลุ่มนี้จะถูกตั้งราคาเป็น ฿0)`)) return;
    const remainingGroups = allGroups.filter((c) => c.id !== group.id);
    onUpdateState((prev) => {
      const base = getEffectivePriceCategories(prev.settings.priceCategories);
      return {
        ...prev,
        settings: {
          ...prev.settings,
          priceCategories: base.filter((c) => c.id !== group.id),
        },
        recipes: prev.recipes.map((r) => {
          const isInDeletedGroup =
            r.priceCategoryId === group.id ||
            (!r.priceCategoryId && getRecipeSellingPrice(r) === group.singlePrice);
          return isInDeletedGroup
            ? { ...r, priceCategoryId: 'custom', sellingPrice: 0 }
            : r;
        }),
      };
    });
    if (selectedGroupId === group.id) {
      setSelectedGroupId(remainingGroups[0]?.id || '');
    }
  };

  const toggleRecipeToAdd = (recipeId: string) => {
    setSelectedRecipeIdsToAdd((prev) =>
      prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
    );
  };

  const handleConfirmAddSelectedToGroup = () => {
    if (!selectedGroup || selectedRecipeIdsToAdd.length === 0) return;
    const selectedSet = new Set(selectedRecipeIdsToAdd);
    const alreadyGroupedCount = state.recipes.filter(
      (r) => selectedSet.has(r.id) && getRecipeGroupId(r) !== null
    ).length;

    const confirmMsg =
      alreadyGroupedCount > 0
        ? `ยืนยันเพิ่มสินค้า ${selectedRecipeIdsToAdd.length} รายการเข้ากลุ่ม "${selectedGroup.name}" (${formatBaht(selectedGroup.singlePrice)})?\n(มี ${alreadyGroupedCount} รายการที่จะถูกย้ายมาจากกลุ่มราคาเดิม)`
        : `ยืนยันเพิ่มสินค้า ${selectedRecipeIdsToAdd.length} รายการเข้ากลุ่ม "${selectedGroup.name}" (${formatBaht(selectedGroup.singlePrice)})?`;

    if (!window.confirm(confirmMsg)) return;

    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        selectedSet.has(r.id)
          ? {
              ...r,
              priceCategoryId: selectedGroup.id,
              sellingPrice: selectedGroup.singlePrice,
            }
          : r
      ),
    }));
    setSelectedRecipeIdsToAdd([]);
  };

  const handleRemoveRecipeFromGroup = (recipeId: string) => {
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        r.id === recipeId ? { ...r, priceCategoryId: 'custom' } : r
      ),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eae3cf] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-[#0d3a57] flex items-center gap-2">
            <Tags className="w-5 h-5 text-[#118cd1]" />
            จัดการ Price Group &amp; เพิ่มสินค้าตามกลุ่มราคา
          </h2>
          <p className="text-xs text-[#6b8799] mt-0.5">
            สร้างกลุ่มราคาขาย (Price Group) แล้วเลือกเพิ่มสินค้าที่มีอยู่หรือสร้างสินค้าใหม่ให้ใช้ราคานั้นทันที
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddGroupForm((v) => !v)}
          className="shrink-0 inline-flex items-center gap-1.5 bg-[#118cd1] hover:bg-[#0e76b2] text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> เพิ่ม Price Group ใหม่
        </button>
      </div>

      {showAddGroupForm && (
        <form
          onSubmit={handleAddPriceGroup}
          className="bg-white rounded-2xl p-5 shadow-sm border-2 border-[#118cd1]/30 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[#0d3a57]">
              สร้าง Price Group ใหม่
            </h3>
            <button
              type="button"
              onClick={() => setShowAddGroupForm(false)}
              className="text-[#6b8799] hover:text-[#0d3a57]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6b8799] mb-1">
                ชื่อ Price Group *
              </label>
              <input
                type="text"
                placeholder="เช่น Special, โปรโมชั่น, VIP"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:border-[#118cd1]"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6b8799] mb-1">
                ราคาขาย (฿) *
              </label>
              <input
                type="number"
                min={0}
                step="any"
                placeholder="เช่น 109"
                value={newGroupPrice}
                onChange={(e) => setNewGroupPrice(e.target.value)}
                className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-[#118cd1]"
                required
              />
            </div>
          </div>

          {/* Data table เลือกสินค้าเพื่อเพิ่มเข้า Price Group นี้ */}
          <div className="border border-[#eae3cf] rounded-xl overflow-hidden bg-[#fef9ec]/50">
            <div className="p-3 bg-[#fef9ec] border-b border-[#eae3cf] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-[#0d3a57]">
                  เลือกสินค้าเพิ่มเข้า Price Group นี้
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#e8f5fd] text-[#118cd1]">
                  เลือกแล้ว {selectedRecipeIdsForNewGroup.length} รายการ
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#6b8799] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ค้นหาสินค้า..."
                    value={newGroupRecipeSearch}
                    onChange={(e) => setNewGroupRecipeSearch(e.target.value)}
                    className="bg-white border border-[#eae3cf] rounded-lg pl-8 pr-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-[#118cd1]"
                  />
                </div>
                {filteredRecipesForNewGroup.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const visibleIds = filteredRecipesForNewGroup.map((r) => r.id);
                      const allVisibleSelected = visibleIds.every((id) =>
                        selectedRecipeIdsForNewGroup.includes(id)
                      );
                      if (allVisibleSelected) {
                        setSelectedRecipeIdsForNewGroup((prev) =>
                          prev.filter((id) => !visibleIds.includes(id))
                        );
                      } else {
                        setSelectedRecipeIdsForNewGroup((prev) =>
                          Array.from(new Set([...prev, ...visibleIds]))
                        );
                      }
                    }}
                    className="text-[11px] font-bold text-[#118cd1] hover:underline whitespace-nowrap cursor-pointer"
                  >
                    {filteredRecipesForNewGroup.every((r) =>
                      selectedRecipeIdsForNewGroup.includes(r.id)
                    )
                      ? 'ยกเลิกทั้งหมด'
                      : 'เลือกทั้งหมด'}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto bg-white p-3">
              {filteredRecipesForNewGroup.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#6b8799]">
                  ไม่พบสินค้าที่ตรงกับการค้นหา
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {filteredRecipesForNewGroup.map((r) => {
                    const checked = selectedRecipeIdsForNewGroup.includes(r.id);
                    const currentGroup = allGroups.find((g) => g.id === getRecipeGroupId(r));
                    return (
                      <div
                        key={r.id}
                        onClick={() => toggleRecipeForNewGroup(r.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          checked
                            ? 'bg-[#e8f5fd] border-[#118cd1] shadow-xs'
                            : 'bg-[#fef9ec]/60 border-[#eae3cf] hover:border-[#118cd1]/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRecipeForNewGroup(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-[#118cd1] rounded cursor-pointer shrink-0"
                        />
                        {r.image ? (
                          <img
                            src={r.image}
                            alt={r.name}
                            className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#eae3cf]"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[#e8f5fd] text-[#118cd1] flex items-center justify-center shrink-0">
                            <IceCream className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-[#0d3a57] truncate">
                            {r.name}
                          </div>
                          <div className="text-[11px] text-[#6b8799] truncate">
                            {r.category || '-'}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[11px] font-extrabold text-[#118cd1]">
                              เดิม {formatBaht(getRecipeSellingPrice(r))}
                            </span>
                            {currentGroup && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 truncate max-w-full">
                                กลุ่ม: {currentGroup.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddGroupForm(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#6b8799] hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#118cd1] hover:bg-[#0e76b2] text-white cursor-pointer"
            >
              บันทึก Price Group
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ด้านซ้าย: รายการ Price Groups */}
        <div className="w-full lg:w-72 shrink-0 bg-white rounded-2xl p-4 shadow-sm border border-[#eae3cf] space-y-2">
          <div className="text-xs font-bold text-[#6b8799] px-1 mb-2">
            กลุ่มราคาทั้งหมด ({allGroups.length})
          </div>
          {allGroups.map((group) => {
            const count = state.recipes.filter(
              (r) => getRecipeGroupId(r) === group.id
            ).length;
            const isSelected = selectedGroup?.id === group.id;
            return (
              <div
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedRecipeIdsToAdd([]);
                }}
                className={`group flex items-center justify-between gap-2 p-3 rounded-xl border-2 cursor-pointer transition ${
                  isSelected
                    ? 'bg-[#e8f5fd] border-[#118cd1]'
                    : 'bg-[#fef9ec] border-[#eae3cf] hover:border-[#118cd1]/50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-[#0d3a57] truncate">
                      {group.name}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#118cd1] mt-0.5">
                    {formatBaht(group.singlePrice)}
                    {group.halfPrice !== undefined
                      ? ` / ${formatBaht(group.halfPrice)}`
                      : ''}
                    <span className="text-[#6b8799] font-medium ml-2">
                      · {count} สินค้า
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  title={`ลบ Price Group "${group.name}"`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePriceGroup(group);
                  }}
                  className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* ด้านขวา: สินค้าใน Price Group ที่เลือก + เพิ่มสินค้าเข้ากลุ่ม */}
        {selectedGroup && (
          <div className="flex-1 w-full space-y-5">
            {/* การ์ดสินค้าในกลุ่มนี้ */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eae3cf] space-y-4">
              <div>
                <h3 className="text-base font-extrabold text-[#0d3a57] flex items-center gap-2">
                  <span>สินค้าในกลุ่ม &ldquo;{selectedGroup.name}&rdquo;</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#e8f5fd] text-[#118cd1] text-xs font-black">
                    {formatBaht(selectedGroup.singlePrice)}
                  </span>
                </h3>
                <p className="text-xs text-[#6b8799] mt-0.5">
                  มีทั้งหมด {recipesInSelectedGroup.length} รายการที่ใช้ราคากลุ่มนี้
                </p>
              </div>

              {recipesInSelectedGroup.length === 0 ? (
                <div className="bg-[#fef9ec] rounded-xl p-6 text-center text-xs text-[#6b8799] border border-dashed border-[#eae3cf]">
                  ยังไม่มีสินค้าในกลุ่มราคา &ldquo;{selectedGroup.name}&rdquo; —
                  เลือกติ๊กสินค้าจากรายการด้านล่างแล้วกด Add เพื่อเพิ่มเข้ากลุ่ม
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {recipesInSelectedGroup.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-[#fef9ec] border border-[#eae3cf]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {r.image ? (
                          <img
                            src={r.image}
                            alt={r.name}
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#eae3cf]"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#e8f5fd] text-[#118cd1] flex items-center justify-center shrink-0">
                            <IceCream className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs text-[#0d3a57] truncate">
                            {r.name}
                          </div>
                          <div className="text-[11px] text-[#6b8799] truncate">
                            {r.category} · {formatBaht(getRecipeSellingPrice(r))}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        title="นำออกจาก Price Group นี้ (เปลี่ยนเป็นระบุราคาเอง)"
                        onClick={() => handleRemoveRecipeFromGroup(r.id)}
                        className="p-1.5 rounded-lg text-[#6b8799] hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ดึงสินค้าที่มีอยู่แล้วเข้า Price Group นี้ (ติ๊กเลือกแล้วกด Add) */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eae3cf] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-extrabold text-[#0d3a57]">
                    เพิ่มสินค้าที่มีอยู่เข้ากลุ่ม &ldquo;{selectedGroup.name}&rdquo;
                  </h4>
                  {selectedRecipeIdsToAdd.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#e8f5fd] text-[#118cd1]">
                      เลือกแล้ว {selectedRecipeIdsToAdd.length} รายการ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-3.5 h-3.5 text-[#6b8799] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อสินค้าหรือหมวดหมู่..."
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      className="w-full bg-[#fef9ec] border border-[#eae3cf] rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#118cd1]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={selectedRecipeIdsToAdd.length === 0}
                    onClick={handleConfirmAddSelectedToGroup}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      selectedRecipeIdsToAdd.length > 0
                        ? 'bg-[#118cd1] hover:bg-[#0e76b2] text-white cursor-pointer shadow-xs'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Add ({selectedRecipeIdsToAdd.length})
                  </button>
                </div>
              </div>

              {otherRecipes.length === 0 ? (
                <div className="text-xs text-[#6b8799] py-4 text-center">
                  ไม่พบสินค้าอื่นที่สามารถเพิ่มได้
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {otherRecipes.map((r) => {
                    const checked = selectedRecipeIdsToAdd.includes(r.id);
                    const currentGroup = allGroups.find((g) => g.id === getRecipeGroupId(r));
                    return (
                      <div
                        key={r.id}
                        onClick={() => toggleRecipeToAdd(r.id)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition cursor-pointer select-none ${
                          checked
                            ? 'bg-[#e8f5fd] border-[#118cd1] shadow-xs'
                            : 'bg-[#fef9ec] hover:bg-[#e8f5fd]/40 border-[#eae3cf] hover:border-[#118cd1]/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRecipeToAdd(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-[#118cd1] rounded cursor-pointer shrink-0"
                        />
                        {r.image ? (
                          <img
                            src={r.image}
                            alt={r.name}
                            className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#eae3cf]"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[#e8f5fd] text-[#118cd1] flex items-center justify-center shrink-0">
                            <IceCream className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-[#0d3a57] truncate">
                            {r.name}
                          </div>
                          <div className="text-[11px] text-[#6b8799] truncate">
                            {r.category} · เดิม {formatBaht(getRecipeSellingPrice(r))}
                          </div>
                          {currentGroup && (
                            <div className="mt-0.5">
                              <span className="inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 truncate max-w-full">
                                อยู่ในกลุ่ม: {currentGroup.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
