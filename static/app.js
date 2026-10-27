const { createApp, computed, onMounted, ref } = Vue;

createApp({
  setup() {
    const etfs = ref([]);
    const query = ref("");
    const loading = ref(false);
    const error = ref("");
    const lastUpdated = ref("");
    const sortKey = ref("scale");
    const sortDirection = ref("desc");

    const totalScale = computed(() =>
      etfs.value.reduce((total, etf) => total + (Number(etf.scale) || 0), 0),
    );
    const positivePremiumCount = computed(
      () =>
        etfs.value.filter(
          (etf) =>
            etf.premiumRate !== null &&
            etf.premiumRate !== undefined &&
            Number(etf.premiumRate) > 0,
        ).length,
    );
    const largestEtf = computed(() =>
      etfs.value.reduce(
        (largest, etf) =>
          !largest || Number(etf.scale) > Number(largest.scale) ? etf : largest,
        null,
      ),
    );

    const filteredEtfs = computed(() => {
      const keyword = query.value.toLowerCase();
      const rows = etfs.value.filter((etf) => {
        if (!keyword) return true;
        return [etf.code, etf.name, etf.trackingIndex, etf.trackIndex].some(
          (value) => String(value || "").toLowerCase().includes(keyword),
        );
      });

      const key = sortKey.value;
      const direction = sortDirection.value === "asc" ? 1 : -1;
      return rows.sort((left, right) => {
        const a = left[key];
        const b = right[key];
        if (a === null || a === undefined || a === "") return 1;
        if (b === null || b === undefined || b === "") return -1;
        if (typeof a === "number" && typeof b === "number") {
          return (a - b) * direction;
        }
        return (
          String(a).localeCompare(String(b), "zh-CN", {
            numeric: true,
            sensitivity: "base",
          }) * direction
        );
      });
    });

    const formatScale = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "--";
      if (Math.abs(number) >= 1e8) return `¥${(number / 1e8).toFixed(2)} 亿`;
      if (Math.abs(number) >= 1e4) return `¥${(number / 1e4).toFixed(2)} 万`;
      return `¥${number.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
    };

    const formatPercent = (value) => {
      if (value === null || value === undefined || value === "") return "--";
      const number = Number(value);
      if (!Number.isFinite(number)) return "--";
      return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
    };

    const premiumClass = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return "neutral-text";
      return number > 0 ? "up-text" : "down-text";
    };

    const setSort = (key) => {
      if (sortKey.value === key) {
        sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
      } else {
        sortKey.value = key;
        sortDirection.value = key === "scale" || key === "premiumRate" ? "desc" : "asc";
      }
    };

    const sortMark = (key) => {
      if (sortKey.value !== key) return "↕";
      return sortDirection.value === "asc" ? "↑" : "↓";
    };

    const openEtf = (etf) => {
      const params = new URLSearchParams({ code: etf.code, name: etf.name });
      window.location.href = `/etf.html?${params.toString()}`;
    };

    const loadEtfs = async () => {
      loading.value = true;
      error.value = "";
      try {
        const response = await fetch("/api/etfs", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`接口返回 HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("接口返回的数据格式不正确");
        }
        etfs.value = data;
        lastUpdated.value = new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date());
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : "未知错误";
      } finally {
        loading.value = false;
      }
    };

    onMounted(loadEtfs);

    return {
      etfs,
      error,
      filteredEtfs,
      formatPercent,
      formatScale,
      largestEtf,
      lastUpdated,
      loadEtfs,
      loading,
      openEtf,
      positivePremiumCount,
      premiumClass,
      query,
      setSort,
      sortMark,
      totalScale,
    };
  },
}).mount("#app");
