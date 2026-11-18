"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/queries";

/** Candles + volume. Up = green, down = coral; crosshair readout is built in. */
export function PriceChart({ candles, className }: { candles: Candle[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const price = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6a6458",
        // Canvas text cannot read CSS variables, so resolve the mono font up front.
        fontFamily: `${getComputedStyle(document.documentElement).getPropertyValue("--font-space-mono").trim() || "ui-monospace"}, monospace`,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { color: "rgba(15,21,22,0.03)" }, horzLines: { color: "rgba(15,21,22,0.05)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(38,124,131,0.35)", labelBackgroundColor: "#267c83" },
        horzLine: { color: "rgba(38,124,131,0.35)", labelBackgroundColor: "#267c83" },
      },
    });
    price.current = c.addSeries(CandlestickSeries, {
      upColor: "#17803f",
      downColor: "#c9452d",
      wickUpColor: "#17803f",
      wickDownColor: "#c9452d",
      borderVisible: false,
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (!price.current || !volume.current) return;
    const maxPrice = Math.max(...candles.map((k) => k.high), 0);
    const precision = maxPrice >= 1 ? 4 : maxPrice >= 0.01 ? 6 : 10;
    price.current.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    price.current.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
    volume.current.setData(
      candles.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? "rgba(23,128,63,0.3)" : "rgba(201,69,45,0.3)",
      })),
    );
    chart.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={el} className={className ?? "h-[380px] w-full"} />;
}
