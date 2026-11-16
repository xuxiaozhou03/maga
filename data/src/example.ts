import { runEtfFeaturesTask } from "./task/etf-features";
import { runEtfListTask } from "./task/etf-list";

const main = async () => {
  await runEtfListTask();

  await runEtfFeaturesTask();
};

main().finally(() => {
  console.log("done");
});
