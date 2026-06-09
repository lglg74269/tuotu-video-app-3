/** 有限并发执行队列任务 */
export async function runPool(items, limit, fn) {
  const queue = [...items];
  const n = Math.max(1, Math.min(limit, queue.length || 1));
  const workers = Array.from({ length: n }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) break;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
