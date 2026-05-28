import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = normalizeUrl(process.env.LIA_E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_PROJECT_URL ?? '');
const supabasePublishableKey = process.env.LIA_E2E_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_PUBLIC_KEY ??
  '';
const apiUrl = normalizeUrl(process.env.LIA_E2E_API_URL ?? 'https://api.aneety.com');
const requiredEnv = ['LIA_E2E_ADMIN_EMAIL', 'LIA_E2E_ADMIN_PASSWORD'] as const;
const runE2E = process.env.LIA_E2E_ENABLED === '1' ? test : test.skip;

runE2E('Desktop opera pedido, checkpoint e anexo na API/Postgres real', async ({ page, baseURL }) => {
  assertConfig();
  const runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const customerName = `Desktop E2E Operacional ${runId}`;
  const attachmentFilename = `desktop-operational-${runId}.png`;
  const token = await signInForApi();

  const created = await jsonApiFetch<OrderResponse>('/api/orders', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      clientId: 'lia-desktop-e2e',
      customerName,
      customerPhone: '+595 21 555 001',
      deliveryAddress: 'Desktop E2E, Asunción',
      product: 'Molde prótese Desktop E2E',
      notes: `Criado pelo E2E desktop ${runId}`
    }
  });

  const desktopUrl = new URL(baseURL ?? 'https://desktop.aneety.com/');
  desktopUrl.searchParams.set('e2e', runId);
  await page.goto(desktopUrl.toString());
  await expect(page.getByRole('heading', { name: 'Operação desktop real' })).toBeVisible();
  await page.getByLabel('E-mail').fill(process.env.LIA_E2E_ADMIN_EMAIL!);
  await page.getByLabel('Senha').fill(process.env.LIA_E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Sessão ativa', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText(customerName, { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: `Abrir ${customerName}` }).click();
  await page.getByRole('tab', { name: 'Checkpoints' }).click();
  await page.getByLabel('Responsável').fill('Codex Desktop E2E');
  await page.getByLabel('Notas').fill('Checkpoint concluído no desktop publicado.');
  await page.getByRole('button', { name: 'Concluir Produção de molde início' }).click();
  await expect(page.getByText('Checkpoint Produção de molde início concluído na API/Postgres.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Codex Desktop E2E')).toBeVisible();

  await page.getByRole('tab', { name: 'Anexos' }).click();
  await page.setInputFiles('#desktopAttachment', {
    name: attachmentFilename,
    mimeType: 'image/png',
    buffer: Buffer.from(onePixelPng())
  });
  await page.getByRole('button', { name: 'Enviar anexo' }).click();
  await expect(page.getByText(`Anexo ${attachmentFilename} enviado para Supabase Storage via Worker.`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(attachmentFilename, { exact: true })).toBeVisible();

  const orders = await jsonApiFetch<OrderResponse[]>('/api/orders', { token });
  const syncedOrder = orders.find((order) => order.id === created.id || order.customerName === customerName);
  expect(syncedOrder?.id).toBeTruthy();
  expect(syncedOrder?.checkpoints.some((checkpoint) =>
    checkpoint.key === 'model_production_start' &&
    checkpoint.completed === true &&
    checkpoint.actor === 'Codex Desktop E2E'
  )).toBe(true);

  const attachments = await jsonApiFetch<AttachmentResponse[]>(`/api/orders/${created.id}/attachments`, { token });
  expect(attachments.some((attachment) => attachment.filename === attachmentFilename && attachment.contentType === 'image/png')).toBe(true);
});

type ApiFetchOptions = {
  method?: string;
  token?: string;
  expectedStatus?: number;
  body?: unknown;
};

type OrderResponse = {
  id: string;
  customerName?: string;
  status: string;
  checkpoints: Array<{ key: string; completed: boolean; actor?: string }>;
};

type AttachmentResponse = {
  filename: string;
  contentType: string;
};

function assertConfig(): void {
  const missing = [
    ...requiredEnv.filter((name) => !process.env[name]?.trim()),
    !supabaseUrl ? 'VITE_SUPABASE_URL' : '',
    !supabasePublishableKey ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : ''
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing E2E env vars: ${missing.join(', ')}`);
  }
}

async function signInForApi(): Promise<string> {
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.LIA_E2E_ADMIN_EMAIL!,
    password: process.env.LIA_E2E_ADMIN_PASSWORD!
  });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'Supabase Auth não retornou token');
  }
  return data.session.access_token;
}

async function jsonApiFetch<T>(path: string, options: ApiFetchOptions): Promise<T> {
  const response = await apiFetch(path, options);
  return await response.json() as T;
}

async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const headers = new Headers();
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  let body: BodyInit | undefined;

  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body
  });

  expectApiStatus(response, options.expectedStatus ?? 200, path);
  return response;
}

function expectApiStatus(response: Response, expectedStatus: number, path: string): void {
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function onePixelPng(): number[] {
  return [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a,
    0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
    0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ];
}
