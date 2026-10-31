import { BaseError, ContractFunctionRevertedError } from "viem";

const messages: Record<string, string> = {
  AlreadyRegistered: "This address is already registered.",
  BadTerms: "These terms are outside the allowed ranges.",
  BadWindow: "The delivery window is outside the seller's terms.",
  InsufficientBond: "The free bond cannot cover this amount.",
  NotArbiter: "Only the seller's arbiter can do this.",
  NotBuyer: "Only the buyer can do this.",
  NotRegistered: "This address is not a registered seller.",
  NotSeller: "Only the seller can do this.",
  NothingToClaim: "You have nothing to claim.",
  SelfPayment: "You cannot pay yourself.",
  TooEarly: "The deadline has not passed yet.",
  TooLate: "The deadline has passed.",
  WrongStatus: "This payment has moved on. Refresh and try again.",
  ZeroAmount: "Enter an amount above zero.",
  ZeroProof: "Enter a proof.",
};

export function explain(error: unknown) {
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && messages[name]) return messages[name];
      if (reverted.reason) return reverted.reason;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
