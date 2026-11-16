import fs from "fs";
import path from "path";

const dataDir = path.resolve(__dirname, "..", "..", "output");

export const saveToFile = (filename: string, data: string) => {
  fs.writeFileSync(path.resolve(dataDir, filename), data);
};
export const getToFile = (filename: string) => {
  try {
    return fs.readFileSync(path.resolve(dataDir, filename), {
      encoding: "utf-8",
    });
  } catch {
    return "";
  }
};

export const saveToCsv = (
  filename: string,
  data: Array<any>,
  fields: string[],
) => {
  saveToFile(
    filename,
    [
      fields.join(","),
      ...data.map((item: any) => fields.map((field) => item[field])),
    ].join("\n"),
  );
};

export const getToCsv = <T = any>(filename: string, fields: string[]) => {
  const content = getToFile(filename);
  return content.split("\n").map((line) => {
    return line.split(",").reduce((acc, item, index) => {
      return {
        ...acc,
        [fields[index]]: item,
      };
    }, {} as T);
  });
};
