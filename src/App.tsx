import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Activity, ClipboardCheck, Database, FileImage, LoaderCircle, LogOut, PackageCheck, RefreshCw, ShieldCheck, Upload } from 'lucide-react';

import {
  loadAttachments,
  loadOrders,
  updateCheckpoint,
  updateOrderStatus,
  uploadAttachment,
  type AttachmentMetadata,
  type Order,
  type OrderCheckpoint
} from '@/lib/api';
import { apiBaseUrl, isSupabaseConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@/components/ui/sidebar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const checkpointGroups = [
  { value: 'pickup', label: 'Retirada', keys: ['pickup_checkin', 'pickup_checkout'] },
  { value: 'model', label: 'Molde', keys: ['model_production_start', 'model_production_done'] },
  { value: 'prosthesis', label: 'Prótese', keys: ['prosthesis_production_start', 'prosthesis_production_done'] },
  { value: 'delivery', label: 'Entrega', keys: ['delivery_checkin', 'delivery_checkout'] }
] as const;

const statusOptions = [
  'draft',
  'awaiting_payment',
  'paid',
  'pickup_scheduled',
  'picked_up',
  'in_model_production',
  'model_ready',
  'in_prosthesis_production',
  'prosthesis_ready',
  'ready_for_delivery',
  'delivery_scheduled',
  'delivered',
  'cancelled'
];

const links = [
  { label: 'Portal', href: 'https://aneety.com/' },
  { label: 'API health', href: 'https://api.aneety.com/api/health' },
  { label: 'Core', href: 'https://core.aneety.com/' }
];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([]);
  const [statusDraft, setStatusDraft] = useState('draft');
  const [checkpointActor, setCheckpointActor] = useState('Operação Desktop');
  const [checkpointNotes, setCheckpointNotes] = useState('Atualizado no Lia Desktop publicado.');
  const [attachmentKind, setAttachmentKind] = useState<'photo' | 'signature'>('photo');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [message, setMessage] = useState('Faça login para carregar pedidos reais da API.');
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? orders[0], [orders, selectedOrderId]);
  const completedCheckpointCount = selectedOrder?.checkpoints.filter((checkpoint) => checkpoint.completed).length ?? 0;

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void refreshOrders(session.access_token);
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !selectedOrder?.id) {
      setAttachments([]);
      return;
    }
    void refreshAttachments(session.access_token, selectedOrder.id);
    setStatusDraft(selectedOrder.status);
  }, [session?.access_token, selectedOrder?.id, selectedOrder?.status]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError('Configuração pública Supabase ausente no build desktop.');
      return;
    }

    setIsSigningIn(true);
    setError('');
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setIsSigningIn(false);

    if (signInError || !data.session) {
      setError(signInError?.message ?? 'Login Supabase falhou.');
      return;
    }

    setSession(data.session);
    setMessage('Sessão ativa. Carregando pedidos reais via Worker/Hono.');
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setOrders([]);
    setAttachments([]);
    setSelectedOrderId('');
    setMessage('Sessão encerrada.');
  }

  async function refreshOrders(accessToken = session?.access_token) {
    if (!accessToken) return;
    setIsLoadingOrders(true);
    setError('');
    try {
      const nextOrders = await loadOrders(accessToken);
      setOrders(nextOrders);
      setSelectedOrderId((current) => (nextOrders.some((order) => order.id === current) ? current : nextOrders[0]?.id ?? ''));
      setMessage(`Pedidos carregados de ${apiBaseUrl}.`);
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setIsLoadingOrders(false);
    }
  }

  async function refreshAttachments(accessToken: string, orderId: string) {
    try {
      setAttachments(await loadAttachments(accessToken, orderId));
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    }
  }

  async function completeCheckpoint(checkpoint: OrderCheckpoint) {
    if (!session?.access_token || !selectedOrder?.id) return;
    setIsMutating(true);
    setError('');
    try {
      const updated = await updateCheckpoint(session.access_token, selectedOrder.id, checkpoint.key, {
        actor: checkpointActor,
        notes: checkpointNotes
      });
      setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
      setMessage(`Checkpoint ${checkpoint.label} concluído na API/Postgres.`);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setIsMutating(false);
    }
  }

  async function changeStatus() {
    if (!session?.access_token || !selectedOrder?.id) return;
    setIsMutating(true);
    setError('');
    try {
      const updated = await updateOrderStatus(session.access_token, selectedOrder.id, statusDraft);
      setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
      setMessage(`Status atualizado para ${statusLabel(statusDraft)}.`);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setIsMutating(false);
    }
  }

  async function sendAttachment() {
    if (!session?.access_token || !selectedOrder?.id || !attachmentFile) {
      setError('Selecione um pedido e um arquivo PNG/JPEG/WebP antes de anexar.');
      return;
    }

    setIsMutating(true);
    setError('');
    try {
      const created = await uploadAttachment(session.access_token, selectedOrder.id, attachmentFile, attachmentKind);
      setAttachments((current) => [created, ...current]);
      setAttachmentFile(null);
      setMessage(`Anexo ${created.filename} enviado para Supabase Storage via Worker.`);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="none">
        <SidebarHeader>
          <Badge className="w-fit" variant="secondary">Operação desktop</Badge>
          <div className="px-2">
            <h1 className="text-xl font-semibold tracking-tight">Lia Desktop</h1>
            <p className="text-sm text-muted-foreground">Atendimento, produção, logística e anexos.</p>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Fluxos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Activity />Pedidos reais
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ClipboardCheck />Checkpoints
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <FileImage />Anexos
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex flex-col gap-2 px-2 py-3">
            <Badge variant="outline">{apiBaseUrl}</Badge>
            {session && <Button type="button" variant="outline" onClick={() => void signOut()}><LogOut data-icon="inline-start" />Sair</Button>}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
          <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight">Operação desktop real</h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">Login Supabase, pedidos do Postgres, checkpoints e anexos via API Worker/Hono publicada.</p>
              </div>
              <Button asChild>
                <a href="https://desktop.aneety.com/">Abrir URL pública</a>
              </Button>
            </div>

            <Alert>
              <ShieldCheck />
              <AlertTitle>Arquitetura vigente</AlertTitle>
              <AlertDescription>Cloudflare Pages Free + Supabase Auth + API real Worker/Hono + Supabase/Postgres. Service role nunca entra no frontend.</AlertDescription>
            </Alert>

            {error && (
              <Alert variant="destructive" data-testid="desktop-error">
                <ShieldCheck />
                <AlertTitle>Ação bloqueada</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Login Supabase</CardTitle>
                  <CardDescription>Use usuário real com permissões operacionais. Build precisa de chave pública Supabase.</CardDescription>
                </CardHeader>
                <CardContent>
                  {session ? (
                    <div className="flex flex-col gap-3">
                      <Badge className="w-fit" variant="secondary">Sessão ativa</Badge>
                      <p className="text-sm text-muted-foreground">{session.user.email}</p>
                      <Button type="button" variant="outline" onClick={() => void refreshOrders()} disabled={isLoadingOrders}>
                        {isLoadingOrders && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
                        Recarregar pedidos
                      </Button>
                    </div>
                  ) : (
                    <form className="flex flex-col gap-4" onSubmit={(event) => void signIn(event)}>
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="email">E-mail</FieldLabel>
                          <Input id="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="password">Senha</FieldLabel>
                          <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                        </Field>
                      </FieldGroup>
                      <Button type="submit" disabled={isSigningIn || !isSupabaseConfigured}>
                        {isSigningIn && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
                        Entrar
                      </Button>
                      {!isSupabaseConfigured && <p className="text-sm text-destructive">Build sem VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY.</p>}
                    </form>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumo operacional</CardTitle>
                  <CardDescription>{message}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Pedidos" value={orders.length} icon={Database} />
                  <MetricCard label="Checkpoints" value={completedCheckpointCount} icon={ClipboardCheck} />
                  <MetricCard label="Anexos" value={attachments.length} icon={FileImage} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Pedidos do tenant</CardTitle>
                <CardDescription>Listagem via `GET /api/orders`; selecione um pedido para operar checkpoints e anexos.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Atualizado</TableHead>
                      <TableHead>Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id} data-testid="desktop-order-row" data-selected={selectedOrder?.id === order.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{order.customerName}</span>
                            <span className="text-xs text-muted-foreground">{order.product} · {order.deliveryAddress}</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{statusLabel(order.status)}</Badge></TableCell>
                        <TableCell><Badge variant="outline">{statusLabel(order.paymentStatus)}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(order.updatedAt ?? order.createdAt)}</TableCell>
                        <TableCell>
                          <Button type="button" variant="outline" onClick={() => setSelectedOrderId(order.id)}>Abrir {order.customerName}</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">Nenhum pedido carregado.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedOrder && (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedOrder.customerName}</CardTitle>
                  <CardDescription>Pedido {selectedOrder.id}; versão {selectedOrder.version}; integração real com API/Postgres.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="checkpoints" className="flex-col gap-4">
                    <TabsList className="w-fit">
                      <TabsTrigger value="pedido">Pedido</TabsTrigger>
                      <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
                      <TabsTrigger value="anexos">Anexos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="pedido">
                      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                        <Card>
                          <CardHeader>
                            <CardTitle>Dados do pedido</CardTitle>
                            <CardDescription>{selectedOrder.product}</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3 text-sm">
                            <p><strong>Telefone:</strong> {selectedOrder.customerPhone}</p>
                            <p><strong>Endereço:</strong> {selectedOrder.deliveryAddress}</p>
                            <p><strong>Notas:</strong> {selectedOrder.notes || 'Sem notas.'}</p>
                            <Sheet>
                              <SheetTrigger asChild>
                                <Button type="button" variant="outline">Abrir ficha operacional</Button>
                              </SheetTrigger>
                              <SheetContent>
                                <SheetHeader>
                                  <SheetTitle>Ficha operacional</SheetTitle>
                                  <SheetDescription>{selectedOrder.customerName}</SheetDescription>
                                </SheetHeader>
                                <div className="flex flex-col gap-3 p-4 text-sm">
                                  <Badge className="w-fit" variant="secondary">{statusLabel(selectedOrder.status)}</Badge>
                                  <p>{selectedOrder.product}</p>
                                  <p>{selectedOrder.deliveryAddress}</p>
                                  <p className="text-muted-foreground">clientId: {selectedOrder.clientId ?? 'sem clientId'}</p>
                                </div>
                              </SheetContent>
                            </Sheet>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle>Editar status</CardTitle>
                            <CardDescription>Usa `PATCH /api/orders/:id/status`.</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <Field>
                              <FieldLabel htmlFor="orderStatus">Status operacional</FieldLabel>
                              <Select value={statusDraft} onValueChange={setStatusDraft}>
                                <SelectTrigger id="orderStatus" className="w-full">
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {statusOptions.map((status) => (
                                      <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              <FieldDescription>Transições inválidas são bloqueadas pelo Worker.</FieldDescription>
                            </Field>
                            <Button type="button" onClick={() => void changeStatus()} disabled={isMutating || statusDraft === selectedOrder.status}>Atualizar status</Button>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="checkpoints">
                      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                        <Card>
                          <CardHeader>
                            <CardTitle>Registro operacional</CardTitle>
                            <CardDescription>Aplicado ao checkpoint concluído.</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-4">
                            <FieldGroup>
                              <Field>
                                <FieldLabel htmlFor="checkpointActor">Responsável</FieldLabel>
                                <Input id="checkpointActor" value={checkpointActor} onChange={(event) => setCheckpointActor(event.target.value)} />
                              </Field>
                              <Field>
                                <FieldLabel htmlFor="checkpointNotes">Notas</FieldLabel>
                                <Textarea id="checkpointNotes" value={checkpointNotes} onChange={(event) => setCheckpointNotes(event.target.value)} />
                              </Field>
                            </FieldGroup>
                          </CardContent>
                        </Card>
                        <div className="grid gap-4 md:grid-cols-2">
                          {checkpointGroups.map((group) => (
                            <Card key={group.value}>
                              <CardHeader>
                                <CardTitle>{group.label}</CardTitle>
                                <CardDescription>Checkpoints publicados em `/api/orders/:id/checkpoints/:key`.</CardDescription>
                              </CardHeader>
                              <CardContent className="flex flex-col gap-3">
                                {selectedOrder.checkpoints.filter((checkpoint) => group.keys.includes(checkpoint.key as never)).map((checkpoint) => (
                                  <div key={checkpoint.key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium">{checkpoint.label}</span>
                                      <Badge variant={checkpoint.completed ? 'secondary' : 'outline'}>{checkpoint.completed ? 'concluído' : 'pendente'}</Badge>
                                    </div>
                                    {checkpoint.actor && <p className="text-xs text-muted-foreground">{checkpoint.actor} · {formatDate(checkpoint.timestamp)}</p>}
                                    <Button type="button" variant="outline" onClick={() => void completeCheckpoint(checkpoint)} disabled={isMutating}>
                                      <PackageCheck data-icon="inline-start" />
                                      Concluir {checkpoint.label}
                                    </Button>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="anexos">
                      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                        <Card>
                          <CardHeader>
                            <CardTitle>Enviar anexo</CardTitle>
                            <CardDescription>Usa `POST /api/orders/:id/attachments` e Supabase Storage.</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-4">
                            <FieldGroup>
                              <Field>
                                <FieldLabel htmlFor="attachmentKind">Tipo</FieldLabel>
                                <Select value={attachmentKind} onValueChange={(value) => setAttachmentKind(value as 'photo' | 'signature')}>
                                  <SelectTrigger id="attachmentKind" className="w-full">
                                    <SelectValue placeholder="Tipo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      <SelectItem value="photo">Foto</SelectItem>
                                      <SelectItem value="signature">Assinatura</SelectItem>
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field>
                                <FieldLabel htmlFor="desktopAttachment">Arquivo</FieldLabel>
                                <Input id="desktopAttachment" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} />
                                <FieldDescription>{attachmentFile ? `${attachmentFile.name} · ${Math.round(attachmentFile.size / 1024)} KB` : 'PNG, JPEG ou WebP até 5 MB.'}</FieldDescription>
                              </Field>
                            </FieldGroup>
                            <Button type="button" onClick={() => void sendAttachment()} disabled={isMutating || !attachmentFile}>
                              <Upload data-icon="inline-start" />
                              Enviar anexo
                            </Button>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle>Anexos publicados</CardTitle>
                            <CardDescription>Consulta real via `GET /api/orders/:id/attachments`.</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            {attachments.map((attachment) => (
                              <div key={attachment.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                                <div>
                                  <p className="font-medium">{attachment.filename}</p>
                                  <p className="text-xs text-muted-foreground">{attachment.contentType} · {attachment.size} bytes · {formatDate(attachment.capturedAt)}</p>
                                </div>
                                <Badge variant="outline">{attachment.kind}</Badge>
                              </div>
                            ))}
                            {attachments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum anexo para este pedido.</p>}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Baseline shadcn/ui</CardTitle>
                <CardDescription>Sidebar, Table, Tabs, Sheet, DropdownMenu, Field, Select, Badge e Alert versionados no repo.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="outline">Sidebar</Badge>
                <Badge variant="outline">Table</Badge>
                <Badge variant="outline">Tabs</Badge>
                <Badge variant="outline">Sheet</Badge>
                <Badge variant="outline">DropdownMenu</Badge>
                <Badge variant="outline">Field</Badge>
                <Badge variant="outline">Select</Badge>
                <Badge variant="outline">Badge</Badge>
                <Badge variant="outline">Alert</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">Links</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuGroup>
                      {links.map((link) => (
                        <DropdownMenuItem key={link.href} asChild>
                          <a href={link.href}>{link.label}</a>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

type MetricCardProps = {
  label: string;
  value: number;
  icon: typeof Activity;
};

function MetricCard({ label, value, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon />{label}</div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function statusLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatDate(value?: string): string {
  if (!value) return 'sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'Erro inesperado';
}
