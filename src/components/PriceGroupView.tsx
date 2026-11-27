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
  PackagePlus,
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

  // ค้นหาสินค้าเพื่อดึงเข้ากลุ่ม
  const [assignSearch, setAssignSearch] = useState('');
  // สร้างสินค้าใหม่ในกลุ่มราคานี้เลย
  const [showCreateProductForm, setShowCreateProductForm] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Ice Cream');
  const [newProdUnit, setNewProdUnit] = useState('ชิ้น');

  const selectedGroup =
    allGroups.find((g) => g.id === selectedGroupId) || allGroups[0];

  const existingCategories = useMemo(() => {
    const set = new Set<string>(['Ice Cream', 'กาแฟ', 'ชา & นม', 'เบเกอรี่']);
    state.recipes.forEach((r) => {
      if (r.category?.trim()) set.add(r.category.trim());
    });
    return Array.from(set);
  }, [state.recipes]);

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

  const handleAssignRecipeToGroup = (recipeId: string, group: PriceCategoryOption) => {
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        r.id === recipeId
          ? {
              ...r,
              priceCategoryId: group.id,
              sellingPrice: group.singlePrice,
            }
          : r
      ),
    }));
  };

  const handleRemoveRecipeFromGroup = (recipeId: string) => {
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        r.id === recipeId ? { ...r, priceCategoryId: 'custom' } : r
      ),
    }));
  };

  const handleCreateProductInGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !newProdName.trim()) return;
    const newRecipe: FlavorRecipe = {
      id: 'flav-' + Date.now(),
      name: newProdName.trim(),
      category: newProdCategory.trim() || 'Ice Cream',
      sellingPrice: selectedGroup.singlePrice,
      priceCategoryId: selectedGroup.id,
      unitLabel: newProdUnit.trim() || 'ชิ้น',
      mode: 'per_cup',
      batchYieldCups: 1,
      gramsPerCup: 80,
      gramsPerHalfCup: 40,
      halfScoopRatio: 0.5,
      ingredients: [],
    };
    onUpdateState((prev) => ({
      ...prev,
      recipes: [...prev.recipes, newRecipe],
    }));
    setNewProdName('');
    setShowCreateProductForm(false);
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
                    return (
                      <div
                        key={r.id}
                        onClick={() => toggleRecipeForNewGroup(r.id)}
                        className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition select-none ${
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
                          className="w-4 h-4 mt-0.5 accent-[#118cd1] rounded cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-[#0d3a57] truncate">
                            {r.name}
                          </div>
                          <div className="text-[11px] text-[#6b8799] truncate">
                            {r.category || '-'}
                          </div>
                          <div className="text-[11px] font-extrabold text-[#118cd1] mt-0.5">
                            เดิม {formatBaht(getRecipeSellingPrice(r))}
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
                onClick={() => setSelectedGroupId(group.id)}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                <button
                  type="button"
                  onClick={() => setShowCreateProductForm((v) => !v)}
                  className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  <PackagePlus className="w-4 h-4" /> สร้างสินค้าใหม่ในกลุ่มนี้
                </button>
              </div>

              {showCreateProductForm && (
                <form
                  onSubmit={handleCreateProductInGroup}
                  className="bg-[#fef9ec] rounded-xl p-4 border border-[#eae3cf] space-y-3"
                >
                  <div className="text-xs font-extrabold text-[#0d3a57]">
                    สร้างสินค้าใหม่ (ราคาเริ่มต้น {formatBaht(selectedGroup.singlePrice)})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="ชื่อสินค้า *"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      className="bg-white border border-[#eae3cf] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#118cd1]"
                      required
                      autoFocus
                    />
                    <select
                      value={newProdCategory}
                      onChange={(e) => setNewProdCategory(e.target.value)}
                      className="bg-white border border-[#eae3cf] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#118cd1]"
                    >
                      {existingCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="หน่วยขาย (เช่น ชิ้น, แก้ว)"
                      value={newProdUnit}
                      onChange={(e) => setNewProdUnit(e.target.value)}
                      className="bg-white border border-[#eae3cf] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#118cd1]"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateProductForm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#6b8799] hover:bg-white"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      สร้าง &amp; เพิ่มเข้ากลุ่ม
                    </button>
                  </div>
                </form>
              )}

              {recipesInSelectedGroup.length === 0 ? (
                <div className="bg-[#fef9ec] rounded-xl p-6 text-center text-xs text-[#6b8799] border border-dashed border-[#eae3cf]">
                  ยังไม่มีสินค้าในกลุ่มราคา &ldquo;{selectedGroup.name}&rdquo; —
                  เลือกเพิ่มจากรายการด้านล่าง หรือกด &ldquo;+ สร้างสินค้าใหม่ในกลุ่มนี้&rdquo;
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

            {/* ดึงสินค้าที่มีอยู่แล้วเข้า Price Group นี้ */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eae3cf] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold text-[#0d3a57]">
                  เพิ่มสินค้าที่มีอยู่เข้ากลุ่ม &ldquo;{selectedGroup.name}&rdquo;
                </h4>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#6b8799] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อสินค้าหรือหมวดหมู่..."
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    className="w-full bg-[#fef9ec] border border-[#eae3cf] rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#118cd1]"
                  />
                </div>
              </div>

              {otherRecipes.length === 0 ? (
                <div className="text-xs text-[#6b8799] py-4 text-center">
                  ไม่พบสินค้าอื่นที่สามารถเพิ่มได้
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {otherRecipes.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleAssignRecipeToGroup(r.id, selectedGroup)}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#fef9ec] hover:bg-[#e8f5fd] border border-[#eae3cf] hover:border-[#118cd1] text-left transition cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-[#0d3a57] truncate">
                          {r.name}
                        </div>
                        <div className="text-[11px] text-[#6b8799] truncate">
                          {r.category} · เดิม {formatBaht(getRecipeSellingPrice(r))}
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-extrabold text-[#118cd1] bg-white px-2 py-1 rounded-lg border border-[#eae3cf]">
                        <Check className="w-3 h-3" /> เพิ่ม
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
