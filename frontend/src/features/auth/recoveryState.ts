export const validCode = (value: unknown): value is string =>
  typeof value === "string" && /^\d{6}$/.test(value);
export type RecoveryState = {
  step: "EMAIL" | "CODE" | "NEW_PASSWORD" | "SUCCESS";
  email: string;
  token?: string;
  expires?: number;
  until: number;
};
export const initialRecovery: RecoveryState = {
  step: "EMAIL",
  email: "",
  until: 0,
};
export type RecoveryAction =
  | { type: "START"; email: string }
  | { type: "SENT"; until: number }
  | { type: "VERIFIED"; token: string; expires: number }
  | { type: "SUCCESS" }
  | { type: "BACK" };
export function recoveryReducer(
  state: RecoveryState,
  action: RecoveryAction,
): RecoveryState {
  switch (action.type) {
    case "START":
      return { ...initialRecovery, email: action.email };
    case "SENT":
      return { step: "CODE", email: state.email, until: action.until };
    case "VERIFIED":
      return {
        ...state,
        step: "NEW_PASSWORD",
        token: action.token,
        expires: action.expires,
      };
    case "SUCCESS":
      return { ...initialRecovery, step: "SUCCESS", email: state.email };
    case "BACK":
      return { ...initialRecovery, email: state.email };
  }
}
