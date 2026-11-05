import { Task } from "../utils";

// 单个ETF的统计数据抓取任务
export const getEtfStatisticsTask = (code: string): Task => ({
  name: `${code}-statistics`,
  fetch: async () => {
    // Fetch statistics data for the given code
    // Implement your fetching logic here
    return []; // Return the fetched data
  },
  save: async (data) => {
    // Save the fetched Kline data to the database
    // Implement your saving logic here
  },
});
