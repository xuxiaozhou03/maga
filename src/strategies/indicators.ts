export const sma = (values: number[], length: number) =>
  values.slice(-length).reduce((total, value) => total + value, 0) / length;

export const retN = (values: number[], length: number) =>
  values.length > length
    ? values[values.length - 1] / values[values.length - 1 - length] - 1
    : null;
