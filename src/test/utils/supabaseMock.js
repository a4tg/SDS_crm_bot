export function createSupabaseMock({ data = {}, single = {} } = {}) {
  const getResult = (table) => {
    const rows = data[table] ?? [];
    return { data: rows, error: null, count: rows.length };
  };

  const builder = (table) => {
    const api = {
      select: () => api,
      eq: () => api,
      neq: () => api,
      not: () => api,
      or: () => api,
      ilike: () => api,
      order: () => api,
      range: () => api,
      limit: () => api,
      single: () =>
        Promise.resolve({ data: single[table] ?? null, error: null }),
      insert: () => Promise.resolve({ data: [], error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      then: (resolve, reject) =>
        Promise.resolve(getResult(table)).then(resolve, reject),
    };
    return api;
  };

  return {
    from: (table) => builder(table),
  };
}
