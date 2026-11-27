import React, { useRef, useState } from 'react';
import {
  AppDatabaseState,
  FlavorCategory,
  FlavorProductionRun,
  FlavorRecipe,
  Ingredient,
  IngredientLot,
} from '../types';
import {
  calculateRecipeUnitCost,
  getEffectivePriceCategories,
  getRecipeSellingPrice,
  SystemSimulationResult,
} from '../services/fifoEngine';
import { formatBaht } from '../services/storage';
import { fetchPosFlavorsFromCloud } from '../services/posSync';
import {
  IceCream,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Package,
  Calculator,
  Sparkles,
  Scale,
  Search,
  ArrowRight,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  X,
  Eye,
} from 'lucide-react';

interface Props {
  state: AppDatabaseState;
  sim: SystemSimulationResult;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
  sectionMode?: 'recipes' | 'ingredients' | 'both';
}

const resolveImageUrl = (imgUrl?: string) => {
  if (!imgUrl) return '';
  if (
    imgUrl.startsWith('data:') ||
    imgUrl.startsWith('http://') ||
    imgUrl.startsWith('https://')
  ) {
    return imgUrl;
  }
  if (imgUrl.startsWith('/')) return '.' + imgUrl;
  return './' + imgUrl;
};

/** ย่อรูปเมนูอัตโนมัติ (สูงสุด 256×256px) เพื่อเก็บลง IndexedDB และซิงค์เข้า Google Sheet/Supabase ได้เบาและเร็ว */
async function compressMenuImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ'));
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const webp = canvas.toDataURL('image/webp', 0.78);
        if (webp.startsWith('data:image/webp')) {
          resolve(webp);
        } else {
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const RecipeCostView: React.FC<Props> = ({
  state,
  sim,
  onUpdateState,
  sectionMode = 'both',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'recipes' | 'ingredients'>('recipes');
  const effectiveSubTab = sectionMode === 'both' ? activeSubTab : sectionMode;
  const [ingSearch, setIngSearch] = useState('');
  const [ingCatFilter, setIngCatFilter] = useState<string>('ทั้งหมด');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ทั้งหมด');
  const [customPriceModeByRecipe, setCustomPriceModeByRecipe] = useState<Record<string, boolean>>({});
  const [showAddPriceCatForm, setShowAddPriceCatForm] = useState(false);
  const [newPriceCatName, setNewPriceCatName] = useState('');
  const [newPriceCatSingle, setNewPriceCatSingle] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [recipeOrCatSearch, setRecipeOrCatSearch] = useState('');
  const [addingBottomCategory, setAddingBottomCategory] = useState(false);
  const [draftCategoryName, setDraftCategoryName] = useState('');
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('boothbook_recipe_categories_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('boothbook_recipe_category_order_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(state.recipes[0]?.id || '');
  const menuImageInputRef = useRef<HTMLInputElement | null>(null);
  // 'master' = แก้สูตรตั้งต้นของสินค้านี้, '<runId>' = แก้ปริมาณกรัม/ล็อตของ "รอบการผลิต / เติม Stock" รอบนั้นโดยเฉพาะ
  const [selectedRunId, setSelectedRunId] = useState<string>('master');
  const [syncingFlavors, setSyncingFlavors] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Modal เพิ่มสินค้าใหม่
  const [showNewFlavorModal, setShowNewFlavorModal] = useState(false);
  const [newFlavorName, setNewFlavorName] = useState('');
  const [newFlavorCat, setNewFlavorCat] = useState<FlavorCategory>('ทั่วไป');
  const [newFlavorPrice, setNewFlavorPrice] = useState<string>('0');
  const [newFlavorUnit, setNewFlavorUnit] = useState<string>('ชิ้น');

  // Modal เพิ่มวัตถุดิบใหม่พร้อมใส่ล็อตราคาซื้อแรกได้ทันทีจากหน้าสูตร
  const [showQuickNewIngModal, setShowQuickNewIngModal] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngCat, setNewIngCat] = useState<Ingredient['category']>('วัตถุดิบหลัก');
  const [newIngVendor, setNewIngVendor] = useState('');
  const [newIngWeight, setNewIngWeight] = useState('1000');
  const [newIngPrice, setNewIngPrice] = useState('');
  const [newIngPurchaseDate, setNewIngPurchaseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Modal เพิ่ม / ดู Slot (Lot) ของวัตถุดิบ
  const [addSlotTargetIng, setAddSlotTargetIng] = useState<Ingredient | null>(null);
  const [viewSlotsTargetIng, setViewSlotsTargetIng] = useState<Ingredient | null>(null);
  const [slotVendor, setSlotVendor] = useState('');
  const [slotWeight, setSlotWeight] = useState('1000');
  const [slotPrice, setSlotPrice] = useState('');
  const [slotPurchaseDate, setSlotPurchaseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  // เพิ่มวัตถุดิบที่มีอยู่แล้วลงในสูตรที่เลือก
  const [addIngId, setAddIngId] = useState<string>(state.ingredients[0]?.id || '');
  const [addIngLotId, setAddIngLotId] = useState<string>('fifo');
  const [addIngGrams, setAddIngGrams] = useState<string>('15');

  const selectedRecipe: FlavorRecipe | undefined =
    state.recipes.find((r) => r.id === selectedRecipeId) || state.recipes[0];

  const handleSyncFlavorsFromPos = async () => {
    setSyncingFlavors(true);
    setSyncNotice(null);
    try {
      const cloudFlavors = await fetchPosFlavorsFromCloud(state.settings);
      if (cloudFlavors.length === 0) {
        setSyncNotice('เชื่อมต่อสำเร็จ (ใช้รายการสินค้ามาตรฐาน 8 รสของ POS)');
        setSyncingFlavors(false);
        return;
      }

      let addedCount = 0;
      onUpdateState((prev) => {
        const existingNames = new Set(prev.recipes.map((r) => r.name.toLowerCase()));
        const newRecipes = [...prev.recipes];
        for (const cf of cloudFlavors) {
          if (!existingNames.has(cf.name.toLowerCase())) {
            addedCount++;
            newRecipes.push({
              id: 'rec-' + Date.now() + '-' + addedCount,
              name: cf.name,
              category: cf.category,
              image: '/images/',
              mode: 'per_cup',
              batchYieldCups: 1,
              halfScoopRatio: 0.5,
              ingredients: [
                {
                  ingredientId: prev.ingredients[0]?.id || 'ing-milk',
                  gramsPerBatch: 60,
                  selectedLotId: 'fifo',
                },
              ],
            });
          }
        }
        return { ...prev, recipes: newRecipes };
      });

      setSyncNotice(
        addedCount > 0
          ? `ดึงสินค้าใหม่จากชีท POS เพิ่ม ${addedCount} สินค้าเรียบร้อยแล้ว!`
          : `สินค้าในระบบตรงกับชีท POS ทั้งหมด (${cloudFlavors.length} สินค้า) แล้ว`
      );
    } finally {
      setSyncingFlavors(false);
    }
  };

  const handleCreateFlavor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlavorName.trim()) return;
    const newId = 'rec-' + Date.now();
    const newRec: FlavorRecipe = {
      id: newId,
      name: newFlavorName.trim(),
      category: newFlavorCat.trim() || 'ทั่วไป',
      sellingPrice: Math.max(0, parseFloat(newFlavorPrice) || 0),
      unitLabel: newFlavorUnit.trim() || 'ชิ้น',
      mode: 'per_cup',
      batchYieldCups: 1,
      halfScoopRatio: 0.5,
      ingredients: [],
    };
    onUpdateState((prev) => ({
      ...prev,
      recipes: [...prev.recipes, newRec],
    }));
    setSelectedRecipeId(newId);
    setNewFlavorName('');
    setNewFlavorPrice('0');
    setShowNewFlavorModal(false);
  };

  const handleQuickCreateIngredientAndAddToRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName.trim()) return;
    const newIngId = 'ing-' + Date.now();
    const newLotId = 'ilot-' + Date.now();
    const weightG = Math.max(1, parseFloat(newIngWeight) || 1000);
    const totalP = Math.max(0, parseFloat(newIngPrice) || 0);
    const costPerG = totalP / weightG;

    const newIng: Ingredient = {
      id: newIngId,
      name: newIngName.trim(),
      category: newIngCat,
    };

    const newLot: IngredientLot = {
      id: newLotId,
      ingredientId: newIngId,
      purchaseDate: newIngPurchaseDate || new Date().toISOString().slice(0, 10),
      vendor: newIngVendor.trim() || 'ล็อตตั้งต้น',
      weightGrams: weightG,
      totalPrice: totalP,
      costPerGram: costPerG,
    };

    onUpdateState((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, newIng],
      ingredientLots:
        newIngPrice !== '' ? [...prev.ingredientLots, newLot] : prev.ingredientLots,
    }));

    setAddIngId(newIngId);
    setNewIngName('');
    setNewIngVendor('');
    setNewIngPrice('');
    setNewIngPurchaseDate(new Date().toISOString().slice(0, 10));
    setShowQuickNewIngModal(false);
  };

  const handleSaveAddSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSlotTargetIng) return;
    const weightG = Math.max(1, parseFloat(slotWeight) || 1000);
    const totalP = Math.max(0, parseFloat(slotPrice) || 0);
    const newLot: IngredientLot = {
      id: 'ilot-' + Date.now(),
      ingredientId: addSlotTargetIng.id,
      purchaseDate: slotPurchaseDate || new Date().toISOString().slice(0, 10),
      vendor: slotVendor.trim() || 'ไม่ระบุ Vendor',
      weightGrams: weightG,
      totalPrice: totalP,
      costPerGram: totalP / weightG,
    };
    onUpdateState((prev) => ({
      ...prev,
      ingredientLots: [...prev.ingredientLots, newLot],
    }));
    setAddSlotTargetIng(null);
    setSlotVendor('');
    setSlotWeight('1000');
    setSlotPrice('');
    setSlotPurchaseDate(new Date().toISOString().slice(0, 10));
  };

  const handleCreateNewProductionRun = () => {
    if (!selectedRecipe) return;
    const existingRuns = selectedRecipe.productionRuns || [];
    const nextRunNo = existingRuns.length + 1;
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeRun =
      selectedRunId !== 'master'
        ? existingRuns.find((pr) => pr.id === selectedRunId)
        : undefined;
    const sourceLines = activeRun
      ? activeRun.ingredients
      : selectedRecipe.ingredients.length > 0
        ? selectedRecipe.ingredients
        : existingRuns[existingRuns.length - 1]?.ingredients || [];

    const newRunId = 'run-' + Date.now();
    const newRun: FlavorProductionRun = {
      id: newRunId,
      runNumber: nextRunNo,
      date: todayStr,
      label:
        nextRunNo === 1
          ? `ครั้งที่ 1 (ผลิตรอบแรก)`
          : `ครั้งที่ ${nextRunNo} (เติม Stock)`,
      batchYieldGrams: selectedRecipe.batchYieldGrams,
      ingredients: JSON.parse(JSON.stringify(sourceLines)),
    };

    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        r.id === selectedRecipe.id
          ? {
              ...r,
              productionRuns: [...(r.productionRuns || []), newRun],
            }
          : r
      ),
    }));
    setSelectedRunId(newRunId);
  };

  const handleUpdateProductionRunMeta = (
    runId: string,
    field: 'label' | 'date' | 'batchYieldGrams',
    value: string | number | undefined
  ) => {
    if (!selectedRecipe) return;
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        r.id === selectedRecipe.id
          ? {
              ...r,
              productionRuns: (r.productionRuns || []).map((pr) =>
                pr.id === runId ? { ...pr, [field]: value } : pr
              ),
            }
          : r
      ),
    }));
  };

  const handleDeleteProductionRun = (runId: string) => {
    if (!selectedRecipe) return;
    if (!window.confirm('ต้องการลบประวัติครั้งที่ทำรอบนี้หรือไม่?')) return;
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        r.id === selectedRecipe.id
          ? {
              ...r,
              productionRuns: (r.productionRuns || []).filter((pr) => pr.id !== runId),
            }
          : r
      ),
    }));
    if (selectedRunId === runId) {
      setSelectedRunId('master');
    }
  };

  const handleUpdateRecipeField = <K extends keyof FlavorRecipe>(
    field: K,
    value: FlavorRecipe[K]
  ) => {
    if (!selectedRecipe) return;
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) =>
        r.id === selectedRecipe.id ? { ...r, [field]: value } : r
      ),
    }));
  };

  const handleUpdateIngredientGrams = (ingredientId: string, grams: number) => {
    if (!selectedRecipe) return;
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) => {
        if (r.id !== selectedRecipe.id) return r;
        if (
          selectedRunId !== 'master' &&
          (r.productionRuns || []).some((pr) => pr.id === selectedRunId)
        ) {
          return {
            ...r,
            productionRuns: (r.productionRuns || []).map((pr) =>
              pr.id === selectedRunId
                ? {
                    ...pr,
                    ingredients: pr.ingredients.map((line) =>
                      line.ingredientId === ingredientId
                        ? { ...line, gramsPerBatch: Math.max(0, grams) }
                        : line
                    ),
                  }
                : pr
            ),
          };
        }
        return {
          ...r,
          ingredients: r.ingredients.map((line) =>
            line.ingredientId === ingredientId
              ? { ...line, gramsPerBatch: Math.max(0, grams) }
              : line
          ),
        };
      }),
    }));
  };

  const handleUpdateIngredientLotSelection = (ingredientId: string, selectedLotId: string) => {
    if (!selectedRecipe) return;
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) => {
        if (r.id !== selectedRecipe.id) return r;
        if (
          selectedRunId !== 'master' &&
          (r.productionRuns || []).some((pr) => pr.id === selectedRunId)
        ) {
          return {
            ...r,
            productionRuns: (r.productionRuns || []).map((pr) =>
              pr.id === selectedRunId
                ? {
                    ...pr,
                    ingredients: pr.ingredients.map((line) =>
                      line.ingredientId === ingredientId ? { ...line, selectedLotId } : line
                    ),
                  }
                : pr
            ),
          };
        }
        return {
          ...r,
          ingredients: r.ingredients.map((line) =>
            line.ingredientId === ingredientId ? { ...line, selectedLotId } : line
          ),
        };
      }),
    }));
  };

  const handleAddIngredientToRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipe || !addIngId) return;
    const g = parseFloat(addIngGrams) || 0;
    if (g <= 0) return;

    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) => {
        if (r.id !== selectedRecipe.id) return r;
        const appendOrSum = (lines: typeof r.ingredients) => {
          const exists = lines.some((l) => l.ingredientId === addIngId);
          if (exists) {
            return lines.map((l) =>
              l.ingredientId === addIngId
                ? {
                    ...l,
                    gramsPerBatch: l.gramsPerBatch + g,
                    selectedLotId: addIngLotId || l.selectedLotId || 'fifo',
                  }
                : l
            );
          }
          return [
            ...lines,
            {
              ingredientId: addIngId,
              gramsPerBatch: g,
              selectedLotId: addIngLotId || 'fifo',
            },
          ];
        };

        if (
          selectedRunId !== 'master' &&
          (r.productionRuns || []).some((pr) => pr.id === selectedRunId)
        ) {
          return {
            ...r,
            productionRuns: (r.productionRuns || []).map((pr) =>
              pr.id === selectedRunId ? { ...pr, ingredients: appendOrSum(pr.ingredients) } : pr
            ),
          };
        }

        return {
          ...r,
          ingredients: appendOrSum(r.ingredients),
        };
      }),
    }));
  };

  const handleRemoveIngredientFromRecipe = (ingredientId: string) => {
    if (!selectedRecipe) return;
    onUpdateState((prev) => ({
      ...prev,
      recipes: prev.recipes.map((r) => {
        if (r.id !== selectedRecipe.id) return r;
        if (
          selectedRunId !== 'master' &&
          (r.productionRuns || []).some((pr) => pr.id === selectedRunId)
        ) {
          return {
            ...r,
            productionRuns: (r.productionRuns || []).map((pr) =>
              pr.id === selectedRunId
                ? {
                    ...pr,
                    ingredients: pr.ingredients.filter((l) => l.ingredientId !== ingredientId),
                  }
                : pr
            ),
          };
        }
        return {
          ...r,
          ingredients: r.ingredients.filter((l) => l.ingredientId !== ingredientId),
        };
      }),
    }));
  };

  const activeRunObj =
    selectedRecipe && selectedRunId !== 'master'
      ? (selectedRecipe.productionRuns || []).find((pr) => pr.id === selectedRunId)
      : undefined;

  const selectedCost = selectedRecipe
    ? calculateRecipeUnitCost(
        selectedRecipe,
        state,
        sim,
        activeRunObj ? activeRunObj.id : 'master'
      )
    : null;

  // ล็อตของวัตถุดิบที่กำลังเลือกในแถบ "+ เพิ่มวัตถุดิบลงในสูตรนี้"
  const lotsForAddIngredient = state.ingredientLots
    .filter((l) => l.ingredientId === addIngId)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.id.localeCompare(b.id));

  const ingredientCategories = [
    'ทั้งหมด',
    ...Array.from(new Set(state.ingredients.map((i) => i.category).filter(Boolean))),
  ];

  const filteredIngredients = state.ingredients.filter((ing) => {
    const matchCat = ingCatFilter === 'ทั้งหมด' || ing.category === ingCatFilter;
    const matchSearch =
      !ingSearch.trim() ||
      ing.name.toLowerCase().includes(ingSearch.trim().toLowerCase()) ||
      (ing.category || '').toLowerCase().includes(ingSearch.trim().toLowerCase());
    return matchCat && matchSearch;
  });

  const handleDeleteIngredient = (ingId: string, ingName: string) => {
    const usedInCount = state.recipes.filter((r) =>
      r.ingredients.some((l) => l.ingredientId === ingId)
    ).length;
    const msg =
      usedInCount > 0
        ? `วัตถุดิบ "${ingName}" กำลังถูกใช้ใน ${usedInCount} สูตร — ต้องการลบออกจากระบบและออกจากทุกสูตรหรือไม่?`
        : `ต้องการลบวัตถุดิบ "${ingName}" ออกจากคลังใช่หรือไม่?`;
    if (!window.confirm(msg)) return;
    onUpdateState((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((i) => i.id !== ingId),
      ingredientLots: prev.ingredientLots.filter((l) => l.ingredientId !== ingId),
      recipes: prev.recipes.map((r) => ({
        ...r,
        ingredients: r.ingredients.filter((l) => l.ingredientId !== ingId),
      })),
    }));
  };

  const flexibleMatch = (target: string, query: string): boolean => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const t = (target || '').toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.every((tok) => {
      if (t.includes(tok)) return true;
      // Subsequence match (flexible typing e.g. "amrc" -> "americano")
      let ti = 0;
      for (let qi = 0; qi < tok.length; qi++) {
        const idx = t.indexOf(tok[qi], ti);
        if (idx === -1) return false;
        ti = idx + 1;
      }
      return true;
    });
  };

  const rawCategoriesSet = Array.from(
    new Set([
      ...customCategories,
      ...state.recipes.map((r) => (r.category || '').trim()).filter(Boolean),
    ])
  );

  const productCategories = [
    ...categoryOrder.filter((c) => rawCategoriesSet.includes(c)),
    ...rawCategoriesSet.filter((c) => !categoryOrder.includes(c)),
  ];

  const visibleCategories = productCategories.filter((cat) => {
    if (!recipeOrCatSearch.trim()) return true;
    if (flexibleMatch(cat, recipeOrCatSearch)) return true;
    return state.recipes.some(
      (r) => (r.category || '').trim() === cat && flexibleMatch(r.name, recipeOrCatSearch)
    );
  });

  const filteredRecipes = state.recipes.filter((r) => {
    const catOk =
      selectedCategoryFilter === 'ทั้งหมด' ||
      (r.category || '').trim() === selectedCategoryFilter;
    if (!catOk) return false;
    if (!recipeOrCatSearch.trim()) return true;
    return (
      flexibleMatch(r.name, recipeOrCatSearch) ||
      flexibleMatch(r.category || '', recipeOrCatSearch)
    );
  });

  const saveCategoryOrder = (nextOrder: string[]) => {
    setCategoryOrder(nextOrder);
    try {
      localStorage.setItem('boothbook_recipe_category_order_v1', JSON.stringify(nextOrder));
    } catch {
      // ignore
    }
  };

  const handleCommitBottomCategory = () => {
    const trimmed = draftCategoryName.trim();
    setAddingBottomCategory(false);
    setDraftCategoryName('');
    if (!trimmed) return;
    if (!rawCategoriesSet.includes(trimmed)) {
      const nextCustom = [...customCategories, trimmed];
      setCustomCategories(nextCustom);
      try {
        localStorage.setItem('boothbook_recipe_categories_v1', JSON.stringify(nextCustom));
      } catch {
        // ignore
      }
      saveCategoryOrder([...productCategories, trimmed]);
    }
    setSelectedCategoryFilter(trimmed);
  };

  const handleDropCategory = (targetCat: string) => {
    if (!draggedCategory || draggedCategory === targetCat) {
      setDraggedCategory(null);
      setDragOverCategory(null);
      return;
    }
    const nextOrder = [...productCategories];
    const fromIdx = nextOrder.indexOf(draggedCategory);
    const toIdx = nextOrder.indexOf(targetCat);
    if (fromIdx !== -1 && toIdx !== -1) {
      nextOrder.splice(fromIdx, 1);
      nextOrder.splice(toIdx, 0, draggedCategory);
      saveCategoryOrder(nextOrder);
    }
    setDraggedCategory(null);
    setDragOverCategory(null);
  };

  const handleDeleteCustomCategory = (catName: string) => {
    const next = customCategories.filter((c) => c !== catName);
    setCustomCategories(next);
    try {
      localStorage.setItem('boothbook_recipe_categories_v1', JSON.stringify(next));
    } catch {
      // ignore
    }
    saveCategoryOrder(productCategories.filter((c) => c !== catName));
    if (selectedCategoryFilter === catName) {
      setSelectedCategoryFilter('ทั้งหมด');
    }
  };

  return (
    <div className="space-y-6">
      {/* แถบสลับ Section: สูตรสินค้า vs คลังวัตถุดิบ */}
      {sectionMode === 'both' && (
        <div className="bg-white rounded-2xl p-2 shadow-sm border border-[#eae3cf] inline-flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('recipes')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              effectiveSubTab === 'recipes'
                ? 'bg-[#118cd1] text-white shadow-sm'
                : 'text-[#6b8799] hover:bg-[#fef9ec] hover:text-[#0d3a57]'
            }`}
          >
            <IceCream className="w-4 h-4" />
            สูตรสินค้า & ต้นทุน ({state.recipes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('ingredients')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              effectiveSubTab === 'ingredients'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[#6b8799] hover:bg-[#fef9ec] hover:text-[#0d3a57]'
            }`}
          >
            <Scale className="w-4 h-4" />
            คลังวัตถุดิบในระบบ ({state.ingredients.length})
          </button>
        </div>
      )}

      {/* SECTION A: คลังวัตถุดิบทั้งหมดที่มีให้ดึงมากรอกในสูตร */}
      {effectiveSubTab === 'ingredients' && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#eae3cf] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-[#0d3a57] flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-600" />
                คลังวัตถุดิบทั้งหมด (สำหรับดึงไปกรอกในสูตร)
              </h2>
              <p className="text-xs text-[#6b8799] mt-0.5">
                ดูรายการวัตถุดิบทั้งหมดและราคาต่อหน่วยจากล็อตที่ซื้อไว้ในระบบ
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickNewIngModal(true)}
              className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> เพิ่มวัตถุดิบใหม่เข้าระบบ
            </button>
          </div>

          {/* ค้นหา & กรองหมวดหมู่ */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-[#6b8799] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ingSearch}
                onChange={(e) => setIngSearch(e.target.value)}
                placeholder="ค้นหาชื่อวัตถุดิบ..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#eae3cf] bg-[#fef9ec]/40 text-xs font-semibold text-[#0d3a57] focus:outline-none focus:border-[#118cd1]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ingredientCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setIngCatFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    ingCatFilter === cat
                      ? 'bg-[#0d3a57] text-white'
                      : 'bg-[#fef9ec] text-[#6b8799] border border-[#eae3cf] hover:text-[#0d3a57]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* รายการวัตถุดิบ */}
          {filteredIngredients.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#6b8799] bg-[#fef9ec]/40 rounded-2xl border border-dashed border-[#eae3cf]">
              ไม่พบวัตถุดิบที่ตรงกับการค้นหา — กดปุ่ม &ldquo;+ เพิ่มวัตถุดิบใหม่เข้าระบบ&rdquo; เพื่อเพิ่มได้เลยครับ
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredIngredients.map((ing) => {
                const lots = state.ingredientLots
                  .filter((l) => l.ingredientId === ing.id)
                  .sort(
                    (a, b) =>
                      b.purchaseDate.localeCompare(a.purchaseDate) || b.id.localeCompare(a.id)
                  );
                const latestLot = lots[0];
                const usedRecipes = state.recipes.filter((r) =>
                  r.ingredients.some((l) => l.ingredientId === ing.id)
                );

  return (
                  <div
                    key={ing.id}
                    className="p-4 rounded-2xl border border-[#eae3cf] bg-[#fef9ec]/40 flex flex-col justify-between gap-3 hover:border-[#90d4ec] transition"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-white border border-[#eae3cf] text-[#6b8799] mb-1">
                            {ing.category || 'วัตถุดิบ'}
                          </span>
                          <h3 className="font-extrabold text-sm text-[#0d3a57]">{ing.name}</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteIngredient(ing.id, ing.name)}
                          className="p-1.5 rounded-lg text-[#6b8799] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="ลบวัตถุดิบ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {latestLot ? (
                        <div className="bg-white rounded-xl p-2.5 border border-[#eae3cf]/80 text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-[#6b8799]">ราคาต่อหน่วย (ล็อตล่าสุด):</span>
                            <b className="text-emerald-700">
                              {formatBaht(latestLot.costPerGram, 4)} /{' '}
                              {latestLot.unit === 'pcs' ? 'ชิ้น' : 'กรัม'}
                            </b>
                          </div>
                          <div className="flex justify-between text-[#6b8799]">
                            <span>แหล่งซื้อ: {latestLot.vendor || '-'}</span>
                            <span>มี {lots.length} ล็อต</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200 text-[11px] text-amber-800 font-semibold">
                          ยังไม่มีข้อมูลล็อตราคาซื้อ
                        </div>
                      )}

                      <div className="text-[11px] text-[#6b8799]">
                        {usedRecipes.length > 0 ? (
                          <span>
                            ใช้ใน <b className="text-[#0d3a57]">{usedRecipes.length}</b> สูตร:{' '}
                            {usedRecipes
                              .slice(0, 2)
                              .map((r) => r.name)
                              .join(', ')}
                            {usedRecipes.length > 2 ? ` +${usedRecipes.length - 2}` : ''}
                          </span>
                        ) : (
                          <span>ยังไม่ถูกดึงไปใช้ในสูตร</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddSlotTargetIng(ing);
                          setSlotVendor('');
                          setSlotWeight('1000');
                          setSlotPrice('');
                          setSlotPurchaseDate(new Date().toISOString().slice(0, 10));
                        }}
                        className="inline-flex items-center justify-center gap-1.5 bg-[#118cd1]/10 hover:bg-[#118cd1] text-[#118cd1] hover:text-white font-black py-2 px-3 rounded-xl text-xs transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Slot
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewSlotsTargetIng(ing)}
                        className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-[#fef9ec] text-[#0d3a57] border border-[#eae3cf] font-black py-2 px-3 rounded-xl text-xs transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#6b8799]" /> View Slot ({lots.length})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION B: สูตรสินค้า & ต้นทุนต่อชิ้น */}
      {effectiveSubTab === 'recipes' && (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Tab ย่อยด้านซ้าย: Dropdown เลือก/Sort/เพิ่ม Category + ช่องค้นหา + รายการเมนูใน Category */}
          <div className="w-full lg:w-72 shrink-0 bg-white rounded-2xl p-4 shadow-sm border border-[#eae3cf] space-y-3">
            {/* Dropdown เลือก Category (พร้อม Drag to Sort และเพิ่ม Category ใหม่) */}
            <div className="relative">
              <label className="block text-[11px] font-black text-[#6b8799] mb-1">
                หมวดหมู่สินค้า (Category)
              </label>
              <button
                type="button"
                onClick={() => setShowCategoryDropdown((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 border-[#eae3cf] hover:border-[#118cd1] bg-[#fef9ec]/50 text-xs font-extrabold text-[#0d3a57] transition cursor-pointer"
              >
                <span className="truncate">
                  {selectedCategoryFilter === 'ทั้งหมด'
                    ? `ทั้งหมด (${state.recipes.length})`
                    : `${selectedCategoryFilter} (${
                        state.recipes.filter((r) => (r.category || '').trim() === selectedCategoryFilter)
                          .length
                      })`}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[#118cd1] shrink-0 transition-transform ${
                    showCategoryDropdown ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showCategoryDropdown && (
                <div className="mt-1.5 w-full bg-white rounded-2xl border border-[#eae3cf] shadow-lg p-2 space-y-1 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryFilter('ทั้งหมด');
                      setShowCategoryDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      selectedCategoryFilter === 'ทั้งหมด'
                        ? 'bg-[#118cd1] text-white'
                        : 'text-[#0d3a57] hover:bg-[#fef9ec]'
                    }`}
                  >
                    <span>ทั้งหมด</span>
                    <span className="text-[10px] font-black opacity-80">{state.recipes.length}</span>
                  </button>

                  {productCategories.map((cat) => {
                    const count = state.recipes.filter((r) => (r.category || '').trim() === cat).length;
                    const isActive = selectedCategoryFilter === cat;
                    const canDelete = customCategories.includes(cat) && count === 0;
                    const isDragOver = dragOverCategory === cat && draggedCategory !== cat;
                    return (
                      <div
                        key={cat}
                        draggable
                        onDragStart={() => setDraggedCategory(cat)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverCategory !== cat) setDragOverCategory(cat);
                        }}
                        onDragLeave={() => {
                          if (dragOverCategory === cat) setDragOverCategory(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDropCategory(cat);
                        }}
                        onDragEnd={() => {
                          setDraggedCategory(null);
                          setDragOverCategory(null);
                        }}
                        className={`flex items-center gap-1 rounded-xl transition ${
                          isDragOver ? 'ring-2 ring-[#118cd1] bg-[#118cd1]/10' : ''
                        } ${draggedCategory === cat ? 'opacity-50' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategoryFilter(cat);
                            setShowCategoryDropdown(false);
                          }}
                          className={`flex-1 flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            isActive
                              ? 'bg-[#118cd1] text-white'
                              : 'text-[#0d3a57] hover:bg-[#fef9ec]'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <GripVertical
                              className={`w-3.5 h-3.5 shrink-0 cursor-grab ${
                                isActive ? 'text-white/75' : 'text-[#6b8799]/60'
                              }`}
                            />
                            <span className="truncate">{cat}</span>
                          </span>
                          <span className="text-[10px] font-black opacity-80">{count}</span>
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomCategory(cat)}
                            className="p-1.5 rounded-lg text-[#6b8799] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="ลบหมวดหมู่ที่ว่าง"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* เพิ่ม Category ใหม่ด้านล่างสุดของ Dropdown */}
                  {addingBottomCategory ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCommitBottomCategory();
                        setShowCategoryDropdown(false);
                      }}
                      className="pt-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={draftCategoryName}
                        onChange={(e) => setDraftCategoryName(e.target.value)}
                        onBlur={() => {
                          handleCommitBottomCategory();
                          setShowCategoryDropdown(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setAddingBottomCategory(false);
                            setDraftCategoryName('');
                          }
                        }}
                        placeholder="พิมพ์ชื่อ Category ใหม่..."
                        className="w-full border-2 border-[#118cd1] rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#0d3a57] bg-white focus:outline-none"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingBottomCategory(true);
                        setDraftCategoryName('');
                      }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-[#118cd1] bg-[#118cd1]/10 hover:bg-[#118cd1]/20 transition cursor-pointer mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      เพิ่ม Category ใหม่
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ช่องค้นหาเมนูใน Category */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6b8799] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={recipeOrCatSearch}
                onChange={(e) => setRecipeOrCatSearch(e.target.value)}
                placeholder="ค้นหาชื่อเมนู..."
                className="w-full border border-[#eae3cf] rounded-xl pl-8 pr-2.5 py-2 text-xs font-semibold text-[#0d3a57] bg-[#fef9ec]/40 focus:outline-none focus:border-[#118cd1]"
              />
            </div>

            {/* รายการเมนูใน Category ที่เลือก */}
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-0.5">
              {filteredRecipes.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-[#6b8799] bg-[#fef9ec]/40 rounded-xl border border-dashed border-[#eae3cf]">
                  ไม่พบเมนูในหมวดหมู่นี้
                </div>
              ) : (
                filteredRecipes.map((rec) => {
                  const cost = calculateRecipeUnitCost(rec, state, sim);
                  const isSelected = selectedRecipe?.id === rec.id;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => setSelectedRecipeId(rec.id)}
                      className={`w-full text-left p-2.5 rounded-xl border-2 transition cursor-pointer flex items-center gap-2.5 ${
                        isSelected
                          ? 'border-[#118cd1] bg-[#90d4ec]/15 shadow-2xs'
                          : 'border-[#eae3cf] bg-[#fef9ec]/40 hover:border-[#90d4ec]'
                      }`}
                    >
                      {rec.image ? (
                        <img
                          src={resolveImageUrl(rec.image)}
                          alt={rec.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                          className="w-10 h-10 rounded-lg object-cover bg-[#90d4ec]/30 shrink-0 border border-[#eae3cf]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#90d4ec]/25 shrink-0 border border-[#eae3cf] flex items-center justify-center text-[#118cd1]">
                          <IceCream className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-xs text-[#0d3a57] truncate">
                          {rec.name}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#6b8799] mt-0.5">
                          <span>{rec.category}</span>
                          <span className="font-black text-[#118cd1]">
                            ขาย {formatBaht(cost.sellingPriceSingle, 0)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 w-full space-y-6">
      {/* ส่วนหัว: สรุปต้นทุนต่อชิ้นของทุกสินค้า */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eae3cf]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[#0d3a57] flex items-center gap-2">
            <IceCream className="w-5 h-5 text-[#118cd1]" />
            สูตรสินค้าแต่ละสินค้า & ต้นทุนต่อชิ้น (Flavor BOM & Cost per Cup)
          </h2>

          <button
            onClick={() => {
              if (selectedCategoryFilter !== 'ทั้งหมด') {
                setNewFlavorCat(selectedCategoryFilter);
              } else if (productCategories.length > 0) {
                setNewFlavorCat(productCategories[0]);
              }
              setShowNewFlavorModal(true);
            }}
            className="shrink-0 inline-flex items-center gap-2 bg-[#118cd1] hover:bg-[#0e78b5] text-white font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มสินค้าใหม่
          </button>
        </div>

        {syncNotice && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {syncNotice}
          </div>
        )}
      </div>

      {/* SECTION 1 (บน): โครงสร้างต้นทุนต่อชิ้น */}
      {selectedRecipe && selectedCost && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eae3cf] space-y-4">
            <h3 className="font-extrabold text-[#0d3a57] flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#118cd1]" />
              สรุปโครงสร้างต้นทุนต่อชิ้น ({selectedRecipe.name})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#fef9ec] rounded-xl p-4 border border-[#eae3cf] space-y-2.5 text-sm">
                {(() => {
                  const effectivePrice = selectedCost.sellingPriceSingle;
                  const allPriceCategories = getEffectivePriceCategories(
                    state.settings.priceCategories
                  );

                  const explicitCatId = selectedRecipe.priceCategoryId;
                  const matchedById = explicitCatId
                    ? allPriceCategories.find((c) => c.id === explicitCatId)
                    : undefined;
                  const matchedByPrice = allPriceCategories.find(
                    (c) => c.singlePrice === effectivePrice
                  );
                  const isCustomPriceMode =
                    customPriceModeByRecipe[selectedRecipe.id] ??
                    (explicitCatId === 'custom' || (!matchedById && !matchedByPrice));
                  const selectValue = isCustomPriceMode
                    ? 'custom'
                    : (matchedById?.id || matchedByPrice?.id || 'custom');
                  const selectedCatObj = allPriceCategories.find(
                    (c) => c.id === selectValue
                  );

                  const handleSaveNewPriceCategory = (e: React.FormEvent) => {
                    e.preventDefault();
                    const trimmed = newPriceCatName.trim();
                    const priceVal = Math.max(0, parseFloat(newPriceCatSingle) || 0);
                    if (!trimmed) return;
                    const newCatId = 'pcat-' + Date.now();
                    onUpdateState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        priceCategories: [
                          ...getEffectivePriceCategories(prev.settings.priceCategories),
                          { id: newCatId, name: trimmed, singlePrice: priceVal },
                        ],
                      },
                      recipes: prev.recipes.map((r) =>
                        r.id === selectedRecipe.id
                          ? { ...r, priceCategoryId: newCatId, sellingPrice: priceVal }
                          : r
                      ),
                    }));
                    setCustomPriceModeByRecipe((prev) => ({
                      ...prev,
                      [selectedRecipe.id]: false,
                    }));
                    setNewPriceCatName('');
                    setNewPriceCatSingle('');
                    setShowAddPriceCatForm(false);
                  };

                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs font-bold text-[#6b8799]">หมวดราคาใน POS:</span>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__add_new__') {
                                setShowAddPriceCatForm(true);
                                return;
                              }
                              setShowAddPriceCatForm(false);
                              if (val === 'custom') {
                                setCustomPriceModeByRecipe((prev) => ({
                                  ...prev,
                                  [selectedRecipe.id]: true,
                                }));
                                onUpdateState((prev) => ({
                                  ...prev,
                                  recipes: prev.recipes.map((r) =>
                                    r.id === selectedRecipe.id
                                      ? {
                                          ...r,
                                          priceCategoryId: 'custom',
                                          sellingPrice:
                                            typeof r.sellingPrice === 'number'
                                              ? r.sellingPrice
                                              : effectivePrice,
                                        }
                                      : r
                                  ),
                                }));
                              } else {
                                const picked = allPriceCategories.find((c) => c.id === val);
                                const tierPrice = picked?.singlePrice ?? 0;
                                setCustomPriceModeByRecipe((prev) => ({
                                  ...prev,
                                  [selectedRecipe.id]: false,
                                }));
                                onUpdateState((prev) => ({
                                  ...prev,
                                  recipes: prev.recipes.map((r) =>
                                    r.id === selectedRecipe.id
                                      ? { ...r, priceCategoryId: val, sellingPrice: tierPrice }
                                      : r
                                  ),
                                }));
                              }
                            }}
                            className="bg-white border border-[#eae3cf] rounded-lg px-2.5 py-1 text-xs font-extrabold text-[#118cd1]"
                          >
                            {allPriceCategories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.halfPrice !== undefined
                                  ? `${cat.name} (฿${cat.singlePrice} / ฿${cat.halfPrice})`
                                  : `${cat.name} (฿${cat.singlePrice})`}
                              </option>
                            ))}
                            <option value="__add_new__">+ เพิ่มหมวดราคาใหม่...</option>
                            <option value="custom">ระบุราคาเอง</option>
                          </select>
                          {selectedCatObj && (
                            <button
                              type="button"
                              title={`ลบหมวดราคา "${selectedCatObj.name}"`}
                              onClick={() => {
                                onUpdateState((prev) => {
                                  const base = getEffectivePriceCategories(
                                    prev.settings.priceCategories
                                  );
                                  return {
                                    ...prev,
                                    settings: {
                                      ...prev.settings,
                                      priceCategories: base.filter(
                                        (c) => c.id !== selectedCatObj.id
                                      ),
                                    },
                                    recipes: prev.recipes.map((r) => {
                                      const isInDeleted =
                                        r.priceCategoryId === selectedCatObj.id ||
                                        (!r.priceCategoryId &&
                                          getRecipeSellingPrice(r) === selectedCatObj.singlePrice);
                                      return isInDeleted
                                        ? { ...r, priceCategoryId: 'custom', sellingPrice: 0 }
                                        : r;
                                    }),
                                  };
                                });
                              }}
                              className="p-1 rounded-md text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {showAddPriceCatForm && (
                        <form
                          onSubmit={handleSaveNewPriceCategory}
                          className="bg-white rounded-xl p-2.5 border border-[#118cd1]/30 space-y-2"
                        >
                          <div className="text-[11px] font-bold text-[#0d3a57]">
                            เพิ่มหมวดราคาใหม่
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            <input
                              type="text"
                              placeholder="ชื่อหมวด (เช่น Special)"
                              value={newPriceCatName}
                              onChange={(e) => setNewPriceCatName(e.target.value)}
                              className="col-span-3 border border-[#eae3cf] rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none focus:border-[#118cd1]"
                              required
                              autoFocus
                            />
                            <input
                              type="number"
                              min={0}
                              step="any"
                              placeholder="ราคา (฿)"
                              value={newPriceCatSingle}
                              onChange={(e) => setNewPriceCatSingle(e.target.value)}
                              className="col-span-2 border border-[#eae3cf] rounded-lg px-2 py-1 text-xs font-bold text-right focus:outline-none focus:border-[#118cd1]"
                              required
                            />
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddPriceCatForm(false);
                                setNewPriceCatName('');
                                setNewPriceCatSingle('');
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#6b8799] hover:bg-slate-100"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="submit"
                              className="px-3 py-1 rounded-lg text-[11px] font-bold bg-[#118cd1] text-white hover:bg-[#0e76b2]"
                            >
                              บันทึกหมวดราคา
                            </button>
                          </div>
                        </form>
                      )}

                      {isCustomPriceMode && (
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs font-bold text-[#6b8799]">ราคาขายที่ระบุเอง (฿):</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={
                              typeof selectedRecipe.sellingPrice === 'number'
                                ? selectedRecipe.sellingPrice
                                : effectivePrice
                            }
                            onChange={(e) =>
                              onUpdateState((prev) => ({
                                ...prev,
                                recipes: prev.recipes.map((r) =>
                                  r.id === selectedRecipe.id
                                    ? {
                                        ...r,
                                        priceCategoryId: 'custom',
                                        sellingPrice: Math.max(0, parseFloat(e.target.value) || 0),
                                      }
                                    : r
                                ),
                              }))
                            }
                            className="w-24 text-right bg-white border border-[#eae3cf] rounded-lg px-2.5 py-1 text-xs font-extrabold text-[#118cd1] focus:outline-none focus:border-[#118cd1]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex justify-between text-xs pt-2 border-t border-[#eae3cf]">
                  <span className="text-[#6b8799]">1. ต้นทุนวัตถุดิบ (สั่ง 1 ชิ้นเต็มถ้วย):</span>
                  <b className="text-[#0d3a57]">
                    {formatBaht(selectedCost.ingredientCostPerFullCup)}
                  </b>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-[#6b8799]">
                    • กรณีลูกค้าสั่ง 2 ชิ้นในถ้วยเดียว (ครึ่งถ้วย):
                  </span>
                  <b className="text-[#0d3a57]">
                    {formatBaht(selectedCost.ingredientCostPerHalfCup)}
                  </b>
                </div>

                <div className="pt-2 border-t border-[#eae3cf] space-y-1">
                  <div className="flex justify-between text-xs font-bold text-[#0d3a57]">
                    <span className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-[#118cd1]" />
                      2. ต้นทุนแพ็กเกจจิ้งต่อ 1 ชิ้น (FIFO):
                    </span>
                    <span>{formatBaht(selectedCost.packagingCostPerCup)}</span>
                  </div>
                  {selectedCost.packagingBreakdown.map((pk) => (
                    <div
                      key={pk.itemId}
                      className="flex justify-between text-[11px] text-[#6b8799] pl-4"
                    >
                      <span>
                        - {pk.name} (×{pk.usagePerCup})
                      </span>
                      <span>{formatBaht(pk.cost)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t-2 border-[#eae3cf] flex justify-between items-baseline">
                  <span className="font-extrabold text-[#0d3a57]">รวมต้นทุนทั้งสิ้น / 1 ชิ้น:</span>
                  <span className="text-xl font-black text-[#118cd1]">
                    {formatBaht(selectedCost.totalFullCupCost)}
                  </span>
                </div>
              </div>

              {/* เปรียบเทียบกับราคาขายใน POS */}
              <div className="bg-emerald-50/70 rounded-xl p-4 border border-emerald-200 space-y-2 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    กำไรต่อชิ้นเมื่อขายใน POS
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-900">ราคาขาย 1 ชิ้น ({selectedRecipe.category}):</span>
                    <b className="text-emerald-950">{formatBaht(selectedCost.sellingPriceSingle)}</b>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-900">หัก ต้นทุนวัตถุดิบ + แพ็กเกจ:</span>
                    <b className="text-rose-700">-{formatBaht(selectedCost.totalFullCupCost)}</b>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-200 flex justify-between items-baseline">
                  <span className="text-xs font-extrabold text-emerald-900">กำไรขั้นต้น / ชิ้น:</span>
                  <span className="text-lg font-black text-emerald-700">
                    +{formatBaht(selectedCost.grossProfitSingle)} (
                    {selectedCost.grossMarginPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2 (ล่าง): สูตรการผลิต */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eae3cf] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#eae3cf]">
              <div className="flex items-center gap-3">
                <input
                  ref={menuImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const compressed = await compressMenuImageToDataUrl(file);
                      handleUpdateRecipeField('image', compressed);
                    } catch (err: any) {
                      window.alert(err?.message || 'อัปโหลดรูปไม่สำเร็จ');
                    }
                  }}
                />
                {selectedRecipe.image ? (
                  <div className="relative group shrink-0">
                    <button
                      type="button"
                      onClick={() => menuImageInputRef.current?.click()}
                      title="คลิกเพื่อเปลี่ยนรูปเมนู"
                      className="block w-14 h-14 rounded-xl overflow-hidden border border-[#eae3cf] bg-[#90d4ec]/20 cursor-pointer relative"
                    >
                      <img
                        src={resolveImageUrl(selectedRecipe.image)}
                        alt={selectedRecipe.name}
                        className="w-full h-full object-cover"
                      />
                      <span className="inset-0 absolute bg-[#0d3a57]/50 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <Upload className="w-4 h-4" />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateRecipeField('image', '')}
                      title="ลบรูปเมนู"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => menuImageInputRef.current?.click()}
                    title="คลิกเพื่ออัปโหลดรูปเมนู"
                    className="w-14 h-14 rounded-xl border-2 border-dashed border-[#90d4ec] hover:border-[#118cd1] bg-[#fef9ec]/60 hover:bg-[#118cd1]/5 text-[#118cd1] shrink-0 flex flex-col items-center justify-center gap-0.5 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="text-[9px] font-black leading-none">อัปโหลด</span>
                  </button>
                )}
                <div>
                  <h3 className="text-lg font-extrabold text-[#0d3a57]">
                    สูตรการผลิต: {selectedRecipe.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                    <label className="flex items-center gap-1 bg-[#fef9ec] px-2.5 py-1 rounded-lg border border-[#eae3cf]">
                      <span className="text-[#6b8799] font-bold">ราคาขาย (฿):</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={selectedRecipe.sellingPrice ?? selectedCost.sellingPriceSingle}
                        onChange={(e) =>
                          handleUpdateRecipeField('sellingPrice', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-16 bg-white border border-[#eae3cf] rounded px-1.5 py-0.5 font-black text-[#118cd1] text-right"
                      />
                    </label>
                    <label className="flex items-center gap-1 bg-[#fef9ec] px-2.5 py-1 rounded-lg border border-[#eae3cf]">
                      <span className="text-[#6b8799] font-bold">หมวดหมู่:</span>
                      <input
                        type="text"
                        value={selectedRecipe.category || ''}
                        onChange={(e) => handleUpdateRecipeField('category', e.target.value)}
                        className="w-24 bg-white border border-[#eae3cf] rounded px-1.5 py-0.5 font-bold text-[#0d3a57]"
                      />
                    </label>
                    <label className="flex items-center gap-1 bg-[#fef9ec] px-2.5 py-1 rounded-lg border border-[#eae3cf]">
                      <span className="text-[#6b8799] font-bold">หน่วยขาย:</span>
                      <input
                        type="text"
                        value={selectedRecipe.unitLabel || 'ชิ้น'}
                        onChange={(e) => handleUpdateRecipeField('unitLabel', e.target.value)}
                        className="w-16 bg-white border border-[#eae3cf] rounded px-1.5 py-0.5 font-bold text-[#0d3a57]"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* เลือกโหมดการกรอกสูตร: ต่อ 1 ชิ้น หรือ ต่อ 1 ล็อตผลิต */}
              <div className="flex items-center gap-2 bg-[#fef9ec] p-1.5 rounded-xl border border-[#eae3cf] text-xs font-bold">
                <button
                  onClick={() => {
                    handleUpdateRecipeField('mode', 'per_cup');
                    handleUpdateRecipeField('batchYieldCups', 1);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    selectedRecipe.mode === 'per_cup'
                      ? 'bg-[#118cd1] text-white'
                      : 'text-[#6b8799]'
                  }`}
                >
                  กรอกสูตรต่อ 1 ชิ้น
                </button>
                <button
                  onClick={() => {
                    handleUpdateRecipeField('mode', 'per_batch');
                    if (!selectedRecipe.gramsPerCup || selectedRecipe.gramsPerCup <= 0) {
                      handleUpdateRecipeField('gramsPerCup', 80);
                    }
                    if (!selectedRecipe.gramsPerHalfCup || selectedRecipe.gramsPerHalfCup <= 0) {
                      handleUpdateRecipeField('gramsPerHalfCup', 40);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    selectedRecipe.mode === 'per_batch'
                      ? 'bg-[#118cd1] text-white'
                      : 'text-[#6b8799]'
                  }`}
                >
                  กรอกสูตรต่อ 1 ล็อตผลิต (Batch)
                </button>
              </div>
            </div>

            {/* แถบเลือก "ครั้งที่ทำ / การผลิตเติม Stock" ของสินค้านี้ (แต่ละครั้งใช้ปริมาณกรัมไม่เท่ากันได้) */}
            <div className="bg-[#fef9ec] p-3.5 rounded-xl border border-[#eae3cf] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#0d3a57]">
                  🔄 เลือกสูตรตาม &ldquo;ครั้งที่ทำ / เติม Stock&rdquo; (กรณีแต่ละรอบใช้ปริมาณกรัมไม่เท่ากัน):
                </span>
                <button
                  type="button"
                  onClick={handleCreateNewProductionRun}
                  className="text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มครั้งที่ทำใหม่ (ปั่นเพิ่ม / เติม Stock)
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedRunId('master')}
                  className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                    !activeRunObj
                      ? 'bg-[#118cd1] text-white border-[#118cd1]'
                      : 'bg-white text-[#0d3a57] border-[#eae3cf] hover:border-[#118cd1]'
                  }`}
                >
                  📋 สูตรตั้งต้น (Master)
                </button>

                {(selectedRecipe.productionRuns || []).map((pr, idx) => {
                  const isSelectedRun = activeRunObj?.id === pr.id;
                  const runTotalGrams = pr.ingredients.reduce(
                    (s, l) => s + (Number(l.gramsPerBatch) || 0),
                    0
                  );
  return (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() => setSelectedRunId(pr.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                        isSelectedRun
                          ? 'bg-[#118cd1] text-white border-[#118cd1]'
                          : 'bg-white text-[#0d3a57] border-[#eae3cf] hover:border-[#118cd1]'
                      }`}
                    >
                      {pr.label || `ครั้งที่ ${idx + 1}`} ({pr.date} ·{' '}
                      {runTotalGrams.toLocaleString()}g)
                    </button>
                  );
                })}
              </div>

              {activeRunObj && (
                <div className="bg-white p-2.5 rounded-lg border border-[#90d4ec] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-[#118cd1]">กำลังแก้ไข:</span>
                    <input
                      type="text"
                      value={activeRunObj.label}
                      onChange={(e) =>
                        handleUpdateProductionRunMeta(activeRunObj.id, 'label', e.target.value)
                      }
                      className="font-bold text-[#0d3a57] bg-[#fef9ec] border border-[#eae3cf] rounded-md px-2 py-1 w-48"
                      placeholder="เช่น ครั้งที่ 2 (เติม Stock)"
                    />
                    <input
                      type="date"
                      value={activeRunObj.date}
                      onChange={(e) =>
                        handleUpdateProductionRunMeta(activeRunObj.id, 'date', e.target.value)
                      }
                      className="font-bold text-[#0d3a57] bg-[#fef9ec] border border-[#eae3cf] rounded-md px-2 py-1"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteProductionRun(activeRunObj.id)}
                    className="text-rose-600 hover:bg-rose-50 px-2 py-1 rounded font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> ลบครั้งที่ทำนี้
                  </button>
                </div>
              )}
            </div>

            {selectedRecipe.mode === 'per_batch' && (
              <div className="bg-[#90d4ec]/20 p-4 rounded-xl border border-[#90d4ec] space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-sm text-[#0d3a57]">
                    🥣 โหมดคำนวณต่อล็อตผลิต (คำนวณตามน้ำหนักกรัม)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-[#90d4ec] font-extrabold text-[#118cd1]">
                    ต้นทุนวัตถุดิบ: {formatBaht(selectedCost.costPerGramOfFinishedIceCream, 4)} /
                    กรัม (ตักได้ ~{selectedCost.yieldCups.toFixed(1)} ชิ้น/หม้อ)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="bg-white p-2.5 rounded-xl border border-[#eae3cf] flex flex-col justify-between gap-1">
                    <span className="font-bold text-[#6b8799]">
                      1. น้ำหนักรวมที่ได้ต่อ 1 ล็อตผลิต:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder={String(selectedCost.rawTotalBatchGrams || 1000)}
                        value={
                          selectedRecipe.batchYieldGrams && selectedRecipe.batchYieldGrams > 0
                            ? selectedRecipe.batchYieldGrams
                            : ''
                        }
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          handleUpdateRecipeField(
                            'batchYieldGrams',
                            isNaN(val) || val <= 0 ? undefined : val
                          );
                        }}
                        className="w-full bg-[#fef9ec] border border-[#eae3cf] focus:border-[#118cd1] focus:outline-none rounded-lg px-2.5 py-1.5 text-right font-black text-[#0d3a57]"
                      />
                      <span className="font-bold text-[#0d3a57] shrink-0">กรัม / หม้อ</span>
                    </div>
                    <span className="text-[10px] text-[#6b8799]">
                      * เว้นว่างเพื่อใช้ผลรวมวัตถุดิบอัตโนมัติ (
                      {selectedCost.rawTotalBatchGrams.toLocaleString()} กรัม)
                    </span>
                  </label>

                  <label className="bg-white p-2.5 rounded-xl border border-[#eae3cf] flex flex-col justify-between gap-1">
                    <span className="font-bold text-[#6b8799]">
                      2. ปริมาณปริมาณต่อ 1 ชิ้น (สั่ง 1 ชิ้น):
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={selectedRecipe.gramsPerCup || 80}
                        onChange={(e) => {
                          const gCup = Math.max(1, parseFloat(e.target.value) || 80);
                          handleUpdateRecipeField('gramsPerCup', gCup);
                        }}
                        className="w-full bg-[#fef9ec] border-2 border-[#118cd1] focus:outline-none rounded-lg px-2.5 py-1.5 text-right font-black text-[#118cd1]"
                      />
                      <span className="font-bold text-[#0d3a57] shrink-0">กรัม / ชิ้น</span>
                    </div>
                    <span className="text-[10px] text-[#118cd1] font-bold">
                      = ต้นทุน {formatBaht(selectedCost.ingredientCostPerFullCup)} / ชิ้น
                    </span>
                  </label>

                  <label className="bg-white p-2.5 rounded-xl border border-[#eae3cf] flex flex-col justify-between gap-1">
                    <span className="font-bold text-[#6b8799]">
                      3. ปริมาณตักต่อรส (เมื่อสั่ง 2 ชิ้นใน 1 ชิ้น):
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={
                          selectedRecipe.gramsPerHalfCup ||
                          (selectedRecipe.gramsPerCup || 80) * (selectedRecipe.halfScoopRatio || 0.5)
                        }
                        onChange={(e) => {
                          const gHalf = Math.max(1, parseFloat(e.target.value) || 40);
                          const gCup = selectedRecipe.gramsPerCup || 80;
                          handleUpdateRecipeField('gramsPerHalfCup', gHalf);
                          handleUpdateRecipeField('halfScoopRatio', gHalf / gCup);
                        }}
                        className="w-full bg-[#fef9ec] border border-[#eae3cf] focus:border-[#118cd1] focus:outline-none rounded-lg px-2.5 py-1.5 text-right font-black text-[#0d3a57]"
                      />
                      <span className="font-bold text-[#0d3a57] shrink-0">กรัม / รส</span>
                    </div>
                    <span className="text-[10px] text-[#6b8799] font-bold">
                      = ต้นทุน {formatBaht(selectedCost.ingredientCostPerHalfCup)} / รส
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* ตารางส่วนผสมของสินค้านี้ พร้อม Dropdown เลือกล็อตการซื้อ */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-[#eae3cf] text-xs text-[#6b8799] uppercase">
                    <th className="py-2.5 px-2.5">วัตถุดิบที่ใช้</th>
                    <th className="py-2.5 px-2.5">
                      ใช้วัตถุดิบของการซื้อครั้งไหน (Lot / ราคา)
                    </th>
                    <th className="py-2.5 px-2.5 text-right">ราคา/กรัม</th>
                    <th className="py-2.5 px-2.5 text-right">
                      {selectedRecipe.mode === 'per_cup'
                        ? 'ปริมาณ (กรัม/ชิ้น)'
                        : `ปริมาณ/หม้อ (รวม ${selectedCost.effectiveBatchGrams.toLocaleString()} g)`}
                    </th>
                    <th className="py-2.5 px-2.5 text-right">ต้นทุน/ชิ้น</th>
                    <th className="py-2.5 px-2 text-center">ลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eae3cf]">
                  {selectedCost.lineBreakdowns.map((line) => {
                    const ingLots = state.ingredientLots
                      .filter((l) => l.ingredientId === line.ingredientId)
                      .sort(
                        (a, b) =>
                          a.purchaseDate.localeCompare(b.purchaseDate) || a.id.localeCompare(b.id)
                      );

  return (
                      <tr key={line.ingredientId} className="hover:bg-[#fef9ec]/60">
                        <td className="py-2.5 px-2.5 font-extrabold text-[#0d3a57]">
                          {line.ingredientName}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <select
                            value={line.selectedLotId || 'fifo'}
                            onChange={(e) =>
                              handleUpdateIngredientLotSelection(
                                line.ingredientId,
                                e.target.value
                              )
                            }
                            className="w-full max-w-[270px] bg-[#fef9ec] border border-[#eae3cf] focus:border-[#118cd1] rounded-lg px-2 py-1.5 text-xs font-bold text-[#0d3a57]"
                          >
                            <option value="fifo">
                              🔄 ตัดตามคิว FIFO อัตโนมัติ ({line.activeVendor})
                            </option>
                            <option value="latest">📌 ใช้ราคาล็อตล่าสุดที่ซื้อเข้า</option>
                            {ingLots.map((lot, idx) => (
                              <option key={lot.id} value={lot.id}>
                                ครั้งที่ {idx + 1}: {lot.purchaseDate} · {lot.vendor} (
                                {formatBaht(lot.costPerGram, 4)}/g)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-xs font-bold text-[#0d3a57]">
                          {formatBaht(line.costPerGram, 4)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={line.gramsPerBatch}
                              onChange={(e) =>
                                handleUpdateIngredientGrams(
                                  line.ingredientId,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-20 bg-[#fef9ec] border border-[#eae3cf] focus:border-[#118cd1] rounded-lg px-2 py-1 text-right font-extrabold text-[#0d3a57]"
                            />
                            <span className="text-xs text-[#6b8799]">g</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-extrabold text-[#118cd1]">
                          {formatBaht(line.costPerCup, 2)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => handleRemoveIngredientFromRecipe(line.ingredientId)}
                            className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#fef9ec] font-extrabold text-[#0d3a57] border-t-2 border-[#eae3cf]">
                    <td colSpan={3} className="py-3 px-2.5">
                      รวมต้นทุนวัตถุดิบต่อ 1 ชิ้น ({selectedRecipe.name})
                    </td>
                    <td className="py-3 px-2.5 text-right">
                      {selectedCost.gramsPerFullCup.toFixed(1)} g / ชิ้น
                    </td>
                    <td className="py-3 px-2.5 text-right text-base text-[#118cd1]">
                      {formatBaht(selectedCost.ingredientCostPerFullCup, 2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ฟอร์มดึงวัตถุดิบเข้าสูตร พร้อมระบุว่าใช้การซื้อครั้งไหน */}
            <div className="bg-[#fef9ec] p-4 rounded-xl border border-[#eae3cf] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#0d3a57]">
                  + ดึงวัตถุดิบเข้าสูตรนี้ (พร้อมเลือกได้ว่าจะใช้วัตถุดิบของการซื้อครั้งไหน):
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('ingredients')}
                    className="inline-flex items-center gap-1 text-xs font-extrabold text-[#118cd1] hover:underline cursor-pointer"
                  >
                    ดูคลังวัตถุดิบทั้งหมด ({state.ingredients.length}) →
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickNewIngModal(true)}
                    className="text-xs font-extrabold text-emerald-700 hover:underline cursor-pointer"
                  >
                    + ไม่มีในรายการ? คลิกสร้างวัตถุดิบใหม่ตรงนี้
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleAddIngredientToRecipe}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5"
              >
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-[#6b8799] mb-1">
                    1. เลือกวัตถุดิบ
                  </label>
                  <select
                    value={addIngId}
                    onChange={(e) => {
                      setAddIngId(e.target.value);
                      setAddIngLotId('fifo');
                    }}
                    className="w-full bg-white border border-[#eae3cf] rounded-lg px-2.5 py-2 text-xs font-bold text-[#0d3a57]"
                  >
                    {state.ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-bold text-[#6b8799] mb-1">
                    2. ใช้ราคาจากการซื้อครั้งไหน (Lot)
                  </label>
                  <select
                    value={addIngLotId}
                    onChange={(e) => setAddIngLotId(e.target.value)}
                    className="w-full bg-white border border-[#eae3cf] rounded-lg px-2.5 py-2 text-xs font-bold text-[#0d3a57]"
                  >
                    <option value="fifo">🔄 อัตโนมัติตามคิว FIFO (เข้าก่อน-ออกก่อน)</option>
                    <option value="latest">📌 ล็อตล่าสุดที่ซื้อเข้า</option>
                    {lotsForAddIngredient.map((lot, idx) => (
                      <option key={lot.id} value={lot.id}>
                        ครั้งที่ {idx + 1}: {lot.purchaseDate} · {lot.vendor} (
                        {formatBaht(lot.costPerGram, 4)}/g)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3 flex items-end gap-1.5">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-[#6b8799] mb-1">
                      3. ปริมาณ (กรัม)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="กรัม"
                      value={addIngGrams}
                      onChange={(e) => setAddIngGrams(e.target.value)}
                      className="w-full bg-white border border-[#eae3cf] rounded-lg px-2.5 py-2 text-xs font-bold text-right"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-[#118cd1] hover:bg-[#0e78b5] text-white font-bold px-3.5 py-2 rounded-lg text-xs cursor-pointer shrink-0"
                  >
                    + ดึงลงสูตร
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
          </div>
        </div>
      )}

      {/* Modal ดูรายการ Slot (Lot) ทั้งหมดของวัตถุดิบแบบ Data Table */}
      {viewSlotsTargetIng && (
        <div className="fixed inset-0 bg-[#0d3a57]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-[#eae3cf] space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#0d3a57]">
                  View Slot — {viewSlotsTargetIng.name}
                </h3>
                <p className="text-xs text-[#6b8799] mt-0.5">
                  ประวัติการซื้อและ Vendor ทั้งหมดของ {viewSlotsTargetIng.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = viewSlotsTargetIng;
                    setViewSlotsTargetIng(null);
                    setAddSlotTargetIng(target);
                    setSlotVendor('');
                    setSlotWeight('1000');
                    setSlotPrice('');
                    setSlotPurchaseDate(new Date().toISOString().slice(0, 10));
                  }}
                  className="inline-flex items-center gap-1 bg-[#118cd1] hover:bg-[#0e76b2] text-white font-bold px-3 py-1.5 rounded-xl text-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Slot
                </button>
                <button
                  type="button"
                  onClick={() => setViewSlotsTargetIng(null)}
                  className="p-1.5 rounded-lg text-[#6b8799] hover:text-[#0d3a57] hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(() => {
              const targetLots = state.ingredientLots
                .filter((l) => l.ingredientId === viewSlotsTargetIng.id)
                .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.id.localeCompare(a.id));

              if (targetLots.length === 0) {
                return (
                  <div className="bg-[#fef9ec] rounded-xl p-8 text-center text-xs text-[#6b8799] border border-dashed border-[#eae3cf]">
                    ยังไม่มี Slot สำหรับวัตถุดิบนี้ — กดปุ่ม &ldquo;+ Add Slot&rdquo; ด้านบนเพื่อเพิ่มได้เลยครับ
                  </div>
                );
              }

              return (
                <div className="overflow-auto border border-[#eae3cf] rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-[#fef9ec] text-[#6b8799] border-b border-[#eae3cf] sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3 font-bold">#</th>
                        <th className="py-2.5 px-3 font-bold">วันที่ซื้อ</th>
                        <th className="py-2.5 px-3 font-bold">Vendor / แหล่งซื้อ</th>
                        <th className="py-2.5 px-3 font-bold text-right">ปริมาณ</th>
                        <th className="py-2.5 px-3 font-bold text-right">ราคารวม</th>
                        <th className="py-2.5 px-3 font-bold text-right">ราคา/หน่วย</th>
                        <th className="py-2.5 px-3 font-bold text-center w-12">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eae3cf]/60">
                      {targetLots.map((lot, idx) => (
                        <tr key={lot.id} className="hover:bg-[#fef9ec]/50">
                          <td className="py-2.5 px-3 font-bold text-[#6b8799]">
                            {targetLots.length - idx}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#0d3a57]">
                            {lot.purchaseDate}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#0d3a57]">
                            {lot.vendor || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#0d3a57]">
                            {lot.weightGrams.toLocaleString()} {lot.unit === 'pcs' ? 'ชิ้น' : 'g'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#0d3a57]">
                            {formatBaht(lot.totalPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                            {formatBaht(lot.costPerGram, 4)} / {lot.unit === 'pcs' ? 'ชิ้น' : 'g'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              title="ลบ Slot นี้"
                              onClick={() => {
                                if (!window.confirm('ต้องการลบ Slot นี้ใช่หรือไม่?')) return;
                                onUpdateState((prev) => ({
                                  ...prev,
                                  ingredientLots: prev.ingredientLots.filter((l) => l.id !== lot.id),
                                }));
                              }}
                              className="p-1 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal เพิ่ม Slot (Lot) ใหม่ให้วัตถุดิบ */}
      {addSlotTargetIng && (
        <div className="fixed inset-0 bg-[#0d3a57]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#eae3cf]">
            <h3 className="text-lg font-extrabold text-[#0d3a57]">
              Add Slot — {addSlotTargetIng.name}
            </h3>
            <p className="text-xs text-[#6b8799] mt-1">
              บันทึกล็อตราคาซื้อใหม่สำหรับ {addSlotTargetIng.name}
            </p>
            <form onSubmit={handleSaveAddSlot} className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    ชื่อร้านที่ซื้อ (Vendor) *
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ProBake, Makro"
                    value={slotVendor}
                    onChange={(e) => setSlotVendor(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    วันที่ซื้อ *
                  </label>
                  <input
                    type="date"
                    value={slotPurchaseDate}
                    onChange={(e) => setSlotPurchaseDate(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    ปริมาณที่ซื้อมา (กรัม) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={1}
                    placeholder="เช่น 1000"
                    value={slotWeight}
                    onChange={(e) => setSlotWeight(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    ราคารวมที่ซื้อมา (บาท) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="เช่น 450"
                    value={slotPrice}
                    onChange={(e) => setSlotPrice(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-bold"
                    required
                  />
                </div>
              </div>

              <div className="bg-[#fef9ec] p-3 rounded-xl border border-[#eae3cf] flex items-center justify-between text-xs">
                <span className="font-bold text-[#6b8799]">ราคาต่อกรัมที่คำนวณได้:</span>
                <b className="text-sm text-[#118cd1]">
                  {formatBaht(
                    (parseFloat(slotPrice) || 0) / Math.max(1, parseFloat(slotWeight) || 1),
                    4
                  )}{' '}
                  / กรัม
                </b>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddSlotTargetIng(null)}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-[#6b8799]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold text-sm bg-[#118cd1] hover:bg-[#0e76b2] text-white cursor-pointer"
                >
                  บันทึก Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal เพิ่มวัตถุดิบใหม่พร้อมใส่ล็อตราคาซื้อแรกได้ทันที */}
      {showQuickNewIngModal && (
        <div className="fixed inset-0 bg-[#0d3a57]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#eae3cf]">
            <h3 className="text-lg font-extrabold text-[#0d3a57]">
              เพิ่มวัตถุดิบใหม่ + บันทึกราคาซื้อล็อตแรก
            </h3>
            <p className="text-xs text-[#6b8799] mt-1">
              สร้างวัตถุดิบใหม่พร้อมคำนวณราคาต่อกรัมและบันทึกลงคลังวัตถุดิบ
            </p>
            <form onSubmit={handleQuickCreateIngredientAndAddToRecipe} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs font-bold text-[#6b8799] mb-1">
                  ชื่อวัตถุดิบใหม่ *
                </label>
                <input
                  type="text"
                  placeholder="เช่น ยูซุเพียวเร่, วานิลลามาเลย์, โอรีโอ้บด"
                  value={newIngName}
                  onChange={(e) => setNewIngName(e.target.value)}
                  className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6b8799] mb-1">หมวดหมู่</label>
                <select
                  value={newIngCat}
                  onChange={(e) => setNewIngCat(e.target.value as Ingredient['category'])}
                  className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                >
                  <option value="flavoring">วัตถุดิบหลัก</option>
                  <option value="dairy">วัตถุดิบสด / แช่เย็น</option>
                  <option value="base">วัตถุดิบแห้ง / ส่วนผสม</option>
                  <option value="topping">ส่วนเสริม / ตกแต่ง</option>
                  <option value="beverage">เครื่องดื่ม / อื่นๆ</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    ชื่อร้านที่ซื้อ (Vendor)
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ProBake, Makro"
                    value={newIngVendor}
                    onChange={(e) => setNewIngVendor(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    วันที่ซื้อ *
                  </label>
                  <input
                    type="date"
                    value={newIngPurchaseDate}
                    onChange={(e) => setNewIngPurchaseDate(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    น้ำหนักที่ซื้อมา (กรัม) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="เช่น 1000"
                    value={newIngWeight}
                    onChange={(e) => setNewIngWeight(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    ราคารวมที่ซื้อมา (บาท) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="เช่น 450"
                    value={newIngPrice}
                    onChange={(e) => setNewIngPrice(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-bold"
                    required
                  />
                </div>
              </div>

              <div className="bg-[#fef9ec] p-3 rounded-xl border border-[#eae3cf] flex items-center justify-between text-xs">
                <span className="font-bold text-[#6b8799]">ราคาต่อกรัมที่คำนวณได้:</span>
                <b className="text-sm text-[#118cd1]">
                  {formatBaht(
                    (parseFloat(newIngPrice) || 0) / Math.max(1, parseFloat(newIngWeight) || 1),
                    4
                  )}{' '}
                  / กรัม
                </b>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickNewIngModal(false)}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-[#6b8799]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  บันทึกวัตถุดิบ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal สร้างสินค้าใหม่ */}
      {showNewFlavorModal && (
        <div className="fixed inset-0 bg-[#0d3a57]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#eae3cf]">
            <h3 className="text-lg font-extrabold text-[#0d3a57]">เพิ่มสินค้า / เมนูใหม่</h3>
            <form onSubmit={handleCreateFlavor} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-bold text-[#6b8799] mb-1">
                  ชื่อสินค้า / เมนู *
                </label>
                <input
                  type="text"
                  placeholder="เช่น อเมริกาโน่เย็น, ครัวซองต์, เสื้อยืด"
                  value={newFlavorName}
                  onChange={(e) => setNewFlavorName(e.target.value)}
                  className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    หมวดหมู่สินค้า
                  </label>
                  <select
                    value={
                      productCategories.includes(newFlavorCat)
                        ? newFlavorCat
                        : newFlavorCat === ''
                        ? '__custom__'
                        : '__custom__'
                    }
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setNewFlavorCat('');
                      } else {
                        setNewFlavorCat(e.target.value);
                      }
                    }}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold bg-white text-[#0d3a57]"
                  >
                    {productCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">+ พิมพ์หมวดหมู่ใหม่...</option>
                  </select>
                  {!productCategories.includes(newFlavorCat) && (
                    <input
                      type="text"
                      placeholder="พิมพ์ชื่อหมวดหมู่ใหม่..."
                      value={newFlavorCat}
                      onChange={(e) => setNewFlavorCat(e.target.value)}
                      className="mt-1.5 w-full border-2 border-[#118cd1] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#0d3a57]"
                      required
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b8799] mb-1">
                    หน่วยขาย
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ชิ้น, แก้ว, กล่อง"
                    value={newFlavorUnit}
                    onChange={(e) => setNewFlavorUnit(e.target.value)}
                    className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6b8799] mb-1">
                  ราคาขายต่อหน่วย (บาท) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="เช่น 65"
                  value={newFlavorPrice}
                  onChange={(e) => setNewFlavorPrice(e.target.value)}
                  className="w-full border-2 border-[#eae3cf] rounded-xl px-3 py-2 text-sm font-bold"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewFlavorModal(false)}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-[#6b8799] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold text-sm bg-[#118cd1] text-white cursor-pointer"
                >
                  เพิ่มสินค้า
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
