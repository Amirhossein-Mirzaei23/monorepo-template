import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { ExtendedError, Server, Socket } from 'socket.io';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { TokenService } from '../auth/token.service';
import {
  CHAT_WS_ERROR_CODES,
  TYPING_DEBOUNCE_MS,
  chatRooms,
  type ChatClientToServerEvents,
  type ChatEmitter,
  type ChatServerToClientEvents,
  type ConversationErrorEvent,
  type ConversationUpdatedEvent,
  type MessageNewEvent,
  type MessageReadEvent,
} from './chat.events';
import { MESSAGE_ERROR_CODES } from './conversations.constants';
import { ConversationsRepository } from './conversations.repository';

/**
 * Socket data attached by the handshake middleware — `user` is set ONLY after
 * TokenService verified the bearer token; `requireUser` refuses sockets that
 * somehow arrive without it (defense in depth — never trust the client).
 */
export interface ChatSocketData {
  user?: AuthUser;
}

export type ChatSocket = Socket<ChatClientToServerEvents, ChatServerToClientEvents> & {
  data: ChatSocketData;
};

/**
 * CHT-004 — the /ws socket.io gateway. Transport-level concerns only:
 * handshake authentication, room bookkeeping, and the typed emit surface.
 * Business rules stay in ConversationsService, which announces committed
 * mutations through the ChatEmitter interface this class implements (bound in
 * ConversationsModule with `useExisting: ChatGateway`).
 *
 * Handshake auth decision (documented, card CHT-004): the bearer access token
 * is read from `handshake.auth.token` — the field socket.io-client sends via
 * `io(url, { auth: { token } })` — with an `Authorization: Bearer …` header
 * fallback for non-browser clients (tests/tools). Verification reuses
 * TokenService.verifyAccessToken (same secret as REST); a missing or invalid
 * token rejects the connection in the socket.io middleware (next(WsException))
 * so an unauthenticated socket never completes its handshake.
 *
 * Rooms are joined exclusively through this gateway's handlers — the client
 * cannot pick rooms itself (socket.io has no client-side join; every join goes
 * through `conversation:subscribe`, which re-verifies participation against
 * the DB via the repository before joining).
 */
@WebSocketGateway({
  path: '/ws',
  // CORS origins are merged in at boot by the config-driven WsAdapter
  // (src/common/ws/ws-adapter.ts) — decorator options are static, evaluated
  // before DI exists, so ws.origins cannot be read here directly.
})
export class ChatGateway implements ChatEmitter, OnGatewayConnection<ChatSocket> {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private server: Server<ChatClientToServerEvents, ChatServerToClientEvents> | undefined;

  /**
   * Server-verified subscriptions per socket (WeakMap → sockets garbage-collect
   * their own entry on disconnect — no OnGatewayDisconnect bookkeeping) and the
   * typing debounce timestamps, keyed `userId:conversationId` — bounded by
   * participants × threads; a stale key at worst delays one relay by < 3 s.
   */
  private readonly subscriptions = new WeakMap<ChatSocket, Set<string>>();
  private readonly lastTypingRelayAt = new Map<string, number>();

  constructor(
    private readonly repository: ConversationsRepository,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Registers the handshake middleware: verifies the JWT BEFORE the socket
   * joins any namespace and attaches the AuthUser to socket.data. Rejected
   * handshakes (next(WsException)) disconnect the client — the card's
   * "invalid token → disconnect".
   */
  afterInit(server: Server<ChatClientToServerEvents, ChatServerToClientEvents>): void {
    server.use((socket, next) => {
      void this.authorizeHandshake(socket as ChatSocket, next);
    });
  }

  /** Auto-join the per-user room — every authenticated connection gets one. */
  handleConnection(client: ChatSocket): void {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    void client.join(chatRooms.user(user.sub));
  }

  // --- client → server ---

  /**
   * `conversation:subscribe` { conversationId } — the ONLY path into a
   * conversation room. Server-side participant check first (404/403 analogues
   * as `conversation:error` events, never an HTTP status), then the join. The
   * successful join is tracked on the socket so `typing` can relay without a
   * DB read per keystroke burst.
   */
  @SubscribeMessage('conversation:subscribe')
  async onSubscribe(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    const conversationId = readConversationId(payload);
    if (!conversationId) {
      this.emitError(client, { code: CHAT_WS_ERROR_CODES.INVALID_PAYLOAD });
      return;
    }

    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      this.emitError(client, {
        code: CHAT_WS_ERROR_CODES.CONVERSATION_NOT_FOUND,
        conversationId,
      });
      return;
    }
    if (conversation.buyerId !== user.sub && conversation.sellerId !== user.sub) {
      this.emitError(client, {
        code: MESSAGE_ERROR_CODES.NOT_PARTICIPANT,
        conversationId,
      });
      return;
    }

    this.subscriptionsFor(client).add(conversationId);
    await client.join(chatRooms.conversation(conversationId));
  }

  /**
   * `conversation:unsubscribe` { conversationId } — leave is always allowed
   * (idempotent in socket.io); no authorization needed to stop listening.
   */
  @SubscribeMessage('conversation:unsubscribe')
  async onUnsubscribe(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    if (!this.requireUser(client)) {
      return;
    }
    const conversationId = readConversationId(payload);
    if (!conversationId) {
      this.emitError(client, { code: CHAT_WS_ERROR_CODES.INVALID_PAYLOAD });
      return;
    }
    this.subscriptionsFor(client).delete(conversationId);
    await client.leave(chatRooms.conversation(conversationId));
  }

  /**
   * `typing` { conversationId } — relayed to the conversation room as
   * { conversationId, userId } with a 3 s per-(user, conversation) debounce:
   * at most ONE relay per window (first event wins), so a keystroke burst
   * costs one broadcast per 3 s. Requires a previous server-verified
   * `conversation:subscribe` on this socket — untracked conversations are
   * rejected without a relay (never trust client state).
   */
  @SubscribeMessage('typing')
  onTyping(@ConnectedSocket() client: ChatSocket, @MessageBody() payload: unknown): void {
    const user = this.requireUser(client);
    const conversationId = readConversationId(payload);
    if (!conversationId) {
      this.emitError(client, { code: CHAT_WS_ERROR_CODES.INVALID_PAYLOAD });
      return;
    }
    if (!this.subscriptionsFor(client).has(conversationId)) {
      this.emitError(client, { code: CHAT_WS_ERROR_CODES.NOT_SUBSCRIBED, conversationId });
      return;
    }

    const key = `${user.sub}:${conversationId}`;
    const now = Date.now();
    const lastRelayAt = this.lastTypingRelayAt.get(key) ?? Number.NEGATIVE_INFINITY;
    if (now - lastRelayAt < TYPING_DEBOUNCE_MS) {
      return;
    }
    this.lastTypingRelayAt.set(key, now);
    this.server?.to(chatRooms.conversation(conversationId)).emit('typing', {
      conversationId,
      userId: user.sub,
    });
  }

  // --- ChatEmitter (server → client, called by ConversationsService) ---

  /** `message:new` to the conversation room (sender included — reconcile by id). */
  emitMessageNew(payload: MessageNewEvent): void {
    this.server?.to(chatRooms.conversation(payload.conversationId)).emit('message:new', payload);
  }

  /**
   * `conversation:updated` to the OTHER participant's user room only — the
   * sender already sees the thread live via `message:new`.
   */
  emitConversationUpdated(recipientId: string, payload: ConversationUpdatedEvent): void {
    this.server?.to(chatRooms.user(recipientId)).emit('conversation:updated', payload);
  }

  /** `message:read` to the conversation room (read ticks flip on both sides). */
  emitMessageRead(payload: MessageReadEvent): void {
    this.server?.to(chatRooms.conversation(payload.conversationId)).emit('message:read', payload);
  }

  // --- internals ---

  /**
   * Handshake middleware body: extract the bearer token (auth.token primary,
   * Authorization header fallback) and verify it through TokenService — the
   * exact same verification REST requests go through. Any failure rejects the
   * handshake; the raw reason is logged for operators but only an opaque
   * WsException reaches the client.
   */
  private async authorizeHandshake(
    socket: ChatSocket,
    next: (err?: ExtendedError) => void,
  ): Promise<void> {
    try {
      socket.data.user = await this.authenticate(extractHandshakeToken(socket));
      next();
    } catch (error) {
      this.logger.debug(
        `Handshake rejected: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      next(new WsException(CHAT_WS_ERROR_CODES.UNAUTHORIZED));
    }
  }

  /** Verifies the access token, reusing TokenService (the REST verification). */
  private async authenticate(token: string | undefined): Promise<AuthUser> {
    if (!token) {
      throw new WsException(CHAT_WS_ERROR_CODES.UNAUTHORIZED);
    }
    return this.tokenService.verifyAccessToken(token);
  }

  /**
   * The authenticated user of a live socket. The handshake middleware
   * guarantees it for every connected socket; a miss means a middleware bypass
   * (bug), so the socket is dropped on the spot.
   */
  private requireUser(client: ChatSocket): AuthUser {
    const user = client.data.user;
    if (!user) {
      this.logger.warn(`Socket ${client.id} without an authenticated user — disconnecting`);
      client.disconnect(true);
      throw new WsException(CHAT_WS_ERROR_CODES.UNAUTHORIZED);
    }
    return user;
  }

  /** The socket's server-verified subscription set (created lazily). */
  private subscriptionsFor(client: ChatSocket): Set<string> {
    let subscriptions = this.subscriptions.get(client);
    if (!subscriptions) {
      subscriptions = new Set<string>();
      this.subscriptions.set(client, subscriptions);
    }
    return subscriptions;
  }

  private emitError(client: ChatSocket, payload: ConversationErrorEvent): void {
    client.emit('conversation:error', payload);
  }
}

/** Narrow the raw event payload to its contracted shape (unknown + narrowing). */
function readConversationId(payload: unknown): string | undefined {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'conversationId' in payload &&
    typeof payload.conversationId === 'string' &&
    payload.conversationId.length > 0
  ) {
    return payload.conversationId;
  }
  return undefined;
}

/**
 * Handshake credential extraction. PRIMARY: `handshake.auth.token` — what
 * socket.io-client sends via `io(url, { auth: { token } })`. FALLBACK: the
 * `Authorization: Bearer …` HTTP header of the polling request, for clients
 * that cannot set socket.io auth data (curl/CI probes).
 */
function extractHandshakeToken(socket: ChatSocket): string | undefined {
  const authToken: unknown = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return undefined;
}
