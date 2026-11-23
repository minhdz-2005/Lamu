import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
test("F01/F03: real→mock→real preserves namespaces; business mock 401 cannot refresh real", () => {
  for (const mode of ["real", "mock", "real"]) {
    const code = `
      const authModule=await import('./src/lib/auth.ts'),auth=authModule.default??authModule;
      const apiModule=await import('./src/lib/apiClient.ts'),api=apiModule.default??apiModule;
      const store=new Map();
      for(const mode of ['real','mock'])store.set('lamu.session.v2.'+mode,JSON.stringify({version:2,generation:mode,access:mode+'-access',refresh:mode+'-refresh'}));
      globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
      let requests=[];
      globalThis.fetch=async(url,init)=>{requests.push({url,auth:new Headers(init.headers).get('Authorization')});return Response.json({error:{code:'UNAUTHENTICATED'}},{status:401});};
      try{await api.request('/events/protected');}catch{}
      console.log(JSON.stringify({access:auth.getAccessToken(),identity:api.apiUrl('/auth/login'),requests}));
    `;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code],
      {
        cwd: resolve(__dirname, ".."),
        env: {
          ...process.env,
          NEXT_PUBLIC_AUTH_MODE: mode,
          NEXT_PUBLIC_API_BASE_URL: "https://untrusted.invalid",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.access, mode + "-access");
    assert.equal(
      value.identity,
      mode === "real" ? "/api/identity/auth/login" : "/api/auth/login",
    );
    assert.equal(value.requests.length, 1);
    assert.equal(value.requests[0].url, "/api/events/protected");
    assert.equal(
      value.requests[0].auth,
      mode === "real" ? null : "Bearer mock-access",
    );
  }
});
test("F02: browser without Web Locks fails closed for real session writers", () => {
  const code = `
    const imported=await import('./src/lib/auth.ts'),auth=imported.default??imported;
    Object.defineProperty(navigator,'locks',{value:undefined,configurable:true});
    globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{throw new Error('must not write');}}};
    try{await auth.setSession('a','r');process.exitCode=1;}catch(error){if(!error.message.includes('Web Locks'))throw error;}
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      cwd: resolve(__dirname, ".."),
      env: { ...process.env, NEXT_PUBLIC_AUTH_MODE: "real" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
});
