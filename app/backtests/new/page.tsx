import { NewBacktestForm } from "@/components/new-backtest-form";
import { listEtfs } from "@/services/repositories/etf.repository";
import { listRegisteredStrategies } from "@/services/strategy";

export const instant = false;

export default async function NewBacktestPage() {
  const [etfs, strategies] = await Promise.all([
    listEtfs(),
    Promise.resolve(listRegisteredStrategies()),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">新建回测</h1>
      <div className="max-w-3xl">
        <NewBacktestForm
          strategies={strategies.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description ?? null,
            params: item.params,
          }))}
          etfs={etfs.map((etf) => ({ code: etf.code, name: etf.name }))}
        />
      </div>
    </div>
  );
}
