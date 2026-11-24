import { AppDatabaseState, FlavorCategory } from '../types';

export const REFV_BASE_FLAVORS: { name: string; category: FlavorCategory; image: string }[] = [];

export function createInitialSeedState(): AppDatabaseState {
  return {
    settings: {
      sheetId: '',
      appsScriptUrl: '',
      shopName: 'BoothBook',
      branchName: '',
      promptPayNumber: '',
    },
    packagingItems: [],
    packagingLots: [],
    ingredients: [],
    ingredientLots: [],
    recipes: [],
    events: [],
  };
}
