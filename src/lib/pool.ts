/** Run `worker` over `items` with at most `limit` in flight at once. */
export async function pool<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      // Sequential await is intentional: each runner drains the shared queue one
      // item at a time, and `limit` runners race in parallel — that bounded
      // concurrency is the whole point of the pool.
      // oxlint-disable-next-line no-await-in-loop
      results[index] = await worker(items[index]!, index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}
