import { Address, IDAOState, IExecutionState, IProposalOutcome, IProposalState, Stake, Vote, Proposal } from "@daostack/client";
import * as arcActions from "actions/arcActions";
import * as classNames from "classnames";
import AccountPopup from "components/Account/AccountPopup";
import AccountProfileName from "components/Account/AccountProfileName";
import withSubscription, { ISubscriptionProps } from "components/Shared/withSubscription";
import { formatTokens, humanProposalTitle } from "lib/util";
import * as React from "react";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import { IRootState } from "reducers";
import { proposalFailed, proposalPassed } from "reducers/arcReducer";
import { closingTime } from "reducers/arcReducer";
import { IProfileState } from "reducers/profilesReducer";
import { combineLatest, of } from "rxjs";
import StakeGraph from "./Staking/StakeGraph";
import VoteBreakdown from "./Voting/VoteBreakdown";
import * as css from "./ProposalHistoryRow.scss";

import BN = require("bn.js");

interface IExternalProps {
  proposal: Proposal;
  dao: IDAOState;
  currentAccountAddress: Address;
}

interface IStateProps {
  creatorProfile?: IProfileState;
}

interface IDispatchProps {
  redeemProposal: typeof arcActions.redeemProposal;
  executeProposal: typeof arcActions.executeProposal;
}

type SubscriptionData = [IProposalState, Stake[], Vote[]];
type IProps = IStateProps & IDispatchProps & IExternalProps & ISubscriptionProps<SubscriptionData>;

const mapStateToProps = (state: IRootState, ownProps: IExternalProps & ISubscriptionProps<SubscriptionData>): IExternalProps &  ISubscriptionProps<SubscriptionData> & IStateProps => {
  const proposal = ownProps.data[0];

  return {
    ...ownProps,
    creatorProfile: state.profiles[proposal.proposer],
  };
};

const mapDispatchToProps = {
  redeemProposal: arcActions.redeemProposal,
  executeProposal: arcActions.executeProposal,
};

interface IState {
  preRedeemModalOpen: boolean;
}

class ProposalHistoryRow extends React.Component<IProps, IState> {

  constructor(props: IProps) {
    super(props);

    this.state = {
      preRedeemModalOpen: false,
    };
  }

  public render() {
    const {
      creatorProfile,
      currentAccountAddress,
      data, dao, proposal } = this.props;
    const [proposalState, stakesOfCurrentUser, votesOfCurrentUser] = data;

    const proposalClass = classNames({
      [css.wrapper]: true,
      clearfix: true,
    });

    let currentAccountVote = 0; let currentAccountPrediction = 0; let currentAccountStakeAmount = new BN(0); let currentAccountVoteAmount = new BN(0);

    let currentVote: Vote;
    if (votesOfCurrentUser.length > 0) {
      currentVote = votesOfCurrentUser[0];
      currentAccountVote = currentVote.staticState.outcome;
      currentAccountVoteAmount = new BN(currentVote.staticState.amount);
    }

    let currentStake: Stake;
    if (stakesOfCurrentUser.length > 0) {
      currentStake = stakesOfCurrentUser[0];
    }
    if (currentStake) {
      currentAccountPrediction = currentStake.staticState.outcome;
      currentAccountStakeAmount = new BN(currentStake.staticState.amount);
    }

    const myActionsClass = classNames({
      [css.myActions]: true,
      [css.iVoted]: currentAccountVote !== 0,
      [css.failVote]: currentAccountVote === IProposalOutcome.Fail,
      [css.passVote]: currentAccountVote === IProposalOutcome.Pass,
      [css.iStaked]: currentAccountPrediction !== 0,
      [css.forStake]: currentAccountPrediction === IProposalOutcome.Pass,
      [css.againstStake]: currentAccountPrediction === IProposalOutcome.Fail,
    });

    const closeReasonClass = classNames({
      [css.closeReason]: true,
      [css.decisionPassed]: proposalPassed(proposalState),
      [css.decisionFailed]: proposalFailed(proposalState),
    });

    let closeReason = "Time out";
    switch (proposalState.executionState) {
      case IExecutionState.BoostedBarCrossed:
      case IExecutionState.QueueBarCrossed:
      case IExecutionState.PreBoostedBarCrossed:
        closeReason = "Absolute Majority";
        break;
      case IExecutionState.BoostedTimeOut:
        closeReason = "Relative Majority";
        break;
    }

    const voteControls = classNames({
      [css.voteControls]: true,
      clearfix: true,
    });

    return (
      <div className={proposalClass}>
        <div className={css.proposalCreator}>
          <AccountPopup accountAddress={proposalState.proposer} dao={dao} historyView/>
          <AccountProfileName accountAddress={proposalState.proposer} accountProfile={creatorProfile} daoAvatarAddress={dao.address} historyView/>
        </div>
        <div className={css.endDate}>
          {closingTime(proposalState).format("MMM D, YYYY")}
        </div>
        <div className={css.scheme}>
          <div>{proposalState.queue.name.replace(/([A-Z])/g, " $1")}</div>
        </div>
        <div className={css.title}>
          <div><Link to={"/dao/" + dao.address + "/proposal/" + proposal.id} data-test-id="proposal-title">{humanProposalTitle(proposalState)}</Link></div>
        </div>
        <div className={css.votes}>
          <div className={voteControls}>
            <VoteBreakdown
              currentAccountAddress={currentAccountAddress} currentVote={currentAccountVote} dao={dao}
              proposal={proposalState} historyView />
          </div>
        </div>

        <div className={css.predictions}>
          <StakeGraph
            proposal={proposalState}
            historyView
          />
        </div>
        <div className={closeReasonClass}>
          <div className={css.decisionPassed}>
            <img src="/assets/images/Icon/vote/for.svg"/>
            <span>Passed</span>
            <div className={css.decisionReason}>
              <span>{closeReason}</span>
            </div>
          </div>
          <div className={css.decisionFailed}>
            <img src="/assets/images/Icon/vote/against.svg"/>
            <span>Failed</span>
            <div className={css.decisionReason}>
              <span>{closeReason}</span>
            </div>
          </div>
        </div>
        <div className={myActionsClass}>
          <div className={css.myVote}>
            <span>{formatTokens(currentAccountVoteAmount, "Rep")}</span>
            <img className={css.passVote} src="/assets/images/Icon/vote/for-fill.svg"/>
            <img className={css.failVote} src="/assets/images/Icon/vote/against-fill.svg"/>
          </div>
          <div className={css.myStake}>
            <span>{formatTokens(currentAccountStakeAmount, "GEN")}</span>
            <img className={css.forStake} src="/assets/images/Icon/v-small-fill.svg"/>
            <img className={css.againstStake} src="/assets/images/Icon/x-small-fill.svg"/>
          </div>
        </div>
      </div>
    );
  }
}

const ConnectedProposalHistoryRow = connect(mapStateToProps, mapDispatchToProps)(ProposalHistoryRow);

// In this case we wrap the Connected component because mapStateToProps requires the subscribed proposal state
export default withSubscription({
  wrappedComponent: ConnectedProposalHistoryRow,
  loadingComponent: (props) => <div>Loading proposal {props.proposal.id.substr(0, 6)}...</div>,
  errorComponent: (props) => <div>{ props.error.message }</div>,
  checkForUpdate: ["currentAccountAddress"],
  createObservable: (props: IExternalProps) => {
    const proposal = props.proposal;
    if (!props.currentAccountAddress) {
      return combineLatest(
        proposal.state(),
        of([]),
        of([])
      );
    } else {
      return combineLatest(
        proposal.state({ subscribe: false}),
        proposal.stakes({ where: { staker: props.currentAccountAddress}}, {subscribe: false}),
        proposal.votes({ where: { voter: props.currentAccountAddress }}, {subscribe: false})
      );
    }
  },
});
