export const authMode =
  process.env.NEXT_PUBLIC_AUTH_MODE === "real" ? "real" : "mock";
const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uuid = new RegExp(`^${uuidPattern}$`, "i");
export const isIdentityUuid = (value: unknown): value is string =>
  typeof value === "string" && value.length === 36 && uuid.test(value);
const org = `/organizations/${uuidPattern}`;
const members = `${org}/members`;
const sent = `${members}/invitations`;
const inbox = "/users/me/invitations";
const get = new RegExp(`^(?:/users/me|${inbox}|${org}|${members}|${sent})$`);
const post = new RegExp(
  `^(?:/auth/(?:register|login|refresh|logout|forgot-password|verify-reset-code|reset-password)|/users/me/(?:avatar/upload-intents|password)|/organizations|${org}/cover/upload-intents|${sent}|${sent}/${uuidPattern}/revoke|${inbox}/${uuidPattern}/(?:accept|decline))$`,
);
const put = new RegExp(`^(?:/users/me/avatar|${org}/cover|${members}/${uuidPattern}/roles)$`);
const patch = new RegExp(`^${org}$`);
const paginated = new RegExp(`^(?:${members}|${sent}|${inbox})$`);
const matches = (pattern: RegExp, pathname: string) =>
  !/[\s%\\]/.test(pathname) && pattern.test(pathname);
export const identityPath = (path: string) => {
  const pathname = path.split("?")[0];
  return [get, post, put].some((pattern) => matches(pattern, pathname));
};
export const allowsIdentityRequest = (method: string, pathname: string) =>
  (method === "GET" && matches(get, pathname)) ||
  (method === "POST" && matches(post, pathname)) ||
  (method === "PUT" && matches(put, pathname)) ||
  (method === "PATCH" && matches(patch, pathname));
export const paginatedIdentityPath = (pathname: string) =>
  matches(paginated, pathname);
export const sessionKey = `lamu.session.v2.${authMode}`;
