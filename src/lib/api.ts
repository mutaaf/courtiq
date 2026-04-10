// Client-side data fetching helper — routes through /api/data to bypass RLS

interface QueryOptions {
  table: string;
  select?: string;
  filters?: Record<string, unknown>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  single?: boolean;
}

export async function query<T = unknown>(options: QueryOptions): Promise<T> {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!res.ok) {
      console.warn(`Query failed for ${options.table}:`, res.status);
      return (options.single ? null : []) as T;
    }

    const json = await res.json();
    return (json.data ?? (options.single ? null : [])) as T;
  } catch (err) {
    console.warn(`Query error for ${options.table}:`, err);
    return (options.single ? null : []) as T;
  }
}

// Mutation helper — for inserts/updates/deletes
interface MutationOptions {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data?: Record<string, unknown> | Record<string, unknown>[];
  filters?: Record<string, unknown>;
  select?: string;
}

export async function mutate<T = unknown>(options: MutationOptions): Promise<T> {
  const res = await fetch('/api/data/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Mutation failed');
  }

  const json = await res.json();
  return json.data;
}
