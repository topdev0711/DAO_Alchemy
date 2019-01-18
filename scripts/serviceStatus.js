const fetch = require('node-fetch')
async function main() {
  let response
  console.log('------------ Service Status --------------------')

  const services = [
    {
      name: 'Alchemy Application',
      url: 'http://0.0.0.0:3000',
    },
    {
      name: 'Local Ethereum node [expect status 400]',
      url: 'http://0.0.0.0:8545',
      request: { method: 'post', body: JSON.stringify({"jsonrpc":"2.0","method":"net_listening","params":[],"id":67}), headers: { 'Content-Type': 'application/json' }},
      expectedStatus: 200
    },
    {
      name: 'Graph node (http)',
      url: 'http://0.0.0.0:8000'
    },
    {
      name: 'Graph node (port 8020) [expect status 405]',
      url: 'http://0.0.0.0:8020',
      expectedStatus: 405
    },
    {
      name: 'Graphiql interface for daostack',
      url: 'http://127.0.0.1:8000/subgraphs/name/daostack'
    },
    {
      name: 'Alchemy Server',
      url: 'http://0.0.0.0:3001/explorer'
    },
    {
      name: 'Alchemy server (accounts)',
      url: 'http://127.0.0.1:3001/api/accounts'
    }
  ]
  const output = []
  for (service of services) {
      try {
        const response = await fetch(service.url, service.request)
        const expectedStatus = service.expectedStatus || 200
        let status
        if (response.status === expectedStatus) {
          status = 'OK'
        } else  {
          status = 'ERR'
        }


        console.log(`[${status}] ${service.url} (${service.name}): status ${response.status} ${response.statusText}`)
      } catch(err) {
        console.log(`[ERR] ${service.url} (${service.name}): ${err}`)
      }
  }
  const body = {"jsonrpc":"2.0","method":"net_listening","params":[],"id":67}
  const r = await fetch('http://127.0.0.1:8545', { method: 'post', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }})
  console.log(await r.json())
  return output
}


if (require.main === module) {
  main()
    .then((output) => {
      for (l of output) {
        console.log(l)
      }
      process.exit(0)
    })
    .catch((err)  => { console.log(err); process.exit(1); });
} else {
  module.exports = main;
}
