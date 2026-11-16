import { AppDatabaseState, FlavorCategory } from '../types';
import { DEFAULT_REFV_POS_SETTINGS } from './posSync';

export const REFV_BASE_FLAVORS: { name: string; category: FlavorCategory; image: string }[] = [];

export function createInitialSeedState(): AppDatabaseState {
  return {
    settings: { ...DEFAULT_REFV_POS_SETTINGS },
    packagingItems: [],
    packagingLots: [],
    ingredients: [],
    ingredientLots: [],
    recipes: [],
    events: [],
  };
}
