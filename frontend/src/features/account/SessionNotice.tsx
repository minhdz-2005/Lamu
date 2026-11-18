import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { accountCopy as copy, type AccountNoticeData } from "./accountData";

interface SessionNoticeProps {
  readonly notice: AccountNoticeData;
  readonly onRetry?: () => void;
  readonly reloading?: boolean;
}

export function SessionNotice({ notice, onRetry, reloading }: SessionNoticeProps) {
  return <div className="lamu-account-notice" data-kind={notice.kind} role={notice.kind === "info" ? "status" : "alert"}>
    <AccountIcon name={notice.icon ?? (notice.kind === "warning" ? "clock" : "notice")} size={20} />
    <div className="lamu-account-noticeContent">
      <strong>{notice.title}</strong>
      {notice.description && <p>{notice.description}</p>}
      {notice.action && <div className="lamu-account-noticeActions">
        {notice.action === "login" ? <Link className="lamu-account-create" href="/auth?next=/me" prefetch={false}>{copy.login}<AccountIcon name="arrow" size={13} /></Link>
          : <button className="lamu-account-reload" type="button" onClick={onRetry} disabled={!onRetry || reloading}><AccountIcon name="reload" size={13} />{copy.reload}</button>}
      </div>}
    </div>
  </div>;
}
