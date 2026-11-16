import { ClassifiedEtf } from "./task/etf-categories";
import { getToCsv, saveToCsv } from "./utils/file";

const etfFields = [
  "category",
  "name",
  "code",
  "trackIndex",
  "trackingIndex",
  "premiumRate",
  "scale",
];
export const etfsData = {
  save: (data: ClassifiedEtf[]) => {
    saveToCsv("etfs.csv", data, etfFields);
  },
  get() {
    const data = getToCsv("etfs.csv", etfFields);
    return data.map((item) => {
      const res: ClassifiedEtf = {
        category: item.category,
        name: item.name,
        code: item.code,
        trackIndex: item.trackIndex,
        trackingIndex: item.trackingIndex,
        premiumRate: Number(item.premiumRate),
        scale: Number(item.scale),
      };
      return res;
    });
  },
};
