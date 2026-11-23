export type AuthForm = {
  email: string;
  password: string;
  display_name: string;
};
export const validPassword = (password: string) => {
  const length = [...password].length;
  return length >= 8 && length <= 128;
};
export function validateAuth(
  mode: "login" | "register",
  form: AuthForm,
): Partial<Record<keyof AuthForm, string>> {
  const errors: Partial<Record<keyof AuthForm, string>> = {};
  const email = form.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Email không hợp lệ (tối đa 254 ký tự).";
  if (!validPassword(form.password))
    errors.password = "Mật khẩu cần từ 8 đến 128 ký tự.";
  if (
    mode === "register" &&
    ([...form.display_name.trim()].length < 1 ||
      [...form.display_name.trim()].length > 100)
  )
    errors.display_name = "Tên hiển thị cần từ 1 đến 100 ký tự.";
  return errors;
}
