 const chai = require("chai");
 global.expect = chai.expect;
 chai.Should();

 export const LATEST_ARC_VERSION = "0.0.1-rc.19";
// because we do not have a "real" dutchX test, we'll just choose one (older) version
 // not thtat the correct address (migration.private.base[VERSION_FOR_DUTCHX_TEST]. GEenericScheme)
 // needs to be set in the generiscEhemeRegiststry/dutchx.json file for the tests to pass
 // (ie.e. for version 0.0.1-rc.17 this is 0xa6f8431c9eee4ac2859207af4004f7a948924c30)
 export const VERSION_FOR_DUTCHX_TEST = "0.0.1-rc.17";

 export function getContractAddresses() {
  // contract addresses for testing...
  const migration = require("@daostack/migration/migration.json")["private"];
  const contracts: {
    base: {[address: string]: string},
    dao: {[address: string]: string},
    test: {[address: string]: string},
    dutchx: {[address: string]: string},
  } = { base: {}, dao: {}, test: {}, dutchx: {} };
  const version = LATEST_ARC_VERSION;
  for (const name of Object.keys(migration.base[version])) {
    contracts.base[name] = migration.base[version][name];
  }
  for (const name of Object.keys(migration.test[version])) {
    contracts.test[name] = migration.test[version][name];
  }
  for (const name of Object.keys(migration.dao[version])) {
    contracts.dao[name] = migration.dao[version][name];
  }

  for (const name of Object.keys(migration.base[VERSION_FOR_DUTCHX_TEST])) {
    contracts.base[name] = migration.base[VERSION_FOR_DUTCHX_TEST][name];
  }
  for (const name of Object.keys(migration.test[VERSION_FOR_DUTCHX_TEST])) {
    contracts.base[name] = migration.test[VERSION_FOR_DUTCHX_TEST][name];
  }

  return contracts;
}

 export const userAddresses = [
  "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1"
];
