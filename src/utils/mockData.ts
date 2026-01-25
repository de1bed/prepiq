// Mock data storage using localStorage
// This allows the app to work completely offline without Supabase

interface MockRecipe {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  stations: string[];
  batch_size: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MockSession {
  id: string;
  restaurant_id: string;
  session_date: string;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

interface MockOrder {
  id: string;
  restaurant_id: string;
  session_id: string;
  order_number: number;
  table_number: string | null;
  server_id: string | null;
  status: string;
  stations: string[];
  special_instructions: string | null;
  ordered_at: string;
  completed_at: string | null;
  created_at: string;
}

interface MockOrderItem {
  id: string;
  order_id: string;
  recipe_id: string;
  quantity: number;
  modifications: string[];
  station_assignments: string[];
  created_at: string;
}

const STORAGE_KEYS = {
  recipes: 'prepiq_mock_recipes',
  sessions: 'prepiq_mock_sessions',
  orders: 'prepiq_mock_orders',
  orderItems: 'prepiq_mock_order_items',
  sessionMenu: 'prepiq_mock_session_menu',
};

// Initialize mock data if it doesn't exist
export function initializeMockData(restaurantId: string) {
  if (!localStorage.getItem(STORAGE_KEYS.recipes)) {
    localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.sessions)) {
    // Create a default active session
    const defaultSession: MockSession = {
      id: 'mock-session-1',
      restaurant_id: restaurantId,
      session_date: new Date().toISOString().split('T')[0],
      is_active: true,
      started_at: new Date().toISOString(),
      ended_at: null,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([defaultSession]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.orders)) {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.orderItems)) {
    localStorage.setItem(STORAGE_KEYS.orderItems, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.sessionMenu)) {
    localStorage.setItem(STORAGE_KEYS.sessionMenu, JSON.stringify([]));
  }
}

// Mock Supabase-like API
export const mockSupabase = {
  recipes: {
    select: (columns: string) => ({
      eq: (column: string, value: any) => ({
        order: (column: string, options?: { ascending?: boolean }) => ({
          data: (): MockRecipe[] => {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.recipes) || '[]') as MockRecipe[];
            return all.filter((r: any) => r[column] === value);
          },
        }),
        data: (): MockRecipe[] => {
          const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.recipes) || '[]') as MockRecipe[];
          return all.filter((r: any) => r[column] === value);
        },
      }),
      data: (): MockRecipe[] => {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.recipes) || '[]') as MockRecipe[];
      },
    }),
    insert: (data: Partial<MockRecipe> | Partial<MockRecipe>[]) => ({
      select: () => ({
        single: () => ({
          data: (): MockRecipe | null => {
            const items = Array.isArray(data) ? data : [data];
            const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.recipes) || '[]') as MockRecipe[];
            const newItems = items.map((item, idx) => ({
              id: `mock-recipe-${Date.now()}-${idx}`,
              restaurant_id: item.restaurant_id || '',
              name: item.name || '',
              description: item.description || null,
              category: item.category || '',
              price: item.price || 0,
              stations: item.stations || [],
              batch_size: item.batch_size || 1,
              is_active: item.is_active !== undefined ? item.is_active : true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));
            localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify([...all, ...newItems]));
            return newItems[0] || null;
          },
        }),
        data: (): MockRecipe[] => {
          const items = Array.isArray(data) ? data : [data];
          const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.recipes) || '[]') as MockRecipe[];
          const newItems = items.map((item, idx) => ({
            id: `mock-recipe-${Date.now()}-${idx}`,
            restaurant_id: item.restaurant_id || '',
            name: item.name || '',
            description: item.description || null,
            category: item.category || '',
            price: item.price || 0,
            stations: item.stations || [],
            batch_size: item.batch_size || 1,
            is_active: item.is_active !== undefined ? item.is_active : true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
          localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify([...all, ...newItems]));
          return newItems;
        },
      }),
      data: (): MockRecipe[] => {
        const items = Array.isArray(data) ? data : [data];
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.recipes) || '[]') as MockRecipe[];
        const newItems = items.map((item, idx) => ({
          id: `mock-recipe-${Date.now()}-${idx}`,
          restaurant_id: item.restaurant_id || '',
          name: item.name || '',
          description: item.description || null,
          category: item.category || '',
          price: item.price || 0,
          stations: item.stations || [],
          batch_size: item.batch_size || 1,
          is_active: item.is_active !== undefined ? item.is_active : true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify([...all, ...newItems]));
        return newItems;
      },
    }),
    update: (updates: Partial<MockRecipe>) => ({
      eq: (column: string, value: any) => ({
        data: (): MockRecipe[] => {
          const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.recipes) || '[]') as MockRecipe[];
          const updated = all.map((item: any) => 
            item[column] === value ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
          );
          localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(updated));
          return updated.filter((item: any) => item[column] === value);
        },
      }),
    }),
  },
  daily_sessions: {
    select: (columns: string) => ({
      eq: (column: string, value: any) => ({
        order: (column: string, options?: { ascending?: boolean }) => ({
          limit: (count: number) => ({
            data: (): MockSession[] => {
              const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || '[]') as MockSession[];
              let filtered = all.filter((s: any) => s[column] === value);
              filtered.sort((a: any, b: any) => {
                const aVal = a[column];
                const bVal = b[column];
                if (options?.ascending) return aVal > bVal ? 1 : -1;
                return aVal < bVal ? 1 : -1;
              });
              return filtered.slice(0, count);
            },
          }),
        }),
      }),
    }),
  },
  orders: {
    select: (columns: string) => ({
      eq: (column: string, value: any) => ({
        order: (column: string, options?: { ascending?: boolean }) => ({
          data: (): MockOrder[] => {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders) || '[]') as MockOrder[];
            return all.filter((o: any) => o[column] === value);
          },
        }),
      }),
    }),
    insert: (data: Partial<MockOrder>) => ({
      select: () => ({
        single: () => ({
          data: (): MockOrder | null => {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders) || '[]') as MockOrder[];
            const newOrder: MockOrder = {
              id: `mock-order-${Date.now()}`,
              restaurant_id: data.restaurant_id || '',
              session_id: data.session_id || '',
              order_number: data.order_number || 1,
              table_number: data.table_number || null,
              server_id: data.server_id || null,
              status: data.status || 'pending',
              stations: (data.stations as string[]) || [],
              special_instructions: data.special_instructions || null,
              ordered_at: data.ordered_at || new Date().toISOString(),
              completed_at: data.completed_at || null,
              created_at: new Date().toISOString(),
            };
            localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify([...all, newOrder]));
            return newOrder;
          },
        }),
      }),
    }),
  },
  order_items: {
    select: (columns: string) => ({
      in: (column: string, values: string[]) => ({
        data: (): MockOrderItem[] => {
          const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.orderItems) || '[]') as MockOrderItem[];
          return all.filter((item: any) => values.includes(item[column]));
        },
      }),
    }),
    insert: (data: Partial<MockOrderItem> | Partial<MockOrderItem>[]) => ({
      data: (): void => {
        const items = Array.isArray(data) ? data : [data];
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.orderItems) || '[]') as MockOrderItem[];
        const newItems = items.map((item) => ({
          id: `mock-order-item-${Date.now()}-${Math.random()}`,
          order_id: item.order_id || '',
          recipe_id: item.recipe_id || '',
          quantity: item.quantity || 1,
          modifications: (item.modifications as string[]) || [],
          station_assignments: (item.station_assignments as string[]) || [],
          created_at: new Date().toISOString(),
        }));
        localStorage.setItem(STORAGE_KEYS.orderItems, JSON.stringify([...all, ...newItems]));
      },
    }),
  },
};

// Check if we should use mock data (when Supabase is unavailable)
export const USE_MOCK_DATA = true; // Set to false to use real Supabase when available
