import type { ExportJob, Metadata, SearchRequest, SearchResponse } from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('API 서버에 연결할 수 없습니다. 연결 상태를 확인해 주세요.');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('API 서버가 올바른 응답을 반환하지 않았습니다.');
  }
  if (!response.ok)
    throw new Error(
      payload.error?.details?.map((item: { message: string }) => item.message).join(' ') ||
        payload.error?.message ||
        `요청에 실패했습니다. (${response.status})`,
    );
  return payload as T;
}

export const api = {
  metadata: () => request<Metadata>('/metadata'),
  search: (body: SearchRequest, signal?: AbortSignal) =>
    request<SearchResponse>('/logs/search', { method: 'POST', body: JSON.stringify(body), signal }),
  export: (search: SearchRequest, format: string) =>
    request<ExportJob>('/exports', {
      method: 'POST',
      body: JSON.stringify({ search: { ...search, cursor: null }, format }),
    }),
  exportStatus: (id: string) => request<ExportJob>(`/exports/${encodeURIComponent(id)}`),
};
