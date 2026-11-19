import fs from "fs";
import path from "path";

class Source {
  dataDir: string;

  constructor() {
    this.dataDir = path.resolve(__dirname, "..", "..", "output");
  }
  private _save(filename: string, data: string) {
    fs.writeFileSync(path.resolve(this.dataDir, filename), data);
  }
  saveJson(filename: string, data: any) {
    this._save(filename, JSON.stringify({ data }));
  }
  saveCsv(filename: string, data: Array<any>, fields: string[]) {
    this._save(
      filename,
      [
        fields.join(","),
        ...data.map((item: any) =>
          fields.map((field) => item[field]).join(","),
        ),
      ].join("\n"),
    );
  }
  private _get(filename: string) {
    try {
      return fs.readFileSync(path.resolve(this.dataDir, filename), {
        encoding: "utf-8",
      });
    } catch {
      return undefined;
    }
  }
  getJson<T = any>(filename: string) {
    try {
      const content = this._get(filename);
      if (!content) {
        return undefined;
      }
      return JSON.parse(content)?.data as T;
    } catch (e) {
      return undefined;
    }
  }
  getCsv<T = any>(filename: string, fields: string[]) {
    const content = this._get(filename);
    if (!content) {
      return undefined;
    }
    return content
      .split("\n")
      .slice(1)
      .map((line) => {
        return line.split(",").reduce((acc, item, index) => {
          return {
            ...acc,
            [fields[index]]: item,
          };
        }, {} as T);
      });
  }
}

const source = new Source();

export default source;
