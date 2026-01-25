// Wrapper for Supabase that falls back to localStorage when Supabase is unavailable
import { supabase } from '@/integrations/supabase/client';

const USE_MOCK_DATA = true; // Set to false to try real Supabase first

// Simple localStorage-based mock database
class MockDB {
  private getStorageKey(table: string) {
    return `prepiq_${table}`;
  }

  private getData(table: string): any[] {
    const key = this.getStorageKey(table);
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  private setData(table: string, data: any[]) {
    const key = this.getStorageKey(table);
    localStorage.setItem(key, JSON.stringify(data));
  }

  select(table: string, columns?: string) {
    const data = this.getData(table);
    return {
      eq: (col: string, val: any) => ({
        order: (col: string, opts?: { ascending?: boolean }) => ({
          limit: (count: number) => ({
            data: data.filter((r: any) => r[col] === val)
              .sort((a: any, b: any) => {
                const aVal = a[col];
                const bVal = b[col];
                return opts?.ascending ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
              })
              .slice(0, count)
          }),
          data: data.filter((r: any) => r[col] === val)
            .sort((a: any, b: any) => {
              const aVal = a[col];
              const bVal = b[col];
              return opts?.ascending ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
            })
        }),
        data: data.filter((r: any) => r[col] === val)
      }),
      in: (col: string, vals: string[]) => ({
        data: data.filter((r: any) => vals.includes(r[col]))
      }),
      data: data
    };
  }

  insert(table: string, items: any | any[]) {
    const data = this.getData(table);
    const newItems = Array.isArray(items) ? items : [items];
    const withIds = newItems.map((item: any, idx: number) => ({
      ...item,
      id: item.id || `${table}-${Date.now()}-${idx}`,
      created_at: item.created_at || new Date().toISOString(),
      updated_at: item.updated_at || new Date().toISOString(),
    }));
    this.setData(table, [...data, ...withIds]);
    return {
      select: () => ({
        single: () => ({ data: withIds[0] }),
        data: withIds
      }),
      data: withIds
    };
  }

  update(table: string, updates: any) {
    return {
      eq: (col: string, val: any) => {
        const data = this.getData(table);
        const updated = data.map((item: any) => 
          item[col] === val ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
        );
        this.setData(table, updated);
        return { data: updated.filter((item: any) => item[col] === val) };
      }
    };
  }

  delete(table: string) {
    return {
      eq: (col: string, val: any) => {
        const data = this.getData(table);
        const filtered = data.filter((item: any) => item[col] !== val);
        this.setData(table, filtered);
        return { data: [] };
      }
    };
  }
}

const mockDB = new MockDB();

// Initialize default session if needed
export function initializeMockData(restaurantId: string) {
  const sessions = mockDB.select('daily_sessions').eq('restaurant_id', restaurantId).eq('is_active', true).data();
  if (sessions.length === 0) {
    mockDB.insert('daily_sessions', {
      id: 'mock-session-1',
      restaurant_id: restaurantId,
      session_date: new Date().toISOString().split('T')[0],
      is_active: true,
      started_at: new Date().toISOString(),
      ended_at: null,
    });
  }
}

// Wrapper that tries Supabase first, falls back to mock
export async function safeSupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  mockFn: () => { data: T | null; error: null }
): Promise<{ data: T | null; error: any }> {
  if (USE_MOCK_DATA) {
    try {
      return mockFn();
    } catch (error) {
      return { data: null, error };
    }
  }

  try {
    return await queryFn();
  } catch (error: any) {
    // If Supabase fails, use mock
    console.warn('Supabase query failed, using mock data:', error);
    try {
      return mockFn();
    } catch (mockError) {
      return { data: null, error: mockError };
    }
  }
}

// Create a Supabase-like interface using mock data
export const mockSupabase = {
  from: (table: string) => ({
    select: (columns?: string) => mockDB.select(table, columns),
    insert: (data: any) => mockDB.insert(table, data),
    update: (updates: any) => mockDB.update(table, updates),
    delete: () => mockDB.delete(table),
  }),
};

// Export a wrapper that uses mock when Supabase fails
export const safeSupabase = {
  from: (table: string) => {
    if (USE_MOCK_DATA) {
      return mockSupabase.from(table);
    }

    // Try to use real Supabase, but catch errors
    return {
      select: (columns?: string) => {
        const query = supabase.from(table as any).select(columns);
        return {
          eq: (col: string, val: any) => {
            const realQuery = query.eq(col, val);
            return {
              order: (col: string, opts?: { ascending?: boolean }) => {
                const ordered = realQuery.order(col, opts);
                return {
                  limit: (count: number) => ({
                    data: async () => {
                      try {
                        const { data, error } = await ordered.limit(count);
                        if (error) throw error;
                        return data;
                      } catch {
                        return mockDB.select(table).eq(col, val).order(col, opts).limit(count).data();
                      }
                    }
                  }),
                  data: async () => {
                    try {
                      const { data, error } = await ordered;
                      if (error) throw error;
                      return data;
                    } catch {
                      return mockDB.select(table).eq(col, val).order(col, opts).data();
                    }
                  }
                };
              },
              data: async () => {
                try {
                  const { data, error } = await realQuery;
                  if (error) throw error;
                  return data;
                } catch {
                  return mockDB.select(table).eq(col, val).data();
                }
              }
            };
          },
          in: (col: string, vals: string[]) => ({
            data: async () => {
              try {
                const { data, error } = await query.in(col, vals);
                if (error) throw error;
                return data;
              } catch {
                return mockDB.select(table).in(col, vals).data();
              }
            }
          }),
          data: async () => {
            try {
              const { data, error } = await query;
              if (error) throw error;
              return data;
            } catch {
              return mockDB.select(table).data();
            }
          }
        };
      },
      insert: (data: any) => {
        const insert = supabase.from(table as any).insert(data);
        return {
          select: () => ({
            single: async () => {
              try {
                const { data: result, error } = await insert.select().single();
                if (error) throw error;
                return { data: result };
              } catch {
                const result = mockDB.insert(table, Array.isArray(data) ? data[0] : data);
                return { data: result.select().single().data };
              }
            },
            data: async () => {
              try {
                const { data: result, error } = await insert.select();
                if (error) throw error;
                return result;
              } catch {
                return mockDB.insert(table, data).select().data;
              }
            }
          }),
          data: async () => {
            try {
              const { data: result, error } = await insert;
              if (error) throw error;
              return result;
            } catch {
              return mockDB.insert(table, data).data;
            }
          }
        };
      },
      update: (updates: any) => {
        const update = supabase.from(table as any).update(updates);
        return {
          eq: (col: string, val: any) => ({
            data: async () => {
              try {
                const { data, error } = await update.eq(col, val);
                if (error) throw error;
                return data;
              } catch {
                return mockDB.update(table, updates).eq(col, val).data;
              }
            }
          })
        };
      },
      delete: () => {
        const del = supabase.from(table as any).delete();
        return {
          eq: (col: string, val: any) => ({
            data: async () => {
              try {
                const { data, error } = await del.eq(col, val);
                if (error) throw error;
                return data;
              } catch {
                return mockDB.delete(table).eq(col, val).data;
              }
            }
          })
        };
      }
    };
  }
};
