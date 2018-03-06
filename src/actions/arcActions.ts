import axios from 'axios';
import * as Arc from '@daostack/arc.js';
import promisify = require('es6-promisify');
import * as _ from 'lodash';
import { normalize } from 'normalizr';
import * as Redux from 'redux';
import { push } from 'react-router-redux'
import { ThunkAction } from 'redux-thunk';
import * as Web3 from 'web3';

import * as notificationsActions from 'actions/notificationsActions';
import * as web3Actions from 'actions/web3Actions';
import * as web3Constants from 'constants/web3Constants';
import * as arcConstants from 'constants/arcConstants';
import { IRootState } from 'reducers';
import * as schemas from '../schemas';

import { IDaoState, IAccountState, IProposalState, ProposalStates, TransactionStates, VoteOptions } from 'reducers/arcReducer';

export function connectToArc() {
  return (dispatch : any) => {
    dispatch(web3Actions.initializeWeb3());
  }
}

export function getDAOs() {
  return async (dispatch: Redux.Dispatch<any>, getState: Function) => {
    dispatch({ type: arcConstants.ARC_GET_DAOS_PENDING, payload: null });

    const daoCreator = await Arc.DaoCreator.deployed();

    // Get the list of daos we populated on the blockchain during genesis by looking for NewOrg events
    const newOrgEvents = daoCreator.contract.NewOrg({}, { fromBlock: 0 })
    newOrgEvents.get(async (err : Error, eventsArray : any[]) => {
      if (err) {
        dispatch({ type: arcConstants.ARC_GET_DAOS_REJECTED, payload: "Error getting new daos from genesis contract: " + err.message });
      }

      let daos = <{ [key : string] : IDaoState }>{};

      for (let index = 0; index < eventsArray.length; index++) {
        const event = eventsArray[index];
        daos[event.args._avatar] = await getDAOData(event.args._avatar);
      }

      dispatch({ type: arcConstants.ARC_GET_DAOS_FULFILLED, payload: normalize(daos, schemas.daoList) });
    });
  };
}

export function getDAO(avatarAddress : string) {
  return async (dispatch: any, getState: any) => {
    dispatch({ type: arcConstants.ARC_GET_DAO_PENDING, payload: null });

    const daoData = await getDAOData(avatarAddress, true);
    dispatch({ type: arcConstants.ARC_GET_DAO_FULFILLED, payload: normalize(daoData, schemas.daoSchema) });
  }
}

export async function getDAOData(avatarAddress : string, detailed = false) {
  const web3 = Arc.Utils.getWeb3();
  const dao = await Arc.DAO.at(avatarAddress);

  let daoData : IDaoState = {
    avatarAddress: avatarAddress,
    controllerAddress: "",
    name: await dao.getName(),
    members: {},
    rank: 1, // TODO
    promotedAmount: 0,
    proposals: [],
    reputationAddress: await dao.reputation.address,
    reputationCount: Number(web3.fromWei(await dao.reputation.totalSupply(), "ether")),
    tokenAddress: await dao.token.address,
    tokenCount: Number(web3.fromWei(await dao.token.totalSupply(), "ether")),
    tokenName: await dao.getTokenName(),
    tokenSymbol: await dao.getTokenSymbol(),
  };

  if (detailed) {
    // Get all members
    const mintTokenEvents = dao.token.Mint({}, { fromBlock: 0 })
    const transferTokenEvents = dao.token.Transfer({}, { fromBlock: 0 });
    const mintReputationEvents = dao.reputation.Mint({}, { fromBlock: 0 });
    let memberAddresses : string[] = [];

    const getMintTokenEvents = promisify(mintTokenEvents.get.bind(mintTokenEvents));
    let eventsArray = await getMintTokenEvents();
    for (let cnt = 0; cnt < eventsArray.length; cnt++) {
      memberAddresses.push(eventsArray[cnt].args.to);
    }

    const getTransferTokenEvents = promisify(transferTokenEvents.get.bind(transferTokenEvents));
    eventsArray = await getTransferTokenEvents();
    for (let cnt = 0; cnt < eventsArray.length; cnt++) {
      memberAddresses.push(eventsArray[cnt].args.to);
    }

    const getMintReputationEvents = promisify(mintReputationEvents.get.bind(mintReputationEvents));
    eventsArray = await getMintReputationEvents();
    for (let cnt = 0; cnt < eventsArray.length; cnt++) {
      memberAddresses.push(eventsArray[cnt].args.to);
    }

    memberAddresses = [...new Set(memberAddresses)]; // Dedupe

    let members : { [ key : string ] : IAccountState } = {};
    for (let cnt = 0; cnt < memberAddresses.length; cnt++) {
      const address = memberAddresses[cnt];
      let member = { address: address, tokens: 0, reputation: 0 };
      const tokens = await dao.token.balanceOf.call(address)
      member.tokens = Number(web3.fromWei(tokens, "ether"));
      const reputation = await dao.reputation.reputationOf.call(address);
      member.reputation = Number(web3.fromWei(reputation, "ether"));
      members[address] = member;
    }
    daoData.members = members;

    //**** Get all proposals ****//
    const contributionRewardInstance = await Arc.ContributionReward.deployed();

    // Get the voting machine (GenesisProtocol) TODO: update as Arc.js supports a better way to do this
    const schemeParamsHash = await dao.controller.getSchemeParameters(contributionRewardInstance.contract.address, dao.avatar.address);
    const schemeParams = await contributionRewardInstance.contract.parameters(schemeParamsHash);
    const votingMachineAddress = schemeParams[2];
    const votingMachineInstance = await Arc.GenesisProtocol.at(votingMachineAddress);

    const proposals = await contributionRewardInstance.getDaoProposals({ avatar: dao.avatar.address});

    // Get all proposals' details like title and description from the server
    let serverProposals : { [ key : string ] : any } = {};
    try {
      const results = await axios.get(arcConstants.API_URL + '/api/proposals?filter={"where":{"daoAvatarAddress":"' + avatarAddress +'"}}');
      serverProposals = _.keyBy(results.data, 'arcId');
    } catch (e) {
      console.log(e);
    }

    let contributionProposal : Arc.ContributionProposal, genesisProposal: any, proposalId : string, description: string, title: string;
    for (let cnt = 0; cnt < proposals.length; cnt++) {
      contributionProposal = proposals[cnt];
      proposalId = contributionProposal.proposalId;

      // Default to showing the description hash if we don't have better description on the server
      description = contributionProposal.contributionDescriptionHash;
      title = "[no title]";
      if (serverProposals[proposalId]) {
        description = serverProposals[proposalId].description;
        title = serverProposals[proposalId].title;
      }

      // Get more proposal details from the GenesisProtocol voting machine
      const proposalDetails = await votingMachineInstance.contract.proposals(proposalId);

      const yesVotes = await votingMachineInstance.getVoteStatus({ proposalId: proposalId, vote: VoteOptions.Yes });
      const noVotes = await votingMachineInstance.getVoteStatus({ proposalId: proposalId, vote: VoteOptions.No });

      const yesStakes = await votingMachineInstance.getVoteStake({ proposalId: proposalId, vote: VoteOptions.Yes });
      const noStakes = await votingMachineInstance.getVoteStake({ proposalId: proposalId, vote: VoteOptions.No });

      genesisProposal = {
        boostedTime: Number(proposalDetails[10]),
        description: description,
        daoAvatarAddress: dao.avatar.address,
        ethReward: Number(web3.fromWei(contributionProposal.ethReward, "ether")),
        externalTokenReward: Number(web3.fromWei(contributionProposal.externalTokenReward, "ether")),
        nativeTokenReward: Number(web3.fromWei(contributionProposal.nativeTokenReward, "ether")),
        reputationChange: Number(web3.fromWei(contributionProposal.reputationChange, "ether")),
        proposer: proposalDetails[11],
        stakesNo: Number(web3.fromWei(noStakes, "ether")),
        stakesYes: Number(web3.fromWei(yesStakes, "ether")),
        state: Number(proposalDetails[9]),
        submittedTime: proposalDetails[7],
        title: title,
        totalStakes: Number(web3.fromWei(proposalDetails[4], "ether")),
        totalVotes: Number(web3.fromWei(proposalDetails[3], "ether")),
        totalVoters: Number(proposalDetails[14] ? proposalDetails[14].length : 0), // TODO: this does not work
        transactionState: TransactionStates.Confirmed,
        votesYes: Number(web3.fromWei(yesVotes, "ether")),
        votesNo: Number(web3.fromWei(noVotes, "ether")),
        winningVote: Number(proposalDetails[10])
      }

      let proposal = <IProposalState>{...contributionProposal, ...genesisProposal};

      daoData.proposals.push(proposal);
    }
  }

  return daoData;
}

// TODO: there is a lot of duplicate code here with getDaoData
export function getProposal(avatarAddress : string, proposalId : string) {
  return async (dispatch: any, getState: any) => {
    dispatch({ type: arcConstants.ARC_GET_PROPOSAL_PENDING, payload: null });

    const web3 = Arc.Utils.getWeb3();
    const dao = await Arc.DAO.at(avatarAddress);

    const contributionRewardInstance = await Arc.ContributionReward.deployed();

    // Get the voting machine (GenesisProtocol) TODO: update as Arc.js supports a better way to do this
    const schemeParamsHash = await dao.controller.getSchemeParameters(contributionRewardInstance.contract.address, dao.avatar.address);
    const schemeParams = await contributionRewardInstance.contract.parameters(schemeParamsHash);
    const votingMachineAddress = schemeParams[2];
    const votingMachineInstance = await Arc.GenesisProtocol.at(votingMachineAddress);

    const proposals = await contributionRewardInstance.getDaoProposals({ avatar: dao.avatar.address, proposalId: proposalId });
    const contributionProposal = proposals[0];

    // Get title and description from the server
    // Default to showing the description hash if we don't have better description on the server
    let description = contributionProposal.contributionDescriptionHash;
    let title = "";
    try {
      const response = await axios.get(arcConstants.API_URL + '/api/proposals?filter={"where":{"daoAvatarAddress":"' + avatarAddress +'", "arcId":"' + proposalId +'"}}');
      if (response.data.length > 0) {
        description = response.data[0].description;
        title = response.data[0].title;
      }
    } catch (e) {
      console.log(e);
    }

    // Get more proposal details from the GenesisProtocol voting machine
    const proposalDetails = await votingMachineInstance.contract.proposals(proposalId);

    const yesVotes = await votingMachineInstance.getVoteStatus({ proposalId: proposalId, vote: VoteOptions.Yes });
    const noVotes = await votingMachineInstance.getVoteStatus({ proposalId: proposalId, vote: VoteOptions.No });

    const yesStakes = await votingMachineInstance.getVoteStake({ proposalId: proposalId, vote: VoteOptions.Yes });
    const noStakes = await votingMachineInstance.getVoteStake({ proposalId: proposalId, vote: VoteOptions.No });

    const genesisProposal = {
      boostedTime: Number(proposalDetails[10]),
      description: description,
      daoAvatarAddress: dao.avatar.address,
      ethReward: Number(web3.fromWei(contributionProposal.ethReward, "ether")),
      externalTokenReward: Number(web3.fromWei(contributionProposal.externalTokenReward, "ether")),
      nativeTokenReward: Number(web3.fromWei(contributionProposal.nativeTokenReward, "ether")),
      reputationChange: Number(web3.fromWei(contributionProposal.reputationChange, "ether")),
      proposer: proposalDetails[11],
      stakesNo: Number(web3.fromWei(noStakes, "ether")),
      stakesYes: Number(web3.fromWei(yesStakes, "ether")),
      state: Number(proposalDetails[9]),
      submittedTime: proposalDetails[7],
      title: title,
      totalStakes: Number(web3.fromWei(proposalDetails[4], "ether")),
      totalVotes: Number(web3.fromWei(proposalDetails[3], "ether")),
      totalVoters: Number(proposalDetails[14] ? proposalDetails[14].length : 0), // TODO: this does not work
      transactionState: TransactionStates.Confirmed,
      votesYes: Number(web3.fromWei(yesVotes, "ether")),
      votesNo: Number(web3.fromWei(noVotes, "ether")),
      winningVote: Number(proposalDetails[10])
    }

    let proposal = <IProposalState>{...contributionProposal, ...genesisProposal};
    let payload = normalize(proposal, schemas.proposalSchema);
    (payload as any).daoAvatarAddress = proposal.daoAvatarAddress;

    dispatch({ type: arcConstants.ARC_GET_PROPOSAL_FULFILLED, payload: payload });
  }
}

export function createDAO(daoName : string, tokenName: string, tokenSymbol: string, members: any) : ThunkAction<any, IRootState, null> {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    dispatch({ type: arcConstants.ARC_CREATE_DAO_PENDING, payload: null });
    try {
      const web3 : Web3 = Arc.Utils.getWeb3();

      let founders : Arc.FounderConfig[] = [], member;
      members.sort((a : any, b : any) => {
        b.reputation - a.reputation;
      });
      for (let i = 0; i < members.length; i++) {
        member = members[i];
        founders[i] = {
          address : member.address,
          tokens : web3.toWei(member.tokens, "ether"),
          reputation: web3.toWei(member.reputation, "ether")
        }
      }

      /**** TODO: use Arc.DAO.new once it supports GenesisProtocol ****/
      // let schemes = [{
      //   name: "ContributionReward"
      // }];

      // let dao = await Arc.DAO.new({
      //   name: daoName,
      //   tokenName: tokenName,
      //   tokenSymbol: tokenSymbol,
      //   founders: founders,
      //   schemes: schemes
      // });

      const daoCreator = await Arc.DaoCreator.deployed();
      let daoTransaction = await daoCreator.forgeOrg({
        name: daoName,
        tokenName: tokenName,
        tokenSymbol: tokenSymbol,
        founders: founders
      });

      const avatarAddress = daoTransaction.getValueFromTx("_avatar", "NewOrg");
      const dao = await Arc.DAO.at(avatarAddress);

      const votingMachine = await Arc.GenesisProtocol.deployed();

      const votingMachineParamsHash = (await votingMachine.setParams({
        preBoostedVoteRequiredPercentage: 50,
        preBoostedVotePeriodLimit: 10000,
        boostedVotePeriodLimit: 10000,
        thresholdConstA: 1,
        thresholdConstB: 1,
        minimumStakingFee: 0,
        quietEndingPeriod: 0,
        proposingRepRewardConstA: 1,
        proposingRepRewardConstB: 1,
        stakerFeeRatioForVoters: 1,
        votersReputationLossRatio: 10,
        votersGainRepRatioFromLostRep: 80,
        governanceFormulasInterface: "0x0000000000000000000000000000000000000000"
      })).result;

      const contributionReward = await Arc.ContributionReward.deployed();
      const contributionRewardParamsHash = (await contributionReward.setParams({
        orgNativeTokenFee: web3.toWei(0, "ether"),
        votingMachine: votingMachine.contract.address,
        voteParametersHash: votingMachineParamsHash
      })).result;

      const initialSchemesSchemes = [contributionReward.contract.address, votingMachine.contract.address];
      const initialSchemesParams = [contributionRewardParamsHash, votingMachineParamsHash];
      const initialSchemesPermissions = ["0x00000001", "0x00000000"];

      // register the schemes with the dao
      const tx = await daoCreator.contract.setSchemes(
        avatarAddress,
        initialSchemesSchemes,
        initialSchemesParams,
        initialSchemesPermissions
      );

      /* EO creating DAO */

      let daoData : IDaoState = {
        avatarAddress: dao.avatar.address,
        controllerAddress: dao.controller.address,
        name: daoName,
        members: {},
        rank: 1, // TODO
        promotedAmount: 0,
        proposals: [],
        reputationAddress: dao.reputation.address,
        reputationCount: 0,
        tokenAddress: dao.token.address,
        tokenCount: 0,
        tokenName: tokenName,
        tokenSymbol: tokenSymbol
      };

      dispatch({ type: arcConstants.ARC_CREATE_DAO_FULFILLED, payload: normalize(daoData, schemas.daoSchema) });
      dispatch(push('/dao/' + dao.avatar.address));
    } catch (err) {
      dispatch({ type: arcConstants.ARC_CREATE_DAO_REJECTED, payload: err.message });
    }
  } /* EO createDAO */
}

export function createProposal(daoAvatarAddress : string, title : string, description : string, nativeTokenReward: number, reputationReward: number, beneficiary: string) : ThunkAction<any, IRootState, null> {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    dispatch({ type: arcConstants.ARC_CREATE_PROPOSAL_PENDING, payload: null });
    try {
      const web3 : Web3 = Arc.Utils.getWeb3();
      const ethAccountAddress : string = getState().web3.ethAccountAddress;

      const dao = await Arc.DAO.at(daoAvatarAddress);

      const contributionRewardInstance = await Arc.ContributionReward.deployed();

      // Get the voting machine (GenesisProtocol) TODO: there will be a better way to do this in Arc.js soon
      const schemeParamsHash = await dao.controller.getSchemeParameters(contributionRewardInstance.contract.address, dao.avatar.address);
      const schemeParams = await contributionRewardInstance.contract.parameters(schemeParamsHash);
      const votingMachineAddress = schemeParams[2];
      const votingMachineInstance = await Arc.GenesisProtocol.at(votingMachineAddress);

      const submitProposalTransaction = await contributionRewardInstance.proposeContributionReward({
        avatar: daoAvatarAddress,
        beneficiary : beneficiary,
        description: description,
        nativeTokenReward : web3.toWei(nativeTokenReward, "ether"),
        numberOfPeriods: 1,
        periodLength : 1,
        reputationChange : web3.toWei(reputationReward, "ether")
      });

      // TODO: error checking

      const proposalId = submitProposalTransaction.proposalId;

      // Cast a Yes vote as the owner of the proposal?
      //const voteTransaction = await votingMachineInstance.vote({ proposalId: proposalId, vote: VoteOptions.Yes});

      const descriptionHash = submitProposalTransaction.getValueFromTx("_contributionDescription");
      const submittedTime = Math.round((new Date()).getTime() / 1000);

      // Save the proposal title, description and submitted time on the server
      try {
        const response = await axios.post(arcConstants.API_URL + '/api/proposals', {
          arcId: proposalId,
          daoAvatarAddress: daoAvatarAddress,
          descriptionHash: descriptionHash,
          description: description,
          submittedAt: submittedTime,
          title: title
        });
      } catch (e) {
        console.log(e);
      }

      const proposal = <IProposalState>{
        beneficiary: beneficiary,
        boostedTime: 0,
        contributionDescriptionHash: descriptionHash,
        description: description,
        daoAvatarAddress: daoAvatarAddress,
        ethReward: 0, // TODO
        executionTime: 0,
        externalToken: "0",
        externalTokenReward: 0,
        nativeTokenReward: nativeTokenReward,
        numberOfPeriods: 1,
        periodLength: 1,
        proposalId: proposalId,
        proposer: ethAccountAddress,
        reputationChange: reputationReward,
        stakesNo: 0,
        stakesYes: 0,
        state: ProposalStates.PreBoosted, // TODO: update if we do vote
        submittedTime: submittedTime,
        title: title,
        totalStakes: 0,
        totalVotes: 0,
        totalVoters: 0,
        transactionState: TransactionStates.Unconfirmed,
        votesYes: 0,
        votesNo: 0,
        winningVote: 0
      };

      let payload = normalize(proposal, schemas.proposalSchema);
      (payload as any).daoAvatarAddress = daoAvatarAddress;

      dispatch({ type: arcConstants.ARC_CREATE_PROPOSAL_FULFILLED, payload: payload });
      dispatch(push('/dao/' + daoAvatarAddress));
    } catch (err) {
      dispatch({ type: arcConstants.ARC_CREATE_PROPOSAL_REJECTED, payload: err.message });
    }
  }
}

export function voteOnProposal(daoAvatarAddress: string, proposalId: string, vote: number) {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    dispatch({ type: arcConstants.ARC_VOTE_PENDING, payload: null });
    try {
      const web3 : Web3 = Arc.Utils.getWeb3();
      const ethAccountAddress : string = getState().web3.ethAccountAddress;

      const daoInstance = await Arc.DAO.at(daoAvatarAddress);
      const contributionRewardInstance = await Arc.ContributionReward.deployed();

      // TODO: clean this up once Arc.js makes it easier to get the votingMachine instance for a scheme/controller combo
      const schemeParamsHash = await daoInstance.controller.getSchemeParameters(contributionRewardInstance.contract.address, daoInstance.avatar.address);
      const schemeParams = await contributionRewardInstance.contract.parameters(schemeParamsHash);
      const votingMachineAddress = schemeParams[2]; // 2 is the index of the votingMachine address for the ContributionReward scheme
      const votingMachineInstance = await Arc.GenesisProtocol.at(votingMachineAddress);

      const voteTransaction = await votingMachineInstance.vote({ proposalId: proposalId, vote : vote} );
      const yesVotes = await votingMachineInstance.getVoteStatus({ proposalId: proposalId, vote: VoteOptions.Yes });
      const noVotes = await votingMachineInstance.getVoteStatus({ proposalId: proposalId, vote: VoteOptions.No });

      const memberUpdates : { [key : string] : IAccountState } = {};
      let winningVote = 0;
      let alert = "";
      try {
        winningVote = Number(voteTransaction.getValueFromTx("_decision", "ExecuteProposal"));

        // Did proposal pass?
        if (winningVote == VoteOptions.Yes) {
          // Redeem rewards if there are any instant ones. XXX: we shouldnt do this, have to switch to redeem system

          // XXX: hack to increase the time on the ganache blockchain so that enough time has passed to redeem the rewards
          //      so we can have instant rewards for demo
          await increaseTime(1);

          // XXX: redeem stuff from genesis for the proposer, voter and stakers if it passed?
          const genesisRedeemTransaction = await votingMachineInstance.redeem({
            proposalId: proposalId,
            beneficiary: ethAccountAddress
          });

          const beneficiary = genesisRedeemTransaction.getValueFromTx("_beneficiary", "RedeemReputation");

          // TODO: for some reason the Redeem* events on ContributionReward are not returning a _beneficiary arg
          const redeemTransaction = await contributionRewardInstance.redeemContributionReward({
            proposalId: proposalId,
            avatar: daoAvatarAddress,
            reputation: true,
            nativeTokens: true,
            ethers: true,
            externalTokens: true
          });

          memberUpdates[beneficiary] = {
            tokens: Number(web3.fromWei(await daoInstance.token.balanceOf.call(beneficiary), "ether")),
            reputation: Number(web3.fromWei(await daoInstance.reputation.reputationOf.call(beneficiary), "ether"))
          };

          alert = "Proposal passed!";

          // TODO: update the member reputation and tokens based on rewards? right now doing this in the reducer
        }
      } catch (err) {
        // The proposal was not executed
      }

      // Update voter
      memberUpdates[ethAccountAddress] = {
        tokens: Number(web3.fromWei(await daoInstance.token.balanceOf.call(ethAccountAddress), "ether")),
        reputation: Number(web3.fromWei(await daoInstance.reputation.reputationOf.call(ethAccountAddress), "ether"))
      };

      let payload = {
        daoAvatarAddress: daoAvatarAddress,
        proposal: {
          proposalId: proposalId,
          state: Number(await votingMachineInstance.getState({ proposalId : proposalId })),
          votesNo: Number(web3.fromWei(noVotes, "ether")),
          votesYes: Number(web3.fromWei(yesVotes, "ether")),
          winningVote: winningVote
        },
        dao: {
          reputationCount: Number(web3.fromWei(await daoInstance.reputation.totalSupply(), "ether")),
          tokenCount: Number(web3.fromWei(await daoInstance.token.totalSupply(), "ether"))
        },
        members: memberUpdates,
        alert: alert
      }

      dispatch({ type: arcConstants.ARC_VOTE_FULFILLED, payload: payload });
    } catch (err) {
      dispatch({ type: arcConstants.ARC_VOTE_REJECTED, payload: err.message });
    }
  }
}

export function stakeProposal(daoAvatarAddress: string, proposalId: string, vote: number) {
  return async (dispatch: Redux.Dispatch<any>, getState: () => IRootState) => {
    dispatch({ type: arcConstants.ARC_STAKE_PENDING, payload: null });
    try {
      const web3 : Web3 = Arc.Utils.getWeb3();
      const ethAccountAddress : string = getState().web3.ethAccountAddress;

      const daoInstance = await Arc.DAO.at(daoAvatarAddress);
      const contributionRewardInstance = await Arc.ContributionReward.deployed();

      // TODO: clean this up once Arc.js makes it easier to get the votingMachine instance for a scheme/controller combo
      const schemeParamsHash = await daoInstance.controller.getSchemeParameters(contributionRewardInstance.contract.address, daoInstance.avatar.address);
      const schemeParams = await contributionRewardInstance.contract.parameters(schemeParamsHash);
      const votingMachineAddress = schemeParams[2]; // 2 is the index of the votingMachine address for the ContributionReward scheme
      const votingMachineInstance = await Arc.GenesisProtocol.at(votingMachineAddress);

      const votingMachineParamHash = await daoInstance.controller.getSchemeParameters(votingMachineInstance.contract.address, daoInstance.avatar.address);
      const votingMachineParam = await votingMachineInstance.contract.parameters(votingMachineParamHash);
      const minimumStakingFee = votingMachineParam[6]; // 6 is the index of minimumStakingFee in the Parameters struct.

      const StandardToken = Arc.Utils.requireContract('StandardToken');
      const stakingToken = await StandardToken.at(await votingMachineInstance.contract.stakingToken());
      const balance = await stakingToken.balanceOf(getState().web3.ethAccountAddress);

      const input = parseInt(prompt(`How much would you like to stake? (min = ${minimumStakingFee})`, '1'));
      const amount = web3.toWei(input,'ether');
      if(amount < minimumStakingFee) throw new Error(`Staked less than the minimum: ${minimumStakingFee}!`);
      if(amount > balance) throw new Error(`Staked more than than the balacne: ${balance}!`);

      await stakingToken.approve(votingMachineInstance.address,amount);
      const stakeTransaction = await votingMachineInstance.stake({ proposalId : proposalId, vote : vote, amount : amount});

      const yesStakes = await votingMachineInstance.getVoteStake({ proposalId: proposalId, vote: VoteOptions.Yes });
      const noStakes = await votingMachineInstance.getVoteStake({ proposalId: proposalId, vote: VoteOptions.No });

      let payload = {
        daoAvatarAddress: daoAvatarAddress,
        proposal: {
          proposalId: proposalId,
          state: ProposalStates.Boosted, // Number(await votingMachineInstance.getState({ proposalId : proposalId })),
          stakesNo: Number(web3.fromWei(noStakes, "ether")),
          stakesYes: Number(web3.fromWei(yesStakes, "ether")),
        }
      }

      // See if the proposal was executed, either passing or failing
      // const executed = voteTransaction.logs.find((log : any) => log.event == "ExecuteProposal");
      // if (executed) {
      //   const decision = executed.args._decision.toNumber();
      //   payload.state = "Executed";
      //   if (decision == 1) {
      //     payload.winningVote = 1;
      //   } else if (decision == 2) {
      //     payload.winningVote = 2;
      //   } else {
      //     dispatch({ type: arcConstants.ARC_VOTE_REJECTED, payload: "Unknown proposal decision ", decision });
      //     return
      //   }
      // }

      dispatch({ type: arcConstants.ARC_STAKE_FULFILLED, payload: payload });
    } catch (err) {
      dispatch({ type: arcConstants.ARC_STAKE_REJECTED, payload: err.message });
    }
  }
}

async function increaseTime(duration : number) {
  const id = new Date().getTime();
  const web3 = Arc.Utils.getWeb3();

  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [duration],
      id: id,
    }, err1 => {
      if (err1) {return reject(err1);}

      web3.currentProvider.sendAsync({
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [],
        id: id + 1,
      }, (err2, res) => {
        return err2 ? reject(err2) : resolve(res);
      });
    });
  });
}
