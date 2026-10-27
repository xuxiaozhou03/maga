const { createApp, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } = Vue;

const RANGE_MONTHS = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
};

const parseDate = (value) => {
  const text = String(value || "");
  if (!/^\d{8}$/.test(text)) return NaN;
  return new Date(
    `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T12:00:00+08:00`,
  ).getTime();
};

const toChartData = (item) => ({
  timestamp: parseDate(item.date),
  open: Number(item.open),
  high: Number(item.high),
  low: Number(item.low),
  close: Number(item.close),
  volume: Number(item.volume),
  turnover: Number(item.amount),
  code: item.code,
  date: item.date,
  change: item.change,
  changePercent: item.changePercent,
});

const chartStyles = {
  grid: {
    show: true,
    horizontal: {
      show: true,
      color: "#edf1f6",
      size: 1,
      style: "dashed",
      dashedValue: [4, 4],
    },
    vertical: {
      show: false,
      color: "#edf1f6",
      size: 1,
      style: "dashed",
      dashedValue: [4, 4],
    },
  },
  candle: {
    type: "candle_solid",
    bar: {
      upColor: "#e84c4c",
      downColor: "#16a36a",
      noChangeColor: "#8b95a7",
      upBorderColor: "#e84c4c",
      downBorderColor: "#16a36a",
      noChangeBorderColor: "#8b95a7",
      upWickColor: "#e84c4c",
      downWickColor: "#16a36a",
      noChangeWickColor: "#8b95a7",
    },
    priceMark: {
      show: true,
      high: { show: true, color: "#8b95a7", textSize: 10 },
      low: { show: true, color: "#8b95a7", textSize: 10 },
      last: {
        show: true,
        upColor: "#e84c4c",
        downColor: "#16a36a",
        noChangeColor: "#8b95a7",
        line: { show: true, style: "dashed", size: 1, dashedValue: [4, 4] },
      },
    },
    tooltip: {
      showRule: "follow_cross",
      showType: "standard",
    },
  },
  indicator: {
    tooltip: {
      showRule: "follow_cross",
      showType: "standard",
      showName: true,
      showParams: true,
    },
  },
  xAxis: {
    show: true,
    axisLine: { show: true, color: "#dfe5ee", size: 1 },
    tickLine: { show: false, color: "#dfe5ee", size: 1, length: 3 },
    tickText: { show: true, color: "#8791a3", size: 11, weight: 400 },
  },
  yAxis: {
    show: true,
    axisLine: { show: false, color: "#dfe5ee", size: 1 },
    tickLine: { show: false, color: "#dfe5ee", size: 1, length: 3 },
    tickText: { show: true, color: "#8791a3", size: 11, weight: 400 },
  },
  separator: {
    size: 1,
    color: "#edf1f6",
    fill: true,
    activeBackgroundColor: "#edf1f6",
  },
  crosshair: {
    show: true,
    horizontal: {
      show: true,
      line: { show: true, color: "#8b95a7", size: 1, style: "dashed", dashedValue: [3, 3] },
      text: {
        show: true,
        color: "#ffffff",
        size: 11,
        backgroundColor: "#647084",
        borderColor: "transparent",
        borderSize: 0,
        borderRadius: 3,
      },
    },
    vertical: {
      show: true,
      line: { show: true, color: "#8b95a7", size: 1, style: "dashed", dashedValue: [3, 3] },
      text: {
        show: true,
        color: "#ffffff",
        size: 11,
        backgroundColor: "#647084",
        borderColor: "transparent",
        borderSize: 0,
        borderRadius: 3,
      },
    },
  },
};

createApp({
  setup() {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("code") || "").trim();
    const queryName = (params.get("name") || "").trim();

    const klines = ref([]);
    const etfInfo = ref(null);
    const loading = ref(false);
    const error = ref("");
    const range = ref("1Y");
    const lastUpdated = ref("");
    const chartElement = ref(null);
    const ranges = [
      { key: "1M", label: "1 月" },
      { key: "3M", label: "3 月" },
      { key: "6M", label: "6 月" },
      { key: "1Y", label: "1 年" },
      { key: "ALL", label: "全部" },
    ];

    let chart = null;
    let resizeObserver = null;

    const visibleKlines = computed(() => {
      if (!klines.value.length || range.value === "ALL") return klines.value;
      const months = RANGE_MONTHS[range.value];
      const lastTimestamp = parseDate(klines.value[klines.value.length - 1].date);
      const cutoff = new Date(lastTimestamp);
      cutoff.setMonth(cutoff.getMonth() - months);
      return klines.value.filter((item) => parseDate(item.date) >= cutoff.getTime());
    });

    const latest = computed(() => klines.value.at(-1) || null);
    const recentKlines = computed(() => [...klines.value].slice(-30).reverse());
    const rangeLabel = computed(
      () => ranges.find((item) => item.key === range.value)?.label || "全部",
    );

    const periodHigh = computed(() =>
      visibleKlines.value.length
        ? Math.max(...visibleKlines.value.map((item) => Number(item.high)))
        : null,
    );
    const periodLow = computed(() =>
      visibleKlines.value.length
        ? Math.min(...visibleKlines.value.map((item) => Number(item.low)))
        : null,
    );
    const periodHighDate = computed(() => {
      if (!visibleKlines.value.length) return null;
      return visibleKlines.value.find((item) => Number(item.high) === periodHigh.value)?.date;
    });
    const periodLowDate = computed(() => {
      if (!visibleKlines.value.length) return null;
      return visibleKlines.value.find((item) => Number(item.low) === periodLow.value)?.date;
    });
    const periodChange = computed(() => {
      if (!visibleKlines.value.length) return null;
      const start = Number(visibleKlines.value[0].open);
      const end = Number(visibleKlines.value[visibleKlines.value.length - 1].close);
      return start ? ((end - start) / start) * 100 : null;
    });
    const periodAmount = computed(() =>
      visibleKlines.value.reduce((total, item) => total + (Number(item.amount) || 0), 0),
    );

    const formatPrice = (value) => {
      if (value === null || value === undefined || value === "") return "--";
      const number = Number(value);
      return Number.isFinite(number)
        ? number.toLocaleString("zh-CN", {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          })
        : "--";
    };

    const signed = (value) => {
      if (value === null || value === undefined || value === "") return "--";
      const number = Number(value);
      return Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number.toFixed(3)}` : "--";
    };

    const formatPercent = (value) => {
      if (value === null || value === undefined || value === "") return "--";
      const number = Number(value);
      return Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number.toFixed(2)}%` : "--";
    };

    const formatDate = (value) => {
      const text = String(value || "");
      return /^\d{8}$/.test(text)
        ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
        : "--";
    };

    const formatCompactNumber = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return "--";
      if (Math.abs(number) >= 1e8) return `${(number / 1e8).toFixed(2)} 亿`;
      if (Math.abs(number) >= 1e4) return `${(number / 1e4).toFixed(2)} 万`;
      return number.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
    };

    const formatCompactAmount = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return "--";
      return `¥${formatCompactNumber(number).replace(" 亿", "亿").replace(" 万", "万")}`;
    };

    const changeClass = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "neutral-text";
      return number > 0 ? "up-text" : "down-text";
    };

    const renderChart = async () => {
      await nextTick();
      if (!chartElement.value || !visibleKlines.value.length) return;

      if (!chart) {
        chart = klinecharts.init(chartElement.value, {
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          layout: [
            { type: "candle", content: ["MA"] },
            {
              type: "indicator",
              content: ["VOL"],
              options: { height: 108, minHeight: 72 },
            },
          ],
          styles: chartStyles,
        });
      }

      if (!chart) return;
      const pricePrecision = Number(latest.value?.close) >= 100 ? 2 : 3;
      chart.setPriceVolumePrecision(pricePrecision, 0);
      chart.applyNewData(visibleKlines.value.map(toChartData));
      requestAnimationFrame(() => {
        chart?.resize();
        chart?.scrollToRealTime();
      });
    };

    const showLatest = () => {
      chart?.scrollToRealTime();
    };

    const loadData = async () => {
      if (!code) return;
      loading.value = true;
      error.value = "";
      try {
        const encodedCode = encodeURIComponent(code);
        const [klineResponse, etfResponse] = await Promise.all([
          fetch(`/api/${encodedCode}/kline`, { headers: { Accept: "application/json" } }),
          fetch("/api/etfs", { headers: { Accept: "application/json" } }).catch(() => null),
        ]);

        if (!klineResponse.ok) {
          throw new Error(`K 线接口返回 HTTP ${klineResponse.status}`);
        }
        const klineData = await klineResponse.json();
        if (!Array.isArray(klineData)) {
          throw new Error("K 线接口返回的数据格式不正确");
        }

        klines.value = klineData.filter(
          (item) =>
            item &&
            Number.isFinite(Number(item.open)) &&
            Number.isFinite(Number(item.high)) &&
            Number.isFinite(Number(item.low)) &&
            Number.isFinite(Number(item.close)) &&
            Number.isFinite(parseDate(item.date)),
        );

        if (etfResponse?.ok) {
          const etfData = await etfResponse.json();
          if (Array.isArray(etfData)) {
            etfInfo.value = etfData.find((item) => item.code === code) || null;
          }
        }

        lastUpdated.value = new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date());
        await renderChart();
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : "未知错误";
      } finally {
        loading.value = false;
      }
    };

    watch(range, renderChart);

    onMounted(async () => {
      await loadData();
      if (chartElement.value) {
        resizeObserver = new ResizeObserver(() => chart?.resize());
        resizeObserver.observe(chartElement.value);
      }
    });

    onBeforeUnmount(() => {
      resizeObserver?.disconnect();
      if (chart) klinecharts.dispose(chart);
      chart = null;
    });

    return {
      changeClass,
      chartElement,
      code,
      error,
      etfInfo,
      formatCompactAmount,
      formatCompactNumber,
      formatDate,
      formatPercent,
      formatPrice,
      klines,
      lastUpdated,
      latest,
      loadData,
      loading,
      periodAmount,
      periodChange,
      periodHigh,
      periodHighDate,
      periodLow,
      periodLowDate,
      queryName,
      range,
      rangeLabel,
      ranges,
      recentKlines,
      showLatest,
      signed,
      visibleKlines,
    };
  },
}).mount("#app");
