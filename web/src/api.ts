export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface HealthStatus {
  status: string;
  postgres: boolean;
  duckdb: boolean;
}

export interface IngestionRun {
  id: number;
  source: string;
  dataset: string;
  season: number | null;
  row_count: number;
  parquet_path: string | null;
  status: string;
  error_message: string | null;
  synced_at: string;
}

export interface MediaAsset {
  id: number;
  title: string;
  description: string | null;
  media_type: 'audio' | 'image' | 'video';
  is_local_file: boolean;
  relative_path: string | null;
  source_url: string | null;
  source_name: string | null;
  license: string | null;
  league: string | null;
  season: number | null;
  game_id: string | null;
  team_abbr: string | null;
  player_id: string | null;
  tags: string[];
  file_size_bytes: number | null;
  created_at: string;
}

const API_BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const vaultApi = {
  health: () => request<HealthStatus>('/health'),
  views: () => request<{ views: string[] }>('/views'),
  query: (sql: string) =>
    request<QueryResult>('/query', {
      method: 'POST',
      body: JSON.stringify({ sql }),
    }),
  runs: (limit = 25) => request<IngestionRun[]>(`/runs?limit=${limit}`),
  syncCurrent: () => request<Record<string, unknown>>('/sync/current', { method: 'POST' }),
  syncNfl: (seasons?: number[], datasets?: string[]) =>
    request<Record<string, number>>('/sync/nfl', {
      method: 'POST',
      body: JSON.stringify({ seasons: seasons ?? null, datasets: datasets ?? null }),
    }),
  syncCfb: (seasons?: number[]) =>
    request<Record<string, number>>('/sync/cfb', {
      method: 'POST',
      body: JSON.stringify({ seasons: seasons ?? null }),
    }),
  syncSleeper: (forcePlayers = false) =>
    request<Record<string, number>>(`/sync/sleeper?force_players=${forcePlayers}`, {
      method: 'POST',
    }),
  syncWeather: (seasons?: number[]) =>
    request<Record<string, number>>('/sync/weather', {
      method: 'POST',
      body: JSON.stringify({ seasons: seasons ?? null }),
    }),
  mediaList: (params?: { media_type?: string; season?: number; team_abbr?: string }) => {
    const qs = new URLSearchParams();
    if (params?.media_type) qs.set('media_type', params.media_type);
    if (params?.season) qs.set('season', String(params.season));
    if (params?.team_abbr) qs.set('team_abbr', params.team_abbr);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<MediaAsset[]>(`/media${suffix}`);
  },
  mediaScan: () => request<{ registered: number }>('/media/scan', { method: 'POST' }),
  mediaRegister: (payload: Record<string, unknown>) =>
    request<MediaAsset>('/media/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  mediaFileUrl: (assetId: number) => `${API_BASE}/media/file/${assetId}`,
};
