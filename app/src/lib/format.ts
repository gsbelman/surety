import { formatUnits, keccak256, parseUnits, stringToHex, type Hex } from "viem";
import { USDC_DECIMALS } from "../contract/networks";

export const hashText = (text: string): Hex => keccak256(stringToHex(text));

/** True for a positive USDC amount with at most 6 decimals. */
export const isAmount = (value: string) => /^\d+(\.\d{1,6})?$/.test(value) && Number(value) > 0;

export const parseUsdc = (value: string) => parseUnits(value, USDC_DECIMALS);

export function usdc(amount: bigint) {
  const text = formatUnits(amount, USDC_DECIMALS);
  const [whole, fraction = ""] = text.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

/** A short balance for tight spaces, with two decimals. */
export const whole = (amount: bigint) =>
  Number(formatUnits(amount, USDC_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const shorten = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function duration(seconds: number) {
  if (seconds >= 86_400) return `${Math.round(seconds / 86_400)} d`;
  if (seconds >= 3_600) return `${Math.round(seconds / 3_600)} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

export function countdown(seconds: number) {
  const h = Math.floor(seconds / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
