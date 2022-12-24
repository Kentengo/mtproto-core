const { log } = require("../src/utils/common/base-debug");

function sleep(time) {
  return new Promise(res => setTimeout(res, time));
}

module.exports = class API {
  mtproto = null;

  constructor(connection) {
    this.mtproto = connection;
  }

  async call(method, params, options = {}) {
    try {
      // console.log(this.mtproto);
      let timeoutStart = Date.now()
      let socketState = "close"
      while(socketState != "open") {
        
        socketState = await this.mtproto.getSocketState(options)
        console.log('Socket State:',socketState);
        await sleep(10e3)
        console.log('LOGOUT please');
        if (Date.now() - 30e3 > timeoutStart) break
      }


      if (socketState != "open") console.log("Тут надо вернуть ошибку");
      const result = await this.mtproto.call(method, params, options);

      // console.log(result.hash);

      const { error_code, error_message } = result;

      if (error_code === 420) {
        const seconds = Number(error_message.split('FLOOD_WAIT_')[1]);
        const ms = seconds * 1000;

        await sleep(ms);

        return this.call(method, params, options);
      }


      if (error_code === 303) {
        console.log('HELLO PHONE MIGRATION NEEDED!');
        const [type, dcIdAsString] = error_message.split('_MIGRATE_');

        const dcId = Number(dcIdAsString);

        // If auth.sendCode call on incorrect DC need change default DC, because
        // call auth.signIn on incorrect DC return PHONE_CODE_EXPIRED error
        if (type === 'PHONE') {
          await this.mtproto.setDefaultDc(dcId);
        } else {
          Object.assign(options, { dcId });
        }

        return await this.call(method, params, options);
      }

      if (error_message || error_code) {
        return Promise.reject(result);
      }

      return result;
    } catch (error) {

      console.log(`${method} TG_error:`, error);
    }
  }


  async destroyAllRpc() {
    await this.mtproto.destroy()
  }
}
