import * as Arc from '@daostack/arc.js';
import * as ArcNew from '@daostack/client'
import * as React from "react";
import * as ReactDOM from "react-dom";
import { AppContainer } from "react-hot-loader";
import axios from "axios";
import BigNumber from "bignumber.js";

import { App } from "./App";

import "./assets/styles/global.scss";
import Util from 'lib/util';

async function renderApp() {
  try {
    Arc.ConfigService.set("estimateGas", true);
    Arc.ConfigService.set("txDepthRequiredForConfirmation", { kovan: 0, live: 0});
    console.log('-----------------------------------------------------------')
    const graphqlHttpProvider: string = 'http://127.0.0.1:8000/by-name/daostack/graphql'
    const graphqlWsProvider: string = 'ws://127.0.0.1:8001/by-name/daostack'
    const web3Provider: string = 'http://127.0.0.1:8545'
    let arc = new ArcNew.Arc({
      graphqlHttpProvider,
      graphqlWsProvider,
      web3Provider
    })
    console.log(arc.daos())
    console.log('-----------------------------------------------------------')

    await Arc.InitializeArcJs({ watchForAccountChanges: true });

    const web3 = await Arc.Utils.getWeb3();
    Arc.ConfigService.set("gasPriceAdjustment", async (defaultGasPrice: BigNumber) => {
      try {
        const network = await Arc.Utils.getNetworkName();
        if (network.toLowerCase() === 'live') {
          const response = await axios.get('https://ethgasstation.info/json/ethgasAPI.json');
          // the api gives results if 10*Gwei
          const gasPrice = response.data.fast / 10;
          return web3.toWei(gasPrice, 'gwei');
        } else {
          return defaultGasPrice;
        }
      } catch (e) {
        return defaultGasPrice;
      }
    })

    Arc.LoggingService.logLevel = Arc.LogLevel.all;

    // Silence 240 sec error
    Arc.ContractWrappers.AbsoluteVote.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.ContributionReward.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.DaoCreator.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.GenesisProtocol.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.GlobalConstraintRegistrar.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.SchemeRegistrar.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.TokenCapGC.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.UpgradeScheme.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.VestingScheme.contract.constructor.synchronization_timeout = 0;
    Arc.ContractWrappers.VoteInOrganizationScheme.contract.constructor.synchronization_timeout = 0;

    Arc.AccountService.subscribeToAccountChanges(() => {
      window.location.reload()
    })
  } catch (e) {
    console.error(e);
  }

  ReactDOM.render(
    <AppContainer>
      <App />
    </AppContainer>,
    document.querySelector("#root"),
  );
}

if (module.hot) {
  module.hot.accept();
  renderApp();
} else {
  renderApp();
}
