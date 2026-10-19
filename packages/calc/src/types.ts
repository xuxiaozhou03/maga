export type StatisticPeriod =
  | "ALL"
  | "1M"
  | "3M"
  | "6M"
  | "YTD"
  | "1Y"
  | "2Y"
  | "5D"
  | "20D"
  | "60D"
  | "120D"
  | "250D";

export interface DataQualityCheck {
  code: string;
  totalRows: number;
  validRows: number;
  missingDates: number;
  priceInvalidCount: number;
  dateInvalidCount: number;
  coverageStart: number | null;
  coverageEnd: number | null;
  passed: boolean;
  messages: string[];
}

export interface EtfStatistic {
  code: string;
  period: StatisticPeriod;
  startDate: number;
  endDate: number;
  validDays: number;
  cumulativeReturn: number | null;
  annualizedReturn: number | null;
  return5: number | null;
  return20: number | null;
  return60: number | null;
  return120: number | null;
  return250: number | null;
  dailyReturnMean: number | null;
  dailyReturnMedian: number | null;
  dailyReturnStd: number | null;
  dailyReturnP10: number | null;
  dailyReturnP90: number | null;
  upDays: number;
  downDays: number;
  flatDays: number;
  upProbability: number | null;
  annualizedVolatility: number | null;
  downsideVolatility: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxSingleDayGain: number | null;
  maxSingleDayLoss: number | null;
  maxConsecutiveUpDays: number;
  maxConsecutiveDownDays: number;
  newHighCount: number;
  avgAmount: number | null;
  medianAmount: number | null;
  amountP10: number | null;
  amountP90: number | null;
  pricePosition20: number | null;
  pricePosition60: number | null;
  pricePosition120: number | null;
  pricePosition250: number | null;
}

export interface DailyFeatureCore {
  code: string;
  date: number;
  return1: number | null;
  return5: number | null;
  return10: number | null;
  return20: number | null;
  return60: number | null;
  return120: number | null;
  return250: number | null;
  sma20: number | null;
  sma60: number | null;
  sma120: number | null;
  sma250: number | null;
  closeDeviation20: number | null;
  closeDeviation60: number | null;
  closeDeviation120: number | null;
  closeDeviation250: number | null;
  smaDirection20: "UP" | "DOWN" | "FLAT" | null;
  smaDirection60: "UP" | "DOWN" | "FLAT" | null;
  smaAlignment: "BULL" | "BEAR" | "MIXED" | null;
  momentum: number | null;
  volatility20: number | null;
  volatility60: number | null;
  distanceToHigh20: number | null;
  distanceToHigh60: number | null;
  distanceToHigh120: number | null;
  distanceToHigh250: number | null;
  rangePosition20: number | null;
  rangePosition60: number | null;
  rangePosition120: number | null;
  rangePosition250: number | null;
  volumeChangeRate: number | null;
  relativeVolume: number | null;
  amountChangeRate: number | null;
  relativeAmount20: number | null;
  bodyRatio: number | null;
  upperShadowRatio: number | null;
  lowerShadowRatio: number | null;
  intradayAmplitude: number | null;
  gap: number | null;
  trendState: "UP" | "DOWN" | "SIDEWAYS" | null;
  momentumState: "STRONG" | "WEAK" | "NEUTRAL" | null;
  volatilityState: "HIGH" | "LOW" | "NORMAL" | null;
}

export interface ForwardLabel {
  code: string;
  date: number;
  forwardReturn1: number | null;
  forwardReturn5: number | null;
  forwardReturn10: number | null;
  forwardReturn20: number | null;
  forwardReturn60: number | null;
  forwardDirection1: "UP" | "DOWN" | "FLAT" | null;
  forwardDirection5: "UP" | "DOWN" | "FLAT" | null;
  forwardDirection10: "UP" | "DOWN" | "FLAT" | null;
  forwardDirection20: "UP" | "DOWN" | "FLAT" | null;
  forwardDirection60: "UP" | "DOWN" | "FLAT" | null;
  forwardMaxGain5: number | null;
  forwardMaxGain20: number | null;
  forwardMaxLoss5: number | null;
  forwardMaxLoss20: number | null;
  forwardMaxDrawdown20: number | null;
  isMature1: boolean;
  isMature5: boolean;
  isMature10: boolean;
  isMature20: boolean;
  isMature60: boolean;
}

/**
 * 单只 ETF 的独立计算结果。
 * 每只 ETF 的 K 线单独处理，不依赖其他 ETF。
 */
export interface SingleEtfCalculationResult {
  code: string;
  success: boolean;
  error?: string;
  qualityCheck: DataQualityCheck;
  statistics: EtfStatistic[];
  dailyFeatures: DailyFeatureCore[];
  forwardLabels: ForwardLabel[];
}
