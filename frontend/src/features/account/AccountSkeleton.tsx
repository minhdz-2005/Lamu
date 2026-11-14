import { accountCopy as copy } from "./accountData";

interface AccountSkeletonProps { readonly children?: never; }

export function AccountSkeleton({}: AccountSkeletonProps = {}) {
  return <div aria-busy="true" role="status" aria-label={copy.loading}>
    <span className="lamu-account-srOnly">{copy.loading}</span>
    <div aria-hidden="true">
      <div className="lamu-account-card">
        <div className="lamu-account-profileHeader"><div className="lamu-account-skeleton lamu-account-skeletonHeading" /><div className="lamu-account-skeleton lamu-account-skeletonButton" /></div>
        <div className="lamu-account-profileGrid">
          <div className="lamu-account-skeleton lamu-account-skeletonAvatar" />
          <div className="lamu-account-profileDetails">
            {[0, 1].map((key) => <div key={key}><div className="lamu-account-skeleton lamu-account-skeletonLabel" /><div className="lamu-account-skeleton lamu-account-skeletonValue" /></div>)}
          </div>
        </div>
      </div>
      <div className="lamu-account-card">
        <div className="lamu-account-orgHeader"><div className="lamu-account-skeleton lamu-account-skeletonHeading" /></div>
        <div className="lamu-account-orgList">{[0, 1].map((key) => <div key={key} className="lamu-account-skeleton lamu-account-skeletonOrg" />)}</div>
      </div>
    </div>
  </div>;
}
