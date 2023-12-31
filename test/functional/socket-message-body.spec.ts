import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { SocketControllers } from '../../src/SocketControllers';
import { Container, Service } from 'typedi';
import { SocketController } from '../../src/decorators/SocketController';
import { OnConnect } from '../../src/decorators/OnConnect';
import { ConnectedSocket } from '../../src/decorators/ConnectedSocket';
import { waitForEvent } from '../utilities/waitForEvent';
import { MessageBody, OnMessage, SocketId } from '../../src';

describe('MessageBody', () => {
  const PORT = 8080;
  const PATH_FOR_CLIENT = `ws://localhost:${PORT}`;

  let httpServer: HttpServer;
  let wsApp: Server;
  let wsClient: Socket;
  let testResult;
  let socketControllers: SocketControllers;

  beforeEach(done => {
    httpServer = createServer();
    wsApp = new Server(httpServer, {
      cors: {
        origin: '*',
      },
    });
    httpServer.listen(PORT, () => {
      done();
    });
  });

  afterEach(() => {
    testResult = undefined;

    Container.reset();
    wsClient.close();
    wsClient = null;
    socketControllers = null;
    return new Promise(resolve => {
      if (wsApp)
        return wsApp.close(() => {
          resolve(null);
        });
      resolve(null);
    });
  });

  it('Event body is retrieved correctly', async () => {
    @SocketController('/string')
    @Service()
    class TestController {
      @OnConnect()
      connected(@ConnectedSocket() socket: Socket, @SocketId() socketId: string) {
        testResult = socketId;
        socket.emit('connected');
      }

      @OnMessage('test')
      test(@MessageBody() data: any, @ConnectedSocket() socket: Socket) {
        testResult = data;
        socket.emit('return');
      }

      @OnMessage('test2')
      test2(
        @MessageBody({ index: 1 }) data1: any,
        @MessageBody({ index: 0 }) data0: any,
        @ConnectedSocket() socket: Socket
      ) {
        testResult = { data1, data0 };
        socket.emit('return2');
      }
    }

    socketControllers = new SocketControllers({
      io: wsApp,
      container: Container,
      controllers: [TestController],
    });
    wsClient = io(PATH_FOR_CLIENT + '/string', { reconnection: false, timeout: 5000, forceNew: true });

    await waitForEvent(wsClient, 'connected');

    wsClient.emit('test', 'test data');
    await waitForEvent(wsClient, 'return');
    expect(testResult).toEqual('test data');

    wsClient.emit('test2', 'test data 0', 'test data 1', 'test data 2', ack => {
      console.log(ack);
    });
    await waitForEvent(wsClient, 'return2');
    expect(testResult).toEqual({ data0: 'test data 0', data1: 'test data 1' });
  });
});
