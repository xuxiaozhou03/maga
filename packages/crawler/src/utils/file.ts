import fs from "fs/promises";

export const saveToFile = async (filePath: string, data: string) => {
  await fs.writeFile(filePath, data, "utf-8");
};

export const readFromFile = async (filePath: string) => {
  const content = await fs.readFile(filePath, "utf-8");
  return content;
};
