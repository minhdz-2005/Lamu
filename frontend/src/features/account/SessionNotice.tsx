import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { accountCopy as copy, type AccountNoticeData } from "./accountData";

interface SessionNoticeProps { readonly notice: AccountNoticeData; }

export function SessionNotice({ notice }: SessionNoticeProps) {
  return <div className="lamu-account-notice" data-kind={notice.kind} role={notice.kind === "info" ? "status" : "alert"}>
    <AccountIcon name={notice.icon ?? (notice.kind === "warning" ? "clock" : "notice")} size={20} />
    <div className="lamu-account-noticeContent">
      <strong>{notice.title}</strong>
      {notice.description && <p>{notice.description}</p>}
      {notice.action && <div className="lamu-account-noticeActions">
        {notice.action === "login" ? <Link className="lamu-account-create" href="/auth" prefetch={false}>{copy.login}<AccountIcon name="arrow" size={13} /></Link>
          : <button className="lamu-account-reload" type="button" aria-disabled="true"><AccountIcon name="reload" size={13} />{copy.reload}</button>}
      </div>}
      {notice.requestId && <details className="lamu-account-requestDetails"><summary>{copy.details}</summary><code>{notice.requestId}</code></details>}
    </div>
  </div>;
}
