import source from "./source";

export const runStep = async <T = any>(
  filename: string,
  handler: () => Promise<T>,
  fields?: string[],
) => {
  const fileData = fields
    ? source.getCsv(filename, fields)
    : source.getJson(filename);
  if (!fileData) {
    const data = await handler();
    if (fields) {
      source.saveCsv(filename, data as any, fields);
    } else {
      source.saveJson(filename, data);
    }
    return data;
  }
  return fileData as T;
};
