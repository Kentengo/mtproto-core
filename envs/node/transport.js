const net = require('net');
const SocksClient = require('socks').SocksClient
const Obfuscated = require('../../src/transport/obfuscated');
const baseDebug = require('../../src/utils/common/base-debug');

class Transport extends Obfuscated {
  constructor(dc, crypto, proxy) {
    super();

    this.dc = dc;
    this.debug = baseDebug.extend(`transport-${this.dc.id}`);
    this.crypto = crypto;
    this.proxy = proxy
    this.fail = false;
    this.needReconnect = true
    // this.connect();
  }

  get isAvailable() {
    // return this.socket.closed ? false : true;
    return this.socket.writable;

  }

  connect() {
    return new Promise(async resolve => {

      try {

        this.stream = new Uint8Array();

        if (this.proxy && this.proxy.host && this.proxy.port && this.proxy.type) {

          const options = {
            proxy: {
              host: this.proxy.host, // ipv4 or ipv6 or hostname
              port: this.proxy.port,
              type: this.proxy.type // Proxy version (4 or 5)
            },
            command: 'connect', // SOCKS command (createConnection factory function only supports the connect command
            destination: {
              host: this.dc.ip,
              port: this.dc.port
            }
          }

          if (this.proxy.login && this.proxy.pass && this.proxy.login !== '' && this.proxy.pass !== '') {

            options.proxy.userId = this.proxy.login
            options.proxy.password = this.proxy.pass

          }

          if (this.proxy.timeout) {
            options.timeout = this.proxy.timeout
          }

          // console.log('options')
          // console.log(options)


          let socketProxy = await SocksClient.createConnection(options);
    



          this.socket = socketProxy.socket;
          // this.handleConnect.bind(this)
          await this.handleConnect()



        } else {


          this.socket = net.connect(
            this.dc.port,
            this.dc.ip,
            this.handleConnect.bind(this)
          );

          
        }

        this.socket.on('data', this.handleData.bind(this));
        this.socket.on('error', this.handleError.bind(this));
        this.socket.on('close', this.handleClose.bind(this));

        this.debug('connect');

        resolve(this.socket)
      }
      catch (e) {
        console.log('e:165')
        if (e.message.includes('ENETUNREACH')){
          console.log('Socket: BAD CONNECTION',e.message);
        }else{
          console.log(e);
        }
        

        this.proxy.failCounter++


        if (this.proxy.failCounter > 100) {
          this.fail = true;
          // return await this.proxy.failureCallback()
          await this.proxy.failureCallback()
          return resolve()
          // return resolve()
        }

        await this.sleep(0)

        return resolve(await this.connect())
        // return setTimeout(async ()=>{ await this.connect()},2000)
        // return resolve( setTimeout(async ()=>{ await this.connect()},2000))
        // return setTimeout(async ()=>{ this.connect()},2000)
      }
    })
  }

  destroy() {
    this.needReconnect = false
    if (!this.socket.destroyed) {

      this.socket.destroy();
      // this.socket.end()
      console.log(`Socket: destroyed`);
      
    } else {
      console.log(this.socket.readyState);
      console.log("Socket already destroyed!");
    }
  }


  sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async handleData(data) {
    const bytes = new Uint8Array(data);

    const deobfuscatedBytes = await this.deobfuscate(bytes);

    this.stream = new Uint8Array([...this.stream, ...deobfuscatedBytes]);

    // The minimum length is eight (transport error with a intermediate header)
    while (this.stream.length >= 8) {
      const dataView = new DataView(this.stream.buffer);
      const payloadLength = dataView.getUint32(0, true);

      if (payloadLength <= this.stream.length - 4) {
        const payload = this.stream.slice(4, payloadLength + 4);

        if (payloadLength === 4) {
          const code = dataView.getInt32(4, true) * -1;

          this.emit('error', {
            type: 'transport',
            code,
          });
        } else {
          this.emit('message', payload.buffer);
        }

        this.stream = this.stream.slice(payloadLength + 4);
      } else {
        break;
      }
    }
  }

  async handleError(error) {
    // console.log('Socket handle: error');
    this.emit('error', {
      type: 'socket',
    });
  }

  async handleClose(hadError) {
    // console.log('Socket handle: close');
    if (!this.socket.destroyed) {
      this.socket.close();
    }

    if (this.needReconnect) {
      console.log('Socket: reconnect');
      await this.connect();
    }

    // this.proxy.reconnect()

  }

  async handleConnect() {

    return new Promise(async resolve => {
      // console.log('Socket handle: connect')

      const initialMessage = await this.generateObfuscationKeys();

      this.socket.write(initialMessage);

      this.emit('open');

      // this.emit('error', {
      //   type: 'transport',
      //   code:123,
      // });

      return resolve()
    })


  }

  async send(bytes) {
    const intermediateBytes = this.getIntermediateBytes(bytes);

    const obfuscatedBytes = await this.obfuscate(intermediateBytes);

    this.socket.write(obfuscatedBytes);
  }
}

module.exports = Transport;
