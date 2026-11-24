import fs from "fs";
import { fetchEtfs } from "./fetchEtfs";

const main = async () => {
  const etfs = await fetchEtfs();
  fs.writeFileSync("etfs.json", JSON.stringify(etfs));
};
main().finally(() => {
  console.log("done");
});
