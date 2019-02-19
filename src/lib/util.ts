import { Address } from "@daostack/client"
import { getArc } from 'arc'
import BN = require("bn.js")

// haven’t figured out how to get web3 typings to properly expose the Web3 constructor.
// v1.0 may improve on this entire Web3 typings experience
/* tslint:disable-next-line:no-var-requires */
const Web3 = require("web3");
const path = require("path")

export default class Util {
  public static fromWei(amount: BN): number {
    return Number(getArc().web3.utils.fromWei(amount, "ether"))
  }

  public static toWei(amount: number): BN {
    return new BN(getArc().web3.utils.toWei(amount.toString(), "ether"))
  }

  public static getBalance(account: Address) {
    return getArc().web3.eth.getBalance(account)
  }

  public static networkName(id: number) {
    switch (id) {
      case 1:
        return "Mainnet"
      case 2:
        return "Morden"
      case 3:
        return "Ropsten"
      case 4:
        return "Rinkeby"
      case 42:
        return "Kovan"
      case 1512051714758:
        return "Ganache"
      default:
        return "Ganache"
    }
  }
  public static copyToClipboard(value: any) {
    const el = document.createElement("textarea");
    el.value = value;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }

  public static async getLatestBlock() {
    try {
      return (await getArc().web3.getBlock("latest")).number;
    } catch (err) {
      throw err
    }
  }

  public static trace<T>(x: T, ...args: any[]): T {
    // tslint:disable-next-line:no-console
    console.debug("trace", ...args, x);
    return x;
  }

  public static getWeb3() {
    return getArc().web3
  }
  public static getNetworkId() {
    return getArc().web3.eth.net.getId()
  }

  public static defaultAccount() {
    return getArc().web3.eth.defaultAccount
  }
}

export function getLocalContractAddresses() {
  const deployedContractAddresses = require(`../../config/migration.json`)

  const addresses = {
      ...deployedContractAddresses.private.base,
      // ...require(path).private.dao
   }
  console.log(addresses)
  if (!addresses || addresses === {}) {
      throw Error(`No addresses found, does the file at ${"../../config/migration.json"} exist?`)
    }
  return addresses
}
