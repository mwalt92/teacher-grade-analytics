type RpcError = { message: string };

type RpcInvoker = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: RpcError | null }>;

export async function rpcUntyped<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: RpcError | null }> {
  const rpc = (client as { rpc: RpcInvoker }).rpc.bind(client);
  const result = await rpc(fn, args);
  return { data: result.data as T | null, error: result.error };
}
