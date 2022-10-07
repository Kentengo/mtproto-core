const EventEmitter = require('events');
const RPC = require('./rpc');
const Crypto = require('./crypto');
const Storage = require('./storage');
const baseDebug = require('./utils/common/base-debug');

const debug = baseDebug.extend('main');

const TEST_DC_LIST = [
  {
    id: 1,
    ip: '149.154.175.10',
    port: 80,
    test: true,
  },
  {
    id: 2,
    ip: '149.154.167.40',
    port: 443,
    test: true,
  },
  {
    id: 3,
    ip: '149.154.175.117',
    port: 443,
    test: true,
  },
];

const PRODUCTION_DC_LIST = [
  {
    id: 1,
    ip: '149.154.175.53',
    port: 443,
  },
  {
    id: 2,
    ip: '149.154.167.50',
    port: 443,
  },
  {
    id: 3,
    ip: '149.154.175.100',
    port: 443,
  },
  {
    id: 4,
    ip: '149.154.167.92',
    port: 443,
  },
  {
    id: 5,
    ip: '91.108.56.128',
    port: 443,
  },
];

function makeMTProto(envMethods) {
  const requiredEnvMethods = [
    'SHA1',
    'SHA256',
    'PBKDF2',
    'getRandomBytes',
    'getLocalStorage',
    'createTransport',
  ];

  console.log('required env methods', requiredEnvMethods)
  console.log('available env methods', envMethods);

  const envMethodsIsValid = requiredEnvMethods.every(
      (methodName) => methodName in envMethods
  );

  if (!envMethodsIsValid) {
    throw new Error('Specify all envMethods');
  }

  return class {
    constructor(options) {
      const { api_id, api_hash, storageOptions, proxy, accData} = options;

      this.api_id = api_id;
      this.api_hash = api_hash;
      this.proxy = proxy
      this.accData = accData

      this.initConnectionParams = {};

      this.dcList = !!options.test ? TEST_DC_LIST : (options.dcList ? [...options.dcList, PRODUCTION_DC_LIST] :PRODUCTION_DC_LIST);

      this.envMethods = envMethods;

      this.rpcs = new Map();
      this.crypto = new Crypto(this.envMethods);
      this.storage = new Storage(
          storageOptions,
          this.envMethods.getLocalStorage
      );

      if(options.dcList){
        this.storage.set('defaultDcId', options.dcList[0].id)
      }

      this.updates = new EventEmitter();


    }

    async call(method, params = {}, options = {}) {
      const { syncAuth = true } = options;

      // @TODO: defaultDcId may be a string
      const dcId = options.dcId || (await this.storage.get('defaultDcId')) || 2;

      const rpc = await this.getRPC(dcId);

      // console.log('rpc')
      // console.log(rpc)

      if(!rpc){
        console.log('нет рпц')

        return new Promise(reject=>{reject({error_code:'000', error_message:'Не удалось подключиться'})})
        // throw new Error({error_code:'000', error_message:'Не удалось подключиться'})
        return;
      }

      try {
        const result = await rpc.call(method, params);

        if (syncAuth && result._ === 'auth.authorization') {
          await this.syncAuth(dcId);
        }

        return result;
      }
      catch(e){
        console.log('RPC call error', e)

        return {error_code:'_131', error_message:e}
        // console.log(result)
      }
    }

    syncAuth(dcId) {
      const promises = [];

      this.dcList.forEach((dc) => {
        if (dcId === dc.id) {
          return;
        }

        const promise = this.call(
            'auth.exportAuthorization',
            {
              dc_id: dc.id,
            },
            { dcId }
        )
            .then((result) => {
              return this.call(
                  'auth.importAuthorization',
                  {
                    id: result.id,
                    bytes: result.bytes,
                  },
                  { dcId: dc.id, syncAuth: false }
              );
            })
            .catch((error) => {
              debug(`error when copy auth to DC ${dc.id}`, error);

              return Promise.resolve();
            });

        promises.push(promise);
      });

      return Promise.all(promises);
    }

    setDefaultDc(dcId) {
      return this.storage.set('defaultDcId', dcId);
    }

    getRPC(dcId) {

      return new Promise(async resolve=> {
        if (this.rpcs.has(dcId)) {
          return resolve(this.rpcs.get(dcId));
        }

        const dc = this.dcList.find(({id}) => id === dcId);

        if (!dc) {
          debug(`don't find DC ${dcId}`);

          return resolve(false);
        }

        const transport = this.envMethods.createTransport(dc, this.crypto, this.proxy);

        await transport.connect()

        // console.log('transport')
        // console.log(transport)

        if(transport.fail){
          return resolve(false);
        }

        const rpc = new RPC({
          dc,
          context: this,
          transport,
          reconnect: this.proxy.reconnect,
          accData: this.accData
        });

        await rpc.handleTransportOpen();

        this.rpcs.set(dcId, rpc);

        return resolve(rpc);
      })
    }

    updateInitConnectionParams(params) {
      this.initConnectionParams = params;
    }
  };
}

module.exports = makeMTProto;
