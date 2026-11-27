import React, { useState } from 'react';
import { AppDatabaseState } from '../types';
import { SystemSimulationResult } from '../services/fifoEngine';
import { RecipeCostView } from './RecipeCostView';
import { FifoInventoryView } from './FifoInventoryView';
import { Scale, Package } from 'lucide-react';

interface Props {
  state: AppDatabaseState;
  sim: SystemSimulationResult;
  onUpdateState: (updater: (prev: AppDatabaseState) => AppDatabaseState) => void;
}

export const WarehouseView: React.FC<Props> = ({ state, sim, onUpdateState }) => {
  const [subTab, setSubTab] = useState<'ingredients' | 'consumption'>('ingredients');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-2 shadow-sm border border-[#eae3cf] inline-flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSubTab('ingredients')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
            subTab === 'ingredients'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-[#6b8799] hover:bg-[#fef9ec] hover:text-[#0d3a57]'
          }`}
        >
          <Scale className="w-4 h-4" />
          วัตถุดิบ ({state.ingredients.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('consumption')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
            subTab === 'consumption'
              ? 'bg-[#118cd1] text-white shadow-sm'
              : 'text-[#6b8799] hover:bg-[#fef9ec] hover:text-[#0d3a57]'
          }`}
        >
          <Package className="w-4 h-4" />
          สินค้า Consumtion ({state.packagingItems.length})
        </button>
      </div>

      {subTab === 'ingredients' ? (
        <RecipeCostView
          state={state}
          sim={sim}
          onUpdateState={onUpdateState}
          sectionMode="ingredients"
        />
      ) : (
        <FifoInventoryView
          state={state}
          sim={sim}
          onUpdateState={onUpdateState}
          onlyPackaging
        />
      )}
    </div>
  );
};
