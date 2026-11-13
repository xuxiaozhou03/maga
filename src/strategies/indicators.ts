export { SMA, EMA, RSI, MACD, BollingerBands, ATR } from "trading-signals";

export const retN = (values: number[], length: number) =>
  values.length > length
    ? values[values.length - 1] / values[values.length - 1 - length] - 1
    : null;
