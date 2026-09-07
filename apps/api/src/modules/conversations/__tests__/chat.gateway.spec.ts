import type { Conversation } from '@prisma/client';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import type { TokenService } from '../../auth/token.service';
import type { ChatSocket } from '../chat.gateway';
import { ChatGateway } from '../chat.gateway';
import type { ConversationUpdatedEvent, MessageNewEvent, MessageReadEvent } from '../chat.events';
import { chatRooms } from '../chat.events';
import type { ConversationsRepository } from '../conversations.repository';

/**
 * CHT-004 gateway unit suite — socket.io stays out of scope: sockets and the
 * @WebSocketServer() instance are plain fakes, so the suite pins the parts the
 * card demands: handshake auth (accept/reject via TokenService), room-join
 * authorization (participant vs non-participant), the 3 s typing debounce,
 * and the emitter's room routing. Full socket.io e2e is deliberately not
 * added (heavy; documented on the card and in the module README).
 */

type NextFn = (err?: Error) => void;

/** Minimal socket double — only what the gateway touches. */
function makeSocket(overrides?: Partial<ChatSocket>): ChatSocket {
  return {
    id: 'socket-1',
    handshake: { auth: {}, headers: {} },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  } as unknown as ChatSocket;
}

/** The socket.io server double — `to(room)` returns ONE stable emit handle
 * per room (like socket.io's BroadcastOperator), so emit counts accumulate
 * across multiple relays into the same room. */
function makeServer() {
  const rooms = new Map<string, { emit: jest.Mock }>();
  return {
    use: jest.fn(),
    to: jest.fn((room: string) => {
      let handle = rooms.get(room);
      if (!handle) {
        handle = { emit: jest.fn() };
        rooms.set(room, handle);
      }
      return handle;
    }),
    roomHandle: (room: string) => rooms.get(room),
  };
}

describe('ChatGateway', () => {
  const buyer: AuthUser = {
    sub: 'user-buyer',
    phone: '09121110000',
    role: 'USER',
    status: 'ACTIVE',
  };
  let gateway: ChatGateway;
  let repository: { findById: jest.Mock };
  let tokenService: { verifyAccessToken: jest.Mock };

  const seedConversation = (overrides?: Partial<Conversation>): Conversation =>
    ({
      id: 'conv-1',
      lotId: 'lot-1',
      buyerId: 'user-buyer',
      sellerId: 'user-seller',
      status: 'ACTIVE',
      lastMessageAt: new Date(),
      lastMessagePreview: null,
      buyerUnreadCount: 0,
      sellerUnreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Conversation;

  beforeEach(() => {
    jest.useFakeTimers();
    repository = { findById: jest.fn() };
    tokenService = { verifyAccessToken: jest.fn() };
    gateway = new ChatGateway(
      repository as unknown as ConversationsRepository,
      tokenService as unknown as TokenService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Assigns the private @WebSocketServer() field (tests only). */
  function attachServer(): ReturnType<typeof makeServer> {
    const server = makeServer();
    (gateway as unknown as { server: unknown }).server = server;
    return server;
  }

  /** Drains the async middleware chain (verifyAccessToken → next) fully. */
  async function flush(): Promise<void> {
    for (let tick = 0; tick < 5; tick += 1) {
      await Promise.resolve();
    }
  }

  /** Runs the handshake middleware registered in afterInit against a socket. */
  async function runHandshake(socket: ChatSocket): Promise<Error | undefined> {
    const server = attachServer();
    gateway.afterInit(server as never);
    expect(server.use).toHaveBeenCalledTimes(1);
    const middleware = server.use.mock.calls[0]?.[0] as (socket: ChatSocket, next: NextFn) => void;
    let error: Error | undefined;
    middleware(socket, (err) => {
      error = err;
    });
    await flush();
    return error;
  }

  describe('handshake auth (afterInit middleware)', () => {
    it('accepts a valid auth.token, attaches the AuthUser, calls next without error', async () => {
      const socket = makeSocket();
      socket.handshake.auth = { token: 'good-token' };
      tokenService.verifyAccessToken.mockResolvedValue(buyer);

      const error = await runHandshake(socket);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('good-token');
      expect(error).toBeUndefined();
      expect(socket.data.user).toEqual(buyer);
    });

    it('falls back to the Authorization: Bearer header when auth.token is absent', async () => {
      const socket = makeSocket();
      socket.handshake.headers.authorization = 'Bearer header-token';
      tokenService.verifyAccessToken.mockResolvedValue(buyer);

      const error = await runHandshake(socket);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('header-token');
      expect(error).toBeUndefined();
    });

    it('prefers auth.token over the header when both are present', async () => {
      const socket = makeSocket();
      socket.handshake.auth = { token: 'auth-token' };
      socket.handshake.headers.authorization = 'Bearer header-token';
      tokenService.verifyAccessToken.mockResolvedValue(buyer);

      await runHandshake(socket);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('auth-token');
      expect(tokenService.verifyAccessToken).not.toHaveBeenCalledWith('header-token');
    });

    it('rejects a handshake with NO credential (opaque WsException code, no user attached)', async () => {
      const socket = makeSocket();

      const error = await runHandshake(socket);

      expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('UNAUTHORIZED');
      expect(socket.data.user).toBeUndefined();
    });

    it('rejects an INVALID token (TokenService throws) — the invalid-token disconnect', async () => {
      const socket = makeSocket();
      socket.handshake.auth = { token: 'expired-token' };
      tokenService.verifyAccessToken.mockRejectedValue(
        new Error('Invalid or expired access token'),
      );

      const error = await runHandshake(socket);

      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('UNAUTHORIZED');
      expect(socket.data.user).toBeUndefined();
    });
  });

  describe('handleConnection — the per-user room', () => {
    it('joins user:{id} for an authenticated socket', () => {
      const socket = makeSocket();
      socket.data.user = buyer;

      gateway.handleConnection(socket);

      expect(socket.join).toHaveBeenCalledWith(chatRooms.user(buyer.sub));
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('drops a socket that reached handleConnection without an authenticated user', () => {
      const socket = makeSocket();

      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('conversation:subscribe — server-authorized room join', () => {
    it('joins the conversation room for the BUYER side and tracks the subscription', async () => {
      attachServer();
      const socket = authedSocket();
      const conversation = seedConversation();
      repository.findById.mockResolvedValue(conversation);

      await gateway.onSubscribe(socket, { conversationId: conversation.id });

      expect(repository.findById).toHaveBeenCalledWith(conversation.id);
      expect(socket.join).toHaveBeenCalledWith(chatRooms.conversation(conversation.id));
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('joins for the SELLER side too', async () => {
      attachServer();
      const socket = authedSocket('user-seller');
      repository.findById.mockResolvedValue(seedConversation());

      await gateway.onSubscribe(socket, { conversationId: 'conv-1' });

      expect(socket.join).toHaveBeenCalledWith(chatRooms.conversation('conv-1'));
    });

    it('answers a THIRD user with conversation:error NOT_PARTICIPANT — never joins the room', async () => {
      attachServer();
      const socket = authedSocket('user-outsider');
      repository.findById.mockResolvedValue(seedConversation());

      await gateway.onSubscribe(socket, { conversationId: 'conv-1' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('conversation:error', {
        code: 'NOT_PARTICIPANT',
        conversationId: 'conv-1',
      });
    });

    it('answers an unknown conversationId with CONVERSATION_NOT_FOUND and no join', async () => {
      attachServer();
      const socket = authedSocket();
      repository.findById.mockResolvedValue(null);

      await gateway.onSubscribe(socket, { conversationId: 'missing-conv' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('conversation:error', {
        code: 'CONVERSATION_NOT_FOUND',
        conversationId: 'missing-conv',
      });
    });

    it('answers a malformed payload with INVALID_PAYLOAD and no repository read', async () => {
      attachServer();
      const socket = authedSocket();

      for (const payload of [undefined, null, 'conv-1', 42, {}, { conversationId: 7 }]) {
        await gateway.onSubscribe(socket, payload);
      }

      expect(repository.findById).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledTimes(6);
      expect(socket.emit).toHaveBeenCalledWith('conversation:error', {
        code: 'INVALID_PAYLOAD',
      });
    });
  });

  describe('conversation:unsubscribe', () => {
    it('leaves the room and drops the tracked subscription (leave needs no authorization)', async () => {
      attachServer();
      const socket = authedSocket();
      repository.findById.mockResolvedValue(seedConversation());
      await gateway.onSubscribe(socket, { conversationId: 'conv-1' });

      await gateway.onUnsubscribe(socket, { conversationId: 'conv-1' });

      expect(socket.leave).toHaveBeenCalledWith(chatRooms.conversation('conv-1'));

      // The dropped subscription closes the typing relay for this socket.
      gateway.onTyping(socket, { conversationId: 'conv-1' });
      expect(socket.emit).toHaveBeenCalledWith('conversation:error', {
        code: 'NOT_SUBSCRIBED',
        conversationId: 'conv-1',
      });
    });
  });

  describe('typing — relay with a 3 s server-side debounce', () => {
    it('relays { conversationId, userId } to the conversation room for a subscriber', async () => {
      const server = attachServer();
      const socket = await subscribedSocket(server, 'conv-1');

      gateway.onTyping(socket, { conversationId: 'conv-1' });

      expect(server.to).toHaveBeenCalledWith(chatRooms.conversation('conv-1'));
      expect(server.roomHandle(chatRooms.conversation('conv-1'))?.emit).toHaveBeenCalledWith(
        'typing',
        { conversationId: 'conv-1', userId: buyer.sub },
      );
    });

    it('suppresses bursts: two typing events within 3 s relay ONCE', async () => {
      const server = attachServer();
      const socket = await subscribedSocket(server, 'conv-1');

      gateway.onTyping(socket, { conversationId: 'conv-1' });
      jest.advanceTimersByTime(2_000);
      gateway.onTyping(socket, { conversationId: 'conv-1' });

      expect(server.roomHandle(chatRooms.conversation('conv-1'))?.emit).toHaveBeenCalledTimes(1);
    });

    it('relays again once the 3 s window has passed (first event of the window wins)', async () => {
      const server = attachServer();
      const socket = await subscribedSocket(server, 'conv-1');

      gateway.onTyping(socket, { conversationId: 'conv-1' });
      jest.advanceTimersByTime(3_000);
      gateway.onTyping(socket, { conversationId: 'conv-1' });

      expect(server.roomHandle(chatRooms.conversation('conv-1'))?.emit).toHaveBeenCalledTimes(2);
    });

    it('debounces per USER per CONVERSATION — another user (or thread) relays immediately', async () => {
      const server = attachServer();
      const buyerSocket = await subscribedSocket(server, 'conv-1');
      const sellerSocket = await subscribedSocket(server, 'conv-1', 'user-seller');
      const otherThread = await subscribedSocket(server, 'conv-2');

      gateway.onTyping(buyerSocket, { conversationId: 'conv-1' });
      gateway.onTyping(sellerSocket, { conversationId: 'conv-1' }); // other user, same thread
      gateway.onTyping(otherThread, { conversationId: 'conv-2' }); // same user, other thread

      const conv1 = server.roomHandle(chatRooms.conversation('conv-1'));
      const conv2 = server.roomHandle(chatRooms.conversation('conv-2'));
      expect(conv1?.emit).toHaveBeenCalledTimes(2); // buyer + seller relays
      expect(conv2?.emit).toHaveBeenCalledTimes(1);
      expect(conv1?.emit).toHaveBeenLastCalledWith('typing', {
        conversationId: 'conv-1',
        userId: 'user-seller',
      });
    });

    it('rejects typing for a conversation this socket never subscribed to (no relay, NOT_SUBSCRIBED)', () => {
      const server = attachServer();
      const socket = authedSocket();

      gateway.onTyping(socket, { conversationId: 'conv-never-subscribed' });

      expect(server.to).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('conversation:error', {
        code: 'NOT_SUBSCRIBED',
        conversationId: 'conv-never-subscribed',
      });
    });
  });

  describe('ChatEmitter — room routing of committed mutations', () => {
    const messagePayload: MessageNewEvent = {
      conversationId: 'conv-1',
      message: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-buyer',
        type: 'TEXT',
        body: 'سلام',
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        readAt: null,
      },
    };
    const updatedPayload: ConversationUpdatedEvent = {
      conversationId: 'conv-1',
      lastMessageAt: new Date('2026-09-01T10:00:00.000Z'),
      preview: 'سلام',
      unreadCount: 3,
    };
    const readPayload: MessageReadEvent = {
      conversationId: 'conv-1',
      readerId: 'user-seller',
      readCount: 2,
    };

    it('emitMessageNew targets the conversation room with message:new', () => {
      const server = attachServer();

      gateway.emitMessageNew(messagePayload);

      expect(server.to).toHaveBeenCalledWith(chatRooms.conversation('conv-1'));
      expect(server.roomHandle(chatRooms.conversation('conv-1'))?.emit).toHaveBeenCalledWith(
        'message:new',
        messagePayload,
      );
    });

    it('emitConversationUpdated targets ONLY the recipient user room', () => {
      const server = attachServer();

      gateway.emitConversationUpdated('user-seller', updatedPayload);

      expect(server.to).toHaveBeenCalledTimes(1);
      expect(server.to).toHaveBeenCalledWith(chatRooms.user('user-seller'));
      expect(server.roomHandle(chatRooms.user('user-seller'))?.emit).toHaveBeenCalledWith(
        'conversation:updated',
        updatedPayload,
      );
    });

    it('emitMessageRead targets the conversation room with message:read', () => {
      const server = attachServer();

      gateway.emitMessageRead(readPayload);

      expect(server.to).toHaveBeenCalledWith(chatRooms.conversation('conv-1'));
      expect(server.roomHandle(chatRooms.conversation('conv-1'))?.emit).toHaveBeenCalledWith(
        'message:read',
        readPayload,
      );
    });

    it('is a no-op (not a crash) when called before the server exists — boot-order safety', () => {
      expect(() => gateway.emitMessageNew(messagePayload)).not.toThrow();
      expect(() => gateway.emitConversationUpdated('user-seller', updatedPayload)).not.toThrow();
      expect(() => gateway.emitMessageRead(readPayload)).not.toThrow();
    });
  });

  // --- helpers ---

  function authedSocket(userId: string = buyer.sub): ChatSocket {
    const socket = makeSocket();
    socket.data.user = { ...buyer, sub: userId };
    return socket;
  }

  /** Subscribes through the REAL handler (the same path clients take) so the
   * subscription tracking under test is exercised, not bypassed. */
  async function subscribedSocket(
    server: ReturnType<typeof makeServer>,
    conversationId: string,
    userId: string = buyer.sub,
  ): Promise<ChatSocket> {
    const socket = authedSocket(userId);
    repository.findById.mockResolvedValue(seedConversation({ id: conversationId }));
    await gateway.onSubscribe(socket, { conversationId });
    server.to.mockClear();
    return socket;
  }
});
