const API = require("./api");
const MTProto = require('../envs/node/index');
const path = require('path');
const { sleep } = require("../src/utils/common");

let proxy = "45.152.214.36:52980:LZUgzkdi:WG9b3Hbb".split(":");
proxy = {
  host: proxy[0],
  port: parseInt(proxy[1]),
  login: proxy[2],
  pass: proxy[3],
  type: 5
};

const mtproto = new MTProto({
  api_id: 8,
  api_hash: "7245de8e747a0d6fbe11f7cc14fcc0bb",
  storageOptions: {
    path: path.resolve(__dirname, `./data/1.json`),
  },
  proxy: proxy,
  accData: {},
});

const api = new API(mtproto);

async function getMe() {
  // 1. сделать запрос 
  let res = await api.call("help.getCountriesList")
  console.log(res.hash);
  
  console.log('\n\n\n============\n\n\n');
  let res2 = await api.call("help.getCountriesList")
  console.log(res2.hash);


  await api.destroyAllRpc();
  // 2. разорвать сокет

  // 3. сделать еще один запрос
  // 4. убедиться, что запрос выполнен без ошибок
}

async function main() {
  await getMe();
}

main();
