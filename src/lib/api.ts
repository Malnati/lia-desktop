import { apiBaseUrl } from './env';

export type OrderCheckpoint = {
  id?: string;
  orderId?: string;
  key: string;
  label: string;
  completed: boolean;
  actor?: string;
  timestamp?: string;
  notes?: string;
};

export type Order = {
  id: string;
  tenantId?: string;
  clientId?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  product: string;
  status: string;
  paymentStatus: string;
  pendingSync: boolean;
  checkpoints: OrderCheckpoint[];
  notes: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AttachmentMetadata = {
  id: string;
  orderId: string;
  kind: 'photo' | 'signature';
  filename: string;
  contentType: string;
  size: number;
  clientAttachmentId?: string;
  capturedAt: string;
};

export async function loadOrders(accessToken: string): Promise<Order[]> {
  return apiRequest<Order[]>('/api/orders', accessToken);
}

export async function updateOrderStatus(accessToken: string, orderId: string, status: string): Promise<Order> {
  return apiRequest<Order>(`/api/orders/${orderId}/status`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

export async function updateCheckpoint(accessToken: string, orderId: string, checkpointKey: string, input: { actor: string; notes: string }): Promise<Order> {
  return apiRequest<Order>(`/api/orders/${orderId}/checkpoints/${checkpointKey}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({
      completed: true,
      actor: input.actor,
      notes: input.notes,
      timestamp: new Date().toISOString()
    })
  });
}

export async function uploadAttachment(accessToken: string, orderId: string, file: File, kind: 'photo' | 'signature'): Promise<AttachmentMetadata> {
  const form = new FormData();
  form.set('kind', kind);
  form.set('clientAttachmentId', `lia-desktop-${crypto.randomUUID()}`);
  form.set('capturedAt', new Date().toISOString());
  form.set('file', file);

  return apiRequest<AttachmentMetadata>(`/api/orders/${orderId}/attachments`, accessToken, {
    method: 'POST',
    body: form,
    json: false
  });
}

export async function loadAttachments(accessToken: string, orderId: string): Promise<AttachmentMetadata[]> {
  return apiRequest<AttachmentMetadata[]>(`/api/orders/${orderId}/attachments`, accessToken);
}

type ApiInit = RequestInit & { json?: boolean };

async function apiRequest<T>(path: string, accessToken: string, init: ApiInit = {}): Promise<T> {
  const useJson = init.json ?? Boolean(init.body && typeof init.body === 'string');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(useJson ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : undefined;
    throw new Error(message || `API returned ${response.status}`);
  }

  return payload as T;
}
