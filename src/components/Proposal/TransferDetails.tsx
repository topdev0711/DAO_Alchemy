import { IDAOState, IProposalState } from "@daostack/client";
import * as React from "react";

import * as classNames from "classnames";
import AccountPopupContainer from "components/Account/AccountPopupContainer";
import AccountProfileName from "components/Account/AccountProfileName";
import { IProfileState } from "reducers/profilesReducer";
import RewardsString from "./RewardsString";
import { Link } from "react-router-dom";
import { schemeName } from "lib/util";

import * as css from "./TransferDetails.scss";

interface IProps {
  beneficiaryProfile?: IProfileState;
  detailView?: boolean;
  dao: IDAOState;
  proposal: IProposalState;
  transactionModal?: boolean;
}

export default class TransferDetails extends React.Component<IProps, null> {
  public render() {

    const { beneficiaryProfile, dao, proposal, detailView, transactionModal } = this.props;

    const transferDetailsClass = classNames({
      [css.detailView]: detailView,
      [css.transactionModal]: transactionModal,
      [css.transferDetails]: true,
    });

    if (proposal.contributionReward) {
      return (
        <div className={transferDetailsClass}>
          <span className={css.transferType}><RewardsString proposal={proposal} dao={dao} /></span>
          <strong className={css.transferAmount}></strong>
          <img src="/assets/images/Icon/Transfer.svg" />
          <AccountPopupContainer accountAddress={proposal.contributionReward.beneficiary} dao={dao} />
          <AccountProfileName accountAddress={proposal.contributionReward.beneficiary} accountProfile={beneficiaryProfile} daoAvatarAddress={dao.address} />
        </div>
      );
    }

    if (proposal.schemeRegistrar) {
      const schemeRegistrar = proposal.schemeRegistrar;

      // TODO: how to best figure out of this is an add or edit scheme proposal?

      return (
        <div className={transferDetailsClass + " " + css.schemeRegistrar}>
          { schemeRegistrar.schemeToRemove  ?
              <Link to={"/dao/" + dao.address + "/proposal/" + proposal.id} data-test-id="proposal-title">
                <img src="/assets/images/Icon/delete.svg"/> Remove Scheme {schemeName(schemeRegistrar.schemeToRemove)}
              </Link>
              : schemeRegistrar.schemeToRegister ?
              <Link to={"/dao/" + dao.address + "/proposal/" + proposal.id} data-test-id="proposal-title">
                <img src="/assets/images/Icon/edit-sm.svg"/> Edit Scheme {schemeName(schemeRegistrar.schemeToRegister)}
              </Link>
              :
              <Link to={"/dao/" + dao.address + "/proposal/" + proposal.id} data-test-id="proposal-title">
                <b>+</b> Add Scheme {schemeName(schemeRegistrar.schemeToRegister)}
              </Link>
          }
        </div>
      );
    }
  }
}
