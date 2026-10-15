import { listRegisteredStrategies } from "@/services/strategy";

export default function StrategiesPage() {
  const strategies = listRegisteredStrategies();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">策略</h1>
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">标识</th>
              <th className="px-3 py-2 text-left font-medium">名称</th>
              <th className="px-3 py-2 text-left font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((item) => (
              <tr
                key={item.id}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {item.id}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{item.name}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                  {item.description ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
